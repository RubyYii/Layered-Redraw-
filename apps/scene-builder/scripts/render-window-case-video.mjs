import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright-core";
import { createServer } from "vite";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const caseRoot = path.join(projectRoot, "projects", "window-case");
const projectPath = path.join(caseRoot, "window-that-wasnt-there.blockout.json");
const manifestPath = path.join(caseRoot, "shot-manifest.json");
const artifactDir = path.join(projectRoot, "artifacts", "window-case-video");
const storageKey = "blockout-studio.project.v3";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

if (!fs.existsSync(projectPath) || !fs.existsSync(manifestPath)) {
  throw new Error("缺少窗口案例项目；请先运行 npm run build:window-case。");
}

const projectText = fs.readFileSync(projectPath, "utf8");
const project = JSON.parse(projectText);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const timelineDuration = Number(project.director?.timeline?.duration ?? 0);
const start = Math.max(0, Math.min(Number(valueAfter("--start", 0)) || 0, timelineDuration));
const requestedDuration = Number(valueAfter("--duration", timelineDuration - start));
const duration = Math.max(0.25, Math.min(requestedDuration || timelineDuration - start, timelineDuration - start));
const end = Math.min(start + duration, timelineDuration);
const defaultOutput = path.join(artifactDir, "window-that-wasnt-there-previz.webm");
const outputPath = path.resolve(valueAfter("--output", defaultOutput));

if (timelineDuration !== 166 || manifest.shots?.length !== 19) {
  throw new Error(`时间线输入异常：${timelineDuration}s / ${manifest.shots?.length ?? 0} 镜。`);
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到用于视频渲染的 Chrome 或 Edge。");

const ffmpegCandidates = [
  process.env.BLOCKOUT_FFMPEG_PATH,
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright", "ffmpeg-1011", "ffmpeg-win64.exe")
    : null,
].filter(Boolean);
const ffmpegPath = ffmpegCandidates.find((candidate) => fs.existsSync(candidate));
if (!ffmpegPath) throw new Error("未找到用于补写 WebM 时长索引的 FFmpeg。");

const server = await createServer({
  root: projectRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 5173, strictPort: false },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === "object" && address ? address.port : 5173;
  const appUrl = `http://127.0.0.1:${port}/?renderQuality=full`;

  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--allow-file-access-from-files",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    localStorage.removeItem("blockout-studio.project.v2");
    localStorage.removeItem("blockout-studio.project");
  }, { key: storageKey, value: projectText });

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("#viewport canvas");
  await page.locator('[data-director-mode="preview"]').click();
  await page.waitForSelector("#preview-indicator:not([hidden])");
  await page.addStyleTag({
    content: `
      html,body,#app{width:1280px!important;height:720px!important;overflow:hidden!important;background:#070909!important}
      .app-shell{display:grid!important;grid-template-rows:720px!important}
      .topbar,#director-dock,.statusbar,.library-panel,.inspector-panel{display:none!important}
      .workspace{display:block!important;width:1280px!important;height:720px!important}
      .viewport-shell{width:1280px!important;height:720px!important}
      .viewport-tools,.camera-tools,.viewport-axis,#preview-indicator,#simulation-indicator,#performance-indicator,.dialogue-overlay{display:none!important}
    `,
  });

  await page.locator("#timeline-scrubber").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, start);
  await page.waitForTimeout(500);

  const compositorState = await page.evaluate(({ shots, transitionMs }) => {
    const source = document.querySelector("#viewport canvas");
    const viewport = document.querySelector("#viewport");
    const composite = document.createElement("canvas");
    composite.id = "video-capture-canvas";
    composite.width = 1280;
    composite.height = 720;
    Object.assign(composite.style, {
      position: "absolute",
      inset: "0",
      width: "1280px",
      height: "720px",
      zIndex: "20",
      pointerEvents: "none",
    });
    viewport.append(composite);

    const context = composite.getContext("2d", { alpha: false });
    const lastFrame = document.createElement("canvas");
    const previousFrame = document.createElement("canvas");
    for (const canvas of [lastFrame, previousFrame]) {
      canvas.width = 1280;
      canvas.height = 720;
    }
    const lastContext = lastFrame.getContext("2d", { alpha: false });
    const previousContext = previousFrame.getContext("2d", { alpha: false });
    const scrubber = document.querySelector("#timeline-scrubber");

    const shotIndexAt = (time) => {
      let result = 0;
      for (let index = 0; index < shots.length; index += 1) {
        if (time >= shots[index].start) result = index;
        else break;
      }
      return result;
    };

    let lastShotIndex = shotIndexAt(Number(scrubber.value) || 0);
    let transitionStartedAt = -1;
    const draw = (timestamp) => {
      const time = Number(scrubber.value) || 0;
      const shotIndex = shotIndexAt(time);
      if (shotIndex !== lastShotIndex) {
        previousContext.clearRect(0, 0, 1280, 720);
        previousContext.drawImage(lastFrame, 0, 0, 1280, 720);
        transitionStartedAt = timestamp;
        lastShotIndex = shotIndex;
      }

      context.globalAlpha = 1;
      context.fillStyle = "#050706";
      context.fillRect(0, 0, 1280, 720);
      context.drawImage(source, 0, 0, 1280, 720);
      if (transitionStartedAt >= 0) {
        const raw = Math.min(1, Math.max(0, (timestamp - transitionStartedAt) / transitionMs));
        const eased = raw * raw * (3 - 2 * raw);
        if (raw < 1) {
          context.globalAlpha = 1 - eased;
          context.drawImage(previousFrame, 0, 0, 1280, 720);
          context.globalAlpha = 1;
        } else {
          transitionStartedAt = -1;
        }
      }

      const vignette = context.createRadialGradient(640, 340, 180, 640, 340, 760);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.72, "rgba(0,0,0,0.08)");
      vignette.addColorStop(1, "rgba(0,0,0,0.62)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, 1280, 720);
      context.fillStyle = "#020303";
      context.fillRect(0, 0, 1280, 24);
      context.fillRect(0, 696, 1280, 24);

      lastContext.clearRect(0, 0, 1280, 720);
      lastContext.drawImage(composite, 0, 0, 1280, 720);
      window.__blockoutCompositorFrame = requestAnimationFrame(draw);
    };
    window.__blockoutCompositorFrame = requestAnimationFrame(draw);
    return { width: composite.width, height: composite.height, transitionMs, shotCount: shots.length };
  }, { shots: manifest.shots.map(({ id, start }) => ({ id, start })), transitionMs: 160 });
  await page.waitForTimeout(240);

  const captureState = await page.locator("#video-capture-canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const mimeTypes = [
      "video/webm;codecs=vp8",
      "video/webm;codecs=vp9",
      "video/webm",
    ];
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hasCaptureStream: typeof canvas.captureStream === "function",
      mimeType: mimeTypes.find((value) => MediaRecorder.isTypeSupported(value)) ?? null,
    };
  });
  if (captureState.width !== 1280 || captureState.height !== 720) {
    throw new Error(`录制画布尺寸异常：${captureState.width}×${captureState.height}`);
  }
  if (!captureState.hasCaptureStream || !captureState.mimeType) {
    throw new Error(`浏览器不支持画布视频录制：${JSON.stringify(captureState)}`);
  }

  const recordingState = await page.evaluate(async ({ mimeType, filename, timelineStart, timelineEnd }) => {
    const canvas = document.querySelector("#video-capture-canvas");
    const videoStream = canvas.captureStream(24);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass({ sampleRate: 48_000 });
    const destination = audioContext.createMediaStreamDestination();

    const roomBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
    const roomData = roomBuffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < roomData.length; index += 1) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.018 * white) / 1.018;
      roomData[index] = brown * 0.075;
    }
    const roomSource = audioContext.createBufferSource();
    roomSource.buffer = roomBuffer;
    roomSource.loop = true;
    const roomFilter = audioContext.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.value = 520;
    const roomGain = audioContext.createGain();
    roomGain.gain.value = 0.16;
    roomSource.connect(roomFilter).connect(roomGain).connect(destination);

    const humNodes = [
      { frequency: 46, gain: 0.0042 },
      { frequency: 92, gain: 0.0014 },
    ].map(({ frequency, gain }) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const gainNode = audioContext.createGain();
      gainNode.gain.value = gain;
      oscillator.connect(gainNode).connect(destination);
      oscillator.start();
      return oscillator;
    });
    roomSource.start();
    await audioContext.resume();

    const eventSpecs = [
      [30.05, 260, 0.5, 0.012],
      [39.02, 180, 0.45, 0.01],
      [50.25, 620, 0.16, 0.012],
      [57.15, 82, 0.42, 0.026],
      [58.4, 66, 0.55, 0.024],
      [64.1, 430, 0.2, 0.014],
      [66.6, 74, 0.5, 0.022],
      [78.2, 410, 0.2, 0.014],
      [79.3, 70, 0.5, 0.022],
      [90.15, 330, 0.28, 0.014],
      [100.7, 150, 0.35, 0.016],
      [106.0, 88, 0.5, 0.022],
      [114.0, 54, 1.1, 0.026],
      [120.05, 68, 0.55, 0.025],
      [130.0, 285, 0.28, 0.014],
      [133.5, 520, 0.34, 0.012],
      [138.0, 220, 0.7, 0.012],
      [147.2, 64, 0.7, 0.026],
      [154.0, 190, 0.35, 0.01],
    ].filter(([time]) => time >= timelineStart && time <= timelineEnd);
    for (const [time, frequency, toneDuration, peak] of eventSpecs) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = frequency < 100 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      const eventGain = audioContext.createGain();
      const beginsAt = audioContext.currentTime + Math.max(0.04, time - timelineStart);
      eventGain.gain.setValueAtTime(0.0001, beginsAt);
      eventGain.gain.exponentialRampToValueAtTime(peak, beginsAt + 0.025);
      eventGain.gain.exponentialRampToValueAtTime(0.0001, beginsAt + toneDuration);
      oscillator.connect(eventGain).connect(destination);
      oscillator.start(beginsAt);
      oscillator.stop(beginsAt + toneDuration + 0.04);
    }

    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
      audioBitsPerSecond: 64_000,
    });
    const chunks = [];
    let resolveStopped;
    let rejectStopped;
    const stopped = new Promise((resolve, reject) => {
      resolveStopped = resolve;
      rejectStopped = reject;
    });

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      rejectStopped(event.error ?? new Error("MediaRecorder failed"));
    });
    recorder.addEventListener("stop", () => {
      roomSource.stop();
      humNodes.forEach((oscillator) => oscillator.stop());
      audioContext.close();
      const blob = new Blob(chunks, { type: mimeType });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      resolveStopped({ size: blob.size, mimeType: blob.type, chunks: chunks.length });
    });

    window.__blockoutVideoRecorder = recorder;
    window.__blockoutVideoStopped = stopped;
    recorder.start(1000);
    return {
      state: recorder.state,
      mimeType: recorder.mimeType,
      audioTracks: stream.getAudioTracks().length,
      roomTone: "procedural room tone + 46/92 Hz system hum",
      scheduledEventTones: eventSpecs.length,
    };
  }, {
    mimeType: captureState.mimeType,
    filename: path.basename(outputPath),
    timelineStart: start,
    timelineEnd: end,
  });

  const startedAt = Date.now();
  await page.locator("#timeline-play").evaluate((button) => button.click());
  await page.waitForFunction(
    (target) => Number(document.querySelector("#timeline-scrubber")?.value ?? 0) >= target - 0.035,
    end,
    { timeout: Math.ceil((duration + 35) * 1000), polling: 100 },
  );
  if (end < timelineDuration - 0.01) await page.locator("#timeline-play").evaluate((button) => button.click());
  await page.waitForTimeout(180);

  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  const stoppedPromise = page.evaluate(() => {
    const recorder = window.__blockoutVideoRecorder;
    if (!recorder || recorder.state === "inactive") throw new Error("录制器未运行。");
    recorder.requestData();
    recorder.stop();
    return window.__blockoutVideoStopped;
  });
  const download = await downloadPromise;
  const stoppedState = await stoppedPromise;
  const rawOutputPath = `${outputPath}.${process.pid}.raw.webm`;
  await download.saveAs(rawOutputPath);
  const remux = spawnSync(ffmpegPath, [
    "-y",
    "-i", rawOutputPath,
    "-c", "copy",
    outputPath,
  ], { encoding: "utf8" });
  fs.rmSync(rawOutputPath, { force: true });
  if (remux.status !== 0 || !fs.existsSync(outputPath)) {
    throw new Error(`WebM 重封装失败：${remux.stderr?.slice(-2000) ?? "unknown error"}`);
  }
  const wallDuration = (Date.now() - startedAt) / 1000;

  const probePage = await context.newPage();
  await probePage.goto(pathToFileURL(outputPath).href, { waitUntil: "domcontentloaded" });
  await probePage.waitForSelector("video");
  const media = await probePage.locator("video").evaluate(async (video) => {
    if (video.readyState < 1) {
      await new Promise((resolve, reject) => {
        video.addEventListener("loadedmetadata", resolve, { once: true });
        video.addEventListener("error", () => reject(video.error ?? new Error("video probe failed")), { once: true });
      });
    }
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  });
  await probePage.close();

  if (media.width !== 1280 || media.height !== 720) {
    throw new Error(`成片尺寸异常：${media.width}×${media.height}`);
  }
  if (Math.abs(media.duration - duration) > 1.2) {
    throw new Error(`成片时长异常：期望 ${duration.toFixed(2)}s，实际 ${media.duration.toFixed(2)}s。`);
  }
  if (consoleErrors.length) throw new Error(`浏览器控制台出现错误：${consoleErrors.join(" | ")}`);

  const result = {
    ok: true,
    outputPath,
    fileSize: fs.statSync(outputPath).size,
    start,
    end,
    requestedDuration: duration,
    wallDuration,
    captureState,
    compositorState,
    recordingState,
    stoppedState,
    remux: { ffmpegPath, exitCode: remux.status },
    media,
  };
  const reportName = outputPath === defaultOutput ? "video-render-report.json" : `${path.parse(outputPath).name}.report.json`;
  const reportPath = path.join(path.dirname(outputPath), reportName);
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...result, reportPath }, null, 2)}\n`);
  await context.close();
} finally {
  await browser?.close().catch(() => {});
  await server.close();
}
