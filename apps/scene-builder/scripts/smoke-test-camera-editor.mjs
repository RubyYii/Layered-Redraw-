import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const root = process.cwd();
const urlArgument = process.argv.indexOf("--url");
const baseUrl = urlArgument >= 0 ? process.argv[urlArgument + 1] : "http://127.0.0.1:5173/";
const projectPath = path.join(root, "projects", "window-case", "window-that-wasnt-there.blockout.json");
const screenshotPath = path.join(root, "artifacts", "blockout-studio-camera-editor.png");
const compactScreenshotPath = path.join(root, "artifacts", "blockout-studio-camera-editor-compact.png");
fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于电影镜头编辑器 smoke 的 Chrome 或 Edge。");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(20_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  console.log(`[camera-smoke] opening ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#viewport canvas");
  console.log("[camera-smoke] loading 166 second project");
  await page.locator("#project-file").setInputFiles(projectPath);
  await page.waitForFunction(() => document.querySelectorAll('.timeline-clip[data-track="camera"]').length === 19);

  console.log("[camera-smoke] opening editor and editing selected shot");
  const originalTimelineCount = await page.locator(".timeline-clip").count();
  await page.locator("#camera-editor-toggle").click();
  assert(await page.locator("#camera-editor-panel").isVisible(), "电影镜头编辑器没有打开。");
  assert(await page.locator(".camera-shot-row").count() === 19, "166 秒工程应显示 19 个镜头。");
  assert(await page.locator(".camera-shot-row.is-selected").count() === 1, "镜头列表没有唯一选中项。");

  await page.locator('[data-camera-preview="from"]').click();
  await page.locator("#camera-shot-label").fill("B1-01 · 镜头编辑器验收");
  await page.locator("#camera-shot-label").press("Tab");
  await page.waitForFunction(() => document.querySelector('.timeline-clip[data-track="camera"]')?.textContent.includes("镜头编辑器验收"));
  assert(await page.locator(".timeline-clip").count() === originalTimelineCount, "编辑镜头意外重建或删除了其他时间线片段。");

  await page.locator("#camera-shot-from-fov").fill("38");
  await page.locator("#camera-shot-from-fov").press("Tab");
  await page.locator('[data-camera-capture="from"]').click();
  assert((await page.locator("#toast").textContent())?.includes("起点 A"), "当前视口没有被记录为镜头起点。");

  await page.locator(".camera-path-editor summary").click();
  await page.locator("#camera-path-build").click();
  const pathLines = (await page.locator("#camera-position-path").inputValue()).trim().split(/\r?\n/);
  assert(pathLines.length === 3, "A/B 三点相机路径没有生成。");

  console.log("[camera-smoke] checking duplicate and undo");
  await page.locator("#camera-shot-duplicate").click();
  assert(await page.locator(".camera-shot-row").count() === 20, "复制镜头没有生成第 20 个镜头。");
  await page.locator("#undo").click();
  assert(await page.locator(".camera-shot-row").count() === 19, "撤销没有恢复复制前的 19 个镜头。");

  await page.locator(".camera-path-editor").evaluate((details) => { details.open = false; });
  await page.locator("#camera-editor-panel").evaluate((panel) => { panel.scrollTop = 0; });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log("[camera-smoke] checking bounded shot playback");
  await page.locator("#camera-shot-play").click();
  assert(await page.locator("#camera-editor-panel").isHidden(), "播放镜头时编辑面板没有收起。");
  assert(await page.locator("#timeline-play").evaluate((node) => node.classList.contains("is-playing")), "单镜头区间没有开始播放。");
  await page.keyboard.press("Escape");
  assert(await page.locator('[data-director-mode="edit"]').getAttribute("aria-pressed") === "true", "Escape 没有返回编辑模式。");

  await page.locator('.timeline-clip[data-track="camera"]').first().click();
  assert(await page.locator("#camera-editor-panel").isVisible(), "单击镜头轨道没有重新打开镜头编辑器。");
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(350);
  await page.locator("#camera-editor-panel").evaluate((panel) => { panel.scrollTop = 0; });
  const compactBounds = await page.locator("#camera-editor-panel").boundingBox();
  assert(compactBounds && compactBounds.x >= 0 && compactBounds.x + compactBounds.width <= 700, "紧凑布局中的镜头面板超出视口。");
  assert(await page.locator(".camera-editor-heading").isVisible(), "紧凑布局没有显示镜头编辑器标题。");
  await page.screenshot({ path: compactScreenshotPath, fullPage: true });
  assert(errors.length === 0, `页面出现控制台错误：${errors.join(" | ")}`);

  console.log(JSON.stringify({
    ok: true,
    project: path.relative(root, projectPath),
    cameraShots: 19,
    timelineClipsPreserved: originalTimelineCount,
    screenshot: path.relative(root, screenshotPath),
    compactScreenshot: path.relative(root, compactScreenshotPath),
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
