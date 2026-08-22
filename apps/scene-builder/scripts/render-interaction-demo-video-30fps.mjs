import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright-core";
import { createServer } from "vite";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const projectPath = path.join(projectRoot, "projects", "interaction-lab", "interaction-simulation.blockout.json");
const artifactDir = path.join(projectRoot, "artifacts", "interaction-simulation");
const storageKey = "blockout-studio.project.v3";
const args = process.argv.slice(2);

const valueAfter = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

if (!fs.existsSync(projectPath)) throw new Error(`缺少交互仿真项目：${projectPath}`);
const projectText = fs.readFileSync(projectPath, "utf8");
const project = JSON.parse(projectText);
const timelineDuration = Number(project.director?.timeline?.duration ?? 0);
const ownershipClips = project.director?.timeline?.clips?.filter((clip) => clip.ownershipMode !== "none") ?? [];
if (timelineDuration !== 10 || ownershipClips.map((clip) => clip.ownershipMode).join(",") !== "claim,transfer,release") {
  throw new Error("交互仿真输入必须保持十秒以及 claim → transfer → release 三阶段。");
}

const fps = Math.max(1, Math.min(60, Math.round(Number(valueAfter("--fps", 30)) || 30)));
const jpegQuality = Math.max(50, Math.min(100, Math.round(Number(valueAfter("--quality", 90)) || 90)));
const start = Math.max(0, Math.min(Number(valueAfter("--start", 0)) || 0, timelineDuration));
const requestedDuration = Number(valueAfter("--duration", timelineDuration - start));
const duration = Math.max(1 / fps, Math.min(requestedDuration || timelineDuration - start, timelineDuration - start));
const frameCount = Math.max(1, Math.round(duration * fps));
const encodedDuration = frameCount / fps;
const defaultOutput = path.join(artifactDir, "interaction-simulation-30fps.webm");
const outputPath = path.resolve(valueAfter("--output", defaultOutput));

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到用于逐帧渲染的 Chrome 或 Edge。");

const ffmpegCandidates = [
  process.env.BLOCKOUT_FFMPEG_PATH,
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/usr/bin/ffmpeg",
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright", "ffmpeg-1011", "ffmpeg-win64.exe")
    : null,
].filter(Boolean);
const ffmpegPath = ffmpegCandidates.find((candidate) => fs.existsSync(candidate));
if (!ffmpegPath) throw new Error("未找到支持 MJPEG 输入与 VP8 输出的 FFmpeg。");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const server = await createServer({
  root: projectRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 5174, strictPort: false },
});

let browser;
let context;
try {
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === "object" && address ? address.port : 5174;
  const appUrl = `http://127.0.0.1:${port}/?renderQuality=full`;

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
    ],
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
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
  await page.waitForSelector("#simulation-indicator:not([hidden])");
  await page.addStyleTag({
    content: `
      html,body,#app{width:1280px!important;height:720px!important;overflow:hidden!important;background:#070909!important}
      .app-shell{display:grid!important;grid-template-rows:720px!important}
      .topbar,#director-dock,.statusbar,.library-panel,.inspector-panel{display:none!important}
      .workspace{display:block!important;width:1280px!important;height:720px!important}
      .viewport-shell,.viewport{width:1280px!important;height:720px!important}
      .viewport-tools,.camera-tools,.viewport-axis,#preview-indicator,#simulation-indicator,#performance-indicator,.dialogue-overlay{display:none!important}
    `,
  });
  await page.waitForTimeout(250);

  const rendererState = await page.locator("#viewport canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return { width: Math.round(rect.width), height: Math.round(rect.height), hasWebgl: Boolean(gl) };
  });
  if (!rendererState.hasWebgl || rendererState.width !== 1280 || rendererState.height !== 720) {
    throw new Error(`3D 渲染器状态异常：${JSON.stringify(rendererState)}`);
  }

  const seek = async (time) => page.locator("#timeline-scrubber").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, time);
  await seek(start);
  await page.waitForTimeout(80);

  const viewport = page.locator("#viewport");
  const milestones = {};
  const auditFrames = {};
  for (const [label, time] of Object.entries({
    pickup: 3,
    carryA: 4.2,
    handoff: 5.95,
    carryB: 7.2,
    place: 8.65,
    placed: 9.6,
  })) {
    await seek(time);
    milestones[label] = await page.evaluate(() => ({
      phase: document.querySelector("#simulation-phase")?.textContent,
      detail: document.querySelector("#simulation-detail")?.textContent,
      state: document.querySelector("#simulation-indicator")?.dataset.state,
    }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const auditPath = path.join(artifactDir, `collision-${label}.png`);
    await viewport.screenshot({ path: auditPath, type: "png" });
    auditFrames[label] = auditPath;
  }
  const unsafeMilestone = Object.entries(milestones)
    .find(([, milestone]) => !milestone.detail?.includes("残余 0.000m"));
  if (unsafeMilestone) {
    throw new Error(`关键帧仍有穿透：${unsafeMilestone[0]} · ${unsafeMilestone[1].detail}`);
  }
  await seek(start);

  const ffmpegArgs = [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(fps),
    "-vcodec", "mjpeg",
    "-i", "pipe:0",
    "-an",
    "-c:v", "libvpx",
    "-b:v", "7000k",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    outputPath,
  ];
  const encoder = spawn(ffmpegPath, ffmpegArgs, { stdio: ["pipe", "ignore", "pipe"] });
  const encoderErrors = [];
  encoder.stderr.on("data", (chunk) => {
    encoderErrors.push(chunk.toString());
    if (encoderErrors.length > 24) encoderErrors.shift();
  });
  const encoderExited = new Promise((resolve, reject) => {
    encoder.once("error", reject);
    encoder.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`固定帧率编码失败（exit ${code}）：${encoderErrors.join("").slice(-3000)}`));
    });
  });

  const startedAt = Date.now();
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const timelineTime = Math.min(start + frameIndex / fps, timelineDuration);
    await seek(timelineTime);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const jpeg = await viewport.screenshot({ type: "jpeg", quality: jpegQuality });
    if (!encoder.stdin.write(jpeg)) await once(encoder.stdin, "drain");
    if ((frameIndex + 1) % (fps * 2) === 0 || frameIndex + 1 === frameCount) {
      process.stdout.write(`${JSON.stringify({ phase: "frames", rendered: frameIndex + 1, total: frameCount })}\n`);
    }
  }
  encoder.stdin.end();
  await encoderExited;

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
  if (media.width !== 1280 || media.height !== 720 || Math.abs(media.duration - encodedDuration) > 0.25) {
    throw new Error(`视频验收失败：${JSON.stringify({ media, encodedDuration })}`);
  }
  if (consoleErrors.length) throw new Error(`浏览器控制台出现错误：${consoleErrors.join(" | ")}`);

  const probe = spawnSync(ffmpegPath, ["-hide_banner", "-i", outputPath], { encoding: "utf8" });
  const cadenceLine = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`
    .split(/\r?\n/)
    .find((line) => line.includes("Video:"))
    ?.trim() ?? null;
  const result = {
    ok: true,
    outputPath,
    reportPath: path.join(path.dirname(outputPath), `${path.parse(outputPath).name}.report.json`),
    fileSize: fs.statSync(outputPath).size,
    fps,
    frameCount,
    start,
    encodedDuration,
    wallDuration: (Date.now() - startedAt) / 1000,
    rendererState,
    media,
    milestones,
    auditFrames,
    cadenceLine,
    simulationBackend: "deterministic-kinematic",
    collisionBackend: "collision-proxy-v1",
    encoding: "deterministic 30fps JPEG pipe -> VP8 WebM",
  };
  fs.writeFileSync(result.reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server.close();
}
