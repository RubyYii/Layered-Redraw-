import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import { createServer } from "vite";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const caseRoot = path.join(projectRoot, "projects", "window-case");
const projectPath = path.join(caseRoot, "window-that-wasnt-there.blockout.json");
const manifestPath = path.join(caseRoot, "shot-manifest.json");
const artifactDir = path.join(projectRoot, "artifacts", "window-case-previz");
const storageKey = "blockout-studio.project.v3";

for (const requiredPath of [projectPath, manifestPath]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`缺少预演输入：${requiredPath}`);
}

fs.mkdirSync(artifactDir, { recursive: true });

const projectText = fs.readFileSync(projectPath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const project = JSON.parse(projectText);

if (manifest.shots.length !== 19) throw new Error(`镜头数量应为 19，实际为 ${manifest.shots.length}`);
if (project.director?.timeline?.duration !== 166) throw new Error("项目时间线不是 2:46。 ");
if (manifest.entities?.roles?.length !== 4) throw new Error("角色席位必须为 4 个。");
if (manifest.entities?.evidenceTraces?.length !== 3) throw new Error("证物痕迹必须为 3 类。");

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于 3D 预演渲染的 Chrome 或 Edge。");

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
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
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
  await page.waitForTimeout(500);

  const appState = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport canvas");
    const rect = canvas?.getBoundingClientRect();
    const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    return {
      projectName: document.querySelector("#project-name")?.value,
      objectCount: document.querySelectorAll(".hierarchy-row").length,
      timelineDuration: document.querySelector("#timeline-scrubber")?.max,
      canvas: { width: rect?.width ?? 0, height: rect?.height ?? 0, hasWebgl: Boolean(context) },
    };
  });

  if (!appState.canvas.hasWebgl) throw new Error("3D 视口没有建立 WebGL 上下文。");
  if (appState.objectCount !== project.objects.length) {
    throw new Error(`载入物体数不一致：界面 ${appState.objectCount} / 项目 ${project.objects.length}`);
  }
  if (Number(appState.timelineDuration) !== 166) {
    throw new Error(`界面时间线长度异常：${appState.timelineDuration}`);
  }

  await page.locator('[data-director-mode="preview"]').click();
  await page.waitForSelector("#preview-indicator:not([hidden])");

  await page.setViewportSize({ width: 1280, height: 720 });
  const cleanPreviewStyle = await page.addStyleTag({
    content: `
      html,body,#app{width:1280px!important;height:720px!important;overflow:hidden!important}
      .app-shell{display:grid!important;grid-template-rows:720px!important}
      .topbar,#director-dock,.statusbar,.library-panel,.inspector-panel{display:none!important}
      .workspace{display:block!important;width:1280px!important;height:720px!important}
      .viewport-shell{width:1280px!important;height:720px!important}
      .viewport-tools,.camera-tools,.viewport-axis,#preview-indicator,#performance-indicator,.dialogue-overlay{display:none!important}
    `,
  });
  await page.waitForTimeout(240);
  const captureSize = await page.locator("#viewport canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  if (captureSize.width !== 1280 || captureSize.height !== 720) {
    throw new Error(`关键帧视口尺寸异常：${captureSize.width}×${captureSize.height}`);
  }

  const renderedShots = [];
  for (const shot of manifest.shots) {
    const sampleTime = Math.min(
      shot.start + Math.min(shot.duration * 0.55, 4),
      shot.start + shot.duration - 0.3,
    );
    await page.locator("#timeline-scrubber").evaluate((input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, sampleTime);
    await page.waitForTimeout(140);

    const filename = `${String(renderedShots.length + 1).padStart(2, "0")}-${shot.id.toLowerCase()}.png`;
    const output = path.join(artifactDir, filename);
    await page.locator("#viewport canvas").screenshot({ path: output });
    renderedShots.push({ ...shot, sampleTime, filename, output });
  }

  const authorised = manifest.shots.find((shot) => shot.id === "B8-01");
  await page.locator("#timeline-scrubber").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, authorised.start + 0.3);
  await page.waitForTimeout(140);
  await cleanPreviewStyle.evaluate((element) => element.remove());
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(80);
  const appScreenshot = path.join(artifactDir, "window-case-in-blockout-studio.png");
  await page.screenshot({ path: appScreenshot, fullPage: true });

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const cards = renderedShots.map((shot) => {
    const data = fs.readFileSync(shot.output).toString("base64");
    const timestamp = `${String(Math.floor(shot.start / 60)).padStart(2, "0")}:${String(shot.start % 60).padStart(2, "0")}`;
    return `<article><img src="data:image/png;base64,${data}" alt="${escapeHtml(shot.id)}"><div><b>${escapeHtml(shot.id)}</b><span>${timestamp} · ${shot.duration}s</span><p>${escapeHtml(shot.note)}</p></div></article>`;
  }).join("");

  const contactPage = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await contactPage.setContent(`<!doctype html>
    <html lang="zh-CN"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;padding:42px;background:#090b0b;color:#e7e3da;font-family:Inter,"Microsoft YaHei",sans-serif}
      header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:30px;border-bottom:1px solid #3b403e;padding-bottom:20px}
      h1{font-size:32px;line-height:1;margin:0 0 10px;font-weight:620}header p{margin:0;color:#9ca39f}header code{color:#e2bd63;font-size:15px}
      main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
      article{border:1px solid #343937;background:#111514;overflow:hidden}img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#050608}
      article div{padding:13px 15px 16px;min-height:104px;position:relative}b{font:600 16px ui-monospace,Consolas,monospace;color:#e2bd63}
      span{position:absolute;right:15px;top:14px;color:#7f8984;font:12px ui-monospace,Consolas,monospace}article p{margin:9px 0 0;color:#bdc4c0;font-size:13px;line-height:1.45}
      footer{margin-top:24px;color:#6f7773;font:12px ui-monospace,Consolas,monospace}
    </style></head><body><header><div><h1>不存在的窗 · 3D 镜头预演</h1><p>同一房间几何 · 19 镜 · 证物 / 推断 / 授权 / 拒绝</p></div><code>02:46 · 24 FPS</code></header><main>${cards}</main><footer>BLOCKOUT STUDIO · CASE 01 · CONSTRUCTED TEST CASE</footer></body></html>`, { waitUntil: "load" });
  await contactPage.waitForFunction(() => [...document.images].every((image) => image.complete));
  const contactSheet = path.join(artifactDir, "window-case-contact-sheet.png");
  await contactPage.screenshot({ path: contactSheet, fullPage: true });
  await contactPage.close();

  if (consoleErrors.length) throw new Error(`浏览器控制台出现错误：${consoleErrors.join(" | ")}`);

  fs.writeFileSync(path.join(artifactDir, "render-report.json"), `${JSON.stringify({
    ok: true,
    appUrl,
    executablePath,
    appState,
    captureSize,
    shotCount: renderedShots.length,
    renderedShots: renderedShots.map(({ id, start, duration, sampleTime, filename }) => ({ id, start, duration, sampleTime, filename })),
    appScreenshot,
    contactSheet,
  }, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    appState,
    captureSize,
    shotCount: renderedShots.length,
    artifactDir,
    appScreenshot,
    contactSheet,
  }, null, 2)}\n`);
} finally {
  await browser?.close().catch(() => {});
  await server.close();
}
