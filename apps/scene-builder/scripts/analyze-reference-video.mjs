import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

const videoPath = process.argv[2];
if (!videoPath || !fs.existsSync(videoPath)) {
  throw new Error("请传入存在的 MP4 文件路径。");
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(projectRoot, "artifacts", "reference-video-review");
fs.mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于解码视频的 Chrome 或 Edge。");

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--allow-file-access-from-files",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-gpu-sandbox",
    "--disable-dev-shm-usage",
  ],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const videoUrl = pathToFileURL(path.resolve(videoPath)).href;

const seek = async (time) => {
  await page.locator("video").evaluate(async (video, target) => {
    video.pause();
    if (Math.abs(video.currentTime - target) < 0.02 && video.readyState >= 2) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`seek timeout at ${target}`)), 5000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      video.addEventListener("seeked", done, { once: true });
      video.currentTime = target;
    });
  }, time);
};

const pixelSample = async () => page.locator("video").evaluate((video) => {
  let canvas = document.querySelector("canvas[data-probe]");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.dataset.probe = "true";
    canvas.width = 64;
    canvas.height = 36;
    canvas.hidden = true;
    document.body.append(canvas);
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return [...context.getImageData(0, 0, canvas.width, canvas.height).data];
});

const frameDifference = (before, after) => {
  let total = 0;
  for (let index = 0; index < before.length; index += 4) {
    total += Math.abs(after[index] - before[index]);
    total += Math.abs(after[index + 1] - before[index + 1]);
    total += Math.abs(after[index + 2] - before[index + 2]);
  }
  return total / ((before.length / 4) * 3 * 255);
};

const timestamp = (seconds) => {
  const rounded = Math.round(seconds * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const remainder = (rounded - minutes * 60).toFixed(1).padStart(4, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
};

try {
  await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("video");
  await page.locator("video").evaluate(async (video) => {
    video.controls = false;
    video.muted = true;
    video.pause();
    if (video.readyState >= 1) return;
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(video.error ?? new Error("video load failed")), { once: true });
    });
  });

  const metadata = await page.locator("video").evaluate((video) => ({
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    currentSrc: video.currentSrc,
  }));
  if (!Number.isFinite(metadata.duration) || !metadata.width || !metadata.height) {
    throw new Error(`视频元数据异常：${JSON.stringify(metadata)}`);
  }

  const probeStep = 0.5;
  const probeTimes = [];
  for (let time = 0; time < metadata.duration - 0.08; time += probeStep) {
    probeTimes.push(Math.min(time, metadata.duration - 0.08));
  }

  const changes = [];
  let previousPixels;
  for (const time of probeTimes) {
    await seek(time);
    const pixels = await pixelSample();
    if (previousPixels) changes.push({ time, difference: frameDifference(previousPixels, pixels) });
    previousPixels = pixels;
  }

  const rankedChanges = [...changes].sort((a, b) => b.difference - a.difference);
  const cutCandidates = [];
  for (const change of rankedChanges) {
    if (cutCandidates.every((candidate) => Math.abs(candidate.time - change.time) >= 1.5)) {
      cutCandidates.push(change);
    }
    if (cutCandidates.length >= 12) break;
  }
  cutCandidates.sort((a, b) => a.time - b.time);

  const uniformTimes = [];
  for (let time = 0.5; time < metadata.duration; time += 5) {
    uniformTimes.push(Math.min(time, metadata.duration - 0.08));
  }
  const captureTimes = [...uniformTimes];
  for (const candidate of cutCandidates) {
    if (captureTimes.every((time) => Math.abs(time - candidate.time) >= 0.75)) {
      captureTimes.push(candidate.time);
    }
  }
  captureTimes.sort((a, b) => a - b);

  const frames = [];
  for (const [index, time] of captureTimes.entries()) {
    await seek(time);
    const filename = `${String(index + 1).padStart(2, "0")}-${time.toFixed(1).padStart(5, "0").replace(".", "_")}s.png`;
    const output = path.join(artifactDir, filename);
    await page.locator("video").screenshot({ path: output });
    frames.push({ time, timestamp: timestamp(time), filename, output });
  }

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const cards = frames.map((frame) => {
    const data = fs.readFileSync(frame.output).toString("base64");
    const candidate = cutCandidates.find((cut) => Math.abs(cut.time - frame.time) < 0.01);
    const badge = candidate ? `<span>变化点 · ${candidate.difference.toFixed(3)}</span>` : "<span>均匀取样</span>";
    return `<article><img src="data:image/png;base64,${data}" alt="${escapeHtml(frame.timestamp)}"><div><b>${escapeHtml(frame.timestamp)}</b>${badge}</div></article>`;
  }).join("");

  const contactPage = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await contactPage.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:38px;background:#0b0d0d;color:#ebe8df;font-family:Inter,"Microsoft YaHei",sans-serif}
    header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:26px;padding-bottom:18px;border-bottom:1px solid #343937}
    h1{margin:0 0 8px;font-size:30px}p{margin:0;color:#98a09b}code{color:#e2bd63;font-size:14px}
    main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}article{background:#121615;border:1px solid #343937;overflow:hidden}
    img{display:block;width:100%;aspect-ratio:${metadata.width}/${metadata.height};object-fit:contain;background:#050606}article div{display:flex;justify-content:space-between;padding:11px 13px}
    b{color:#e2bd63;font:600 14px ui-monospace,Consolas,monospace}span{color:#7e8782;font:12px ui-monospace,Consolas,monospace}
  </style></head><body><header><div><h1>直接渲染视频 · 参考取样</h1><p>每 5 秒取样，并补充 0.5 秒探测中变化最大的画面</p></div><code>${metadata.width}×${metadata.height} · ${metadata.duration.toFixed(2)}s</code></header><main>${cards}</main></body></html>`, { waitUntil: "load" });
  await contactPage.waitForFunction(() => [...document.images].every((image) => image.complete));
  const contactSheet = path.join(artifactDir, "reference-video-contact-sheet.png");
  await contactPage.screenshot({ path: contactSheet, fullPage: true });
  await contactPage.close();

  const report = {
    ok: true,
    videoPath: path.resolve(videoPath),
    metadata,
    probeStep,
    cutCandidates,
    frames: frames.map(({ time, timestamp: label, filename }) => ({ time, timestamp: label, filename })),
    contactSheet,
  };
  const reportPath = path.join(artifactDir, "reference-video-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report, frames: report.frames.length, reportPath }, null, 2)}\n`);
} finally {
  await browser.close();
}
