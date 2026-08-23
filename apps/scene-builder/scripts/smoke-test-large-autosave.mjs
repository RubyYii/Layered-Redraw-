import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const root = process.cwd();
const urlIndex = process.argv.indexOf("--url");
const baseUrl = urlIndex >= 0 ? process.argv[urlIndex + 1] : "http://127.0.0.1:5173/";
const projectPath = path.join(root, "projects", "window-case", "window-that-wasnt-there.blockout.json");
const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
const outputRoot = path.join(root, "artifacts", "large-autosave-smoke");
const screenshotPath = path.join(outputRoot, "restored-166-second-project.png");
fs.mkdirSync(outputRoot, { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到 Chrome 或 Edge，无法执行大型工程恢复 smoke。");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
let page = await context.newPage();
page.setDefaultTimeout(25_000);

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#project-file").setInputFiles(projectPath);
  const readPersistedSnapshot = () => page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("blockout-studio-v4", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const snapshot = await new Promise((resolve, reject) => {
      const transaction = database.transaction("project-snapshots", "readonly");
      const request = transaction.objectStore("project-snapshots").get("blockout-studio.project.v3");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (!snapshot?.json) return { bytes: 0, projectName: null, localStorageMirror: null };
    try {
      const projectName = JSON.parse(snapshot.json).name;
      return {
        bytes: snapshot.bytes,
        projectName,
        localStorageMirror: localStorage.getItem("blockout-studio.project.v3"),
      };
    } catch {
      return { bytes: snapshot.bytes ?? 0, projectName: null, localStorageMirror: null };
    }
  });
  const persistenceDeadline = Date.now() + 25_000;
  let persisted = await readPersistedSnapshot();
  while (
    Date.now() < persistenceDeadline
    && !(persisted.bytes > 3_500_000 && persisted.projectName === project.name && persisted.localStorageMirror === null)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    persisted = await readPersistedSnapshot();
  }
  assert(
    persisted.bytes > 3_500_000,
    `大型工程没有越过旧 localStorage 停用阈值（实际 ${persisted.bytes} bytes，工程 ${persisted.projectName ?? "unknown"}）。`,
  );
  assert(persisted.projectName === project.name, "IndexedDB 恢复快照绑定了错误工程。");
  assert(persisted.localStorageMirror === null, "大型工程不应镜像进同步 localStorage。");

  await page.close();
  page = await context.newPage();
  page.setDefaultTimeout(25_000);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((expectedName) => document.querySelector("#project-name")?.value === expectedName, project.name);
  const restored = await page.evaluate(() => ({
    name: document.querySelector("#project-name")?.value,
    cameraClips: document.querySelectorAll('.timeline-clip[data-track="camera"]').length,
    duration: document.querySelector("#timeline-duration")?.textContent,
    autosaveStatus: document.querySelector("#autosave-status")?.textContent,
  }));
  assert(restored.name === project.name, "刷新后没有从 IndexedDB 恢复大型工程。");
  assert(restored.cameraClips === 19, "刷新后的 166 秒工程没有保留 19 个镜头。");
  assert(restored.duration === "02:46:00", "刷新后的工程时长不是完整 166 秒。");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const report = { ok: true, projectBytes: persisted.bytes, restored, screenshot: path.relative(root, screenshotPath) };
  fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(outputRoot, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
