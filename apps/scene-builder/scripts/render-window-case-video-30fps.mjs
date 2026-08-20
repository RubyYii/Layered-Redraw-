import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
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

const fps = Math.max(1, Math.min(60, Math.round(Number(valueAfter("--fps", 30)) || 30)));
const jpegQuality = Math.max(45, Math.min(100, Math.round(Number(valueAfter("--quality", 90)) || 90)));

for (const requiredPath of [projectPath, manifestPath]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`缺少渲染输入：${requiredPath}`);
}

const projectText = fs.readFileSync(projectPath, "utf8");
const project = JSON.parse(projectText);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const timelineDuration = Number(project.director?.timeline?.duration ?? 0);
const start = Math.max(0, Math.min(Number(valueAfter("--start", 0)) || 0, timelineDuration));
const requestedDuration = Number(valueAfter("--duration", timelineDuration - start));
const duration = Math.max(1 / fps, Math.min(requestedDuration || timelineDuration - start, timelineDuration - start));
const frameCount = Math.max(1, Math.round(duration * fps));
const encodedDuration = frameCount / fps;
const end = Math.min(start + encodedDuration, timelineDuration);
const defaultOutput = path.join(artifactDir, "window-that-wasnt-there-30fps.webm");
const outputPath = path.resolve(valueAfter("--output", defaultOutput));
const legacyVideoPath = path.join(artifactDir, "window-that-wasnt-there-previz.webm");
const videoOnlyPath = `${outputPath}.${process.pid}.video-only.webm`;

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
if (!executablePath) throw new Error("未找到用于逐帧渲染的 Chrome 或 Edge。");

const ffmpegCandidates = [
  process.env.BLOCKOUT_FFMPEG_PATH,
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright", "ffmpeg-1011", "ffmpeg-win64.exe")
    : null,
].filter(Boolean);
const ffmpegPath = ffmpegCandidates.find((candidate) => fs.existsSync(candidate));
if (!ffmpegPath) throw new Error("未找到支持 MJPEG 输入与 VP8 输出的 FFmpeg。");

const runFfmpeg = (ffmpegArgs, label) => {
  const result = spawnSync(ffmpegPath, ffmpegArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${label}失败：${result.stderr?.slice(-3000) ?? "unknown error"}`);
  }
  return result;
};

const waitForExit = (processHandle, label, stderrChunks) => new Promise((resolve, reject) => {
  processHandle.once("error", reject);
  processHandle.once("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${label}失败（exit ${code}）：${stderrChunks.join("").slice(-3000)}`));
  });
});

const server = await createServer({
  root: projectRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 5173, strictPort: false },
});

let browser;
let context;
try {
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === "object" && address ? address.port : 5173;
  const appUrl = `http://127.0.0.1:${port}/`;

  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--enable-webgl",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--disable-gpu-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--allow-file-access-from-files",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
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
      .viewport-tools,.camera-tools,.viewport-axis,#preview-indicator,.dialogue-overlay{display:none!important}
    `,
  });
  await page.waitForTimeout(300);

  const rendererState = await page.locator("#viewport canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hasWebgl: Boolean(gl),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : "unknown",
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown",
    };
  });
  if (!rendererState.hasWebgl || rendererState.width !== 1280 || rendererState.height !== 720) {
    throw new Error(`3D 渲染器状态异常：${JSON.stringify(rendererState)}`);
  }

  await page.locator("#timeline-scrubber").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, start);
  await page.waitForTimeout(100);

  const compositorState = await page.evaluate((shotCount) => {
    const viewport = document.querySelector("#viewport");
    const overlay = document.createElement("div");
    overlay.id = "fixed-video-overlay";
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      width: "1280px",
      height: "720px",
      zIndex: "20",
      pointerEvents: "none",
      background: "radial-gradient(ellipse at 50% 47%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.08) 72%, rgba(0,0,0,0.62) 100%)",
      boxShadow: "inset 0 24px 0 #020303, inset 0 -24px 0 #020303",
    });
    viewport.append(overlay);
    const rect = viewport.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      transition: "hard cut",
      shotCount,
    };
  }, manifest.shots.length);
  if (compositorState.width !== 1280 || compositorState.height !== 720) {
    throw new Error(`视频视口尺寸异常：${JSON.stringify(compositorState)}`);
  }

  const ffmpegArgs = [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(fps),
    "-vcodec", "mjpeg",
    "-i", "pipe:0",
    "-an",
    "-c:v", "libvpx",
    "-b:v", "8000k",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    videoOnlyPath,
  ];
  const encoder = spawn(ffmpegPath, ffmpegArgs, { stdio: ["pipe", "ignore", "pipe"] });
  const encoderErrors = [];
  encoder.stderr.on("data", (chunk) => {
    encoderErrors.push(chunk.toString());
    if (encoderErrors.length > 24) encoderErrors.shift();
  });
  const encoderExited = waitForExit(encoder, "固定帧率视频编码", encoderErrors);

  const frameViewport = page.locator("#viewport");
  const startedAt = Date.now();
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const timelineTime = Math.min(start + frameIndex / fps, timelineDuration);
    await page.locator("#timeline-scrubber").evaluate((input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, timelineTime);
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const jpeg = await frameViewport.screenshot({ type: "jpeg", quality: jpegQuality });
    if (!encoder.stdin.write(jpeg)) await once(encoder.stdin, "drain");

    if ((frameIndex + 1) % (fps * 5) === 0 || frameIndex + 1 === frameCount) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const progress = (frameIndex + 1) / frameCount;
      const eta = progress > 0 ? elapsed * (1 / progress - 1) : 0;
      process.stdout.write(`${JSON.stringify({
        phase: "frames",
        rendered: frameIndex + 1,
        total: frameCount,
        timelineSeconds: Number(((frameIndex + 1) / fps).toFixed(2)),
        elapsedSeconds: Number(elapsed.toFixed(1)),
        etaSeconds: Number(eta.toFixed(1)),
      })}\n`);
    }
  }
  encoder.stdin.end();
  await encoderExited;

  // The legacy MediaRecorder audio carries container timestamps that are safe for
  // the full timeline but shift trimmed samples away from zero. Keep samples
  // video-only so their fixed frame timestamps remain exact.
  const isFullTimeline = start === 0 && Math.abs(encodedDuration - timelineDuration) < 1 / fps;
  const audioAvailable = isFullTimeline && fs.existsSync(legacyVideoPath)
    && path.resolve(legacyVideoPath).toLowerCase() !== outputPath.toLowerCase();
  let audioSource = null;
  if (audioAvailable) {
    const muxArgs = ["-y", "-i", videoOnlyPath];
    if (start > 0) muxArgs.push("-ss", String(start));
    muxArgs.push(
      "-i", legacyVideoPath,
      "-map", "0:v:0",
      "-map", "1:a:0?",
      "-c", "copy",
      "-t", String(encodedDuration),
      outputPath,
    );
    runFfmpeg(muxArgs, "音画合成");
    fs.rmSync(videoOnlyPath, { force: true });
    audioSource = legacyVideoPath;
  } else {
    fs.rmSync(outputPath, { force: true });
    fs.renameSync(videoOnlyPath, outputPath);
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
  if (Math.abs(media.duration - encodedDuration) > 0.35) {
    throw new Error(`成片时长异常：期望 ${encodedDuration.toFixed(3)}s，实际 ${media.duration.toFixed(3)}s。`);
  }
  if (consoleErrors.length) throw new Error(`浏览器控制台出现错误：${consoleErrors.join(" | ")}`);

  const probe = spawnSync(ffmpegPath, ["-hide_banner", "-i", outputPath], { encoding: "utf8" });
  const probeText = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`;
  const cadenceLine = probeText.split(/\r?\n/).find((line) => line.includes("Video:"))?.trim() ?? null;
  const result = {
    ok: true,
    outputPath,
    fileSize: fs.statSync(outputPath).size,
    fps,
    frameCount,
    start,
    end,
    requestedDuration: duration,
    encodedDuration,
    wallDuration,
    jpegQuality,
    rendererState,
    compositorState,
    audioSource,
    media,
    cadenceLine,
    encoding: "deterministic fixed-step JPEG pipe -> VP8 WebM",
  };
  const reportPath = path.join(
    path.dirname(outputPath),
    `${path.parse(outputPath).name}.report.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...result, reportPath }, null, 2)}\n`);
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server.close();
}
