import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import { startReplayServer } from "../replay/serve-replay.mjs";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(valueAfter("--package", path.join(scriptDir, "../artifacts/interaction-simulation/interaction-simulation-30fps.simulation-package")));
let url = valueAfter("--url");
const screenshotPath = path.resolve(valueAfter("--screenshot", "artifacts/simulation-delivery-replay-smoke.png"));
const seekTime = Number(valueAfter("--seek", 6)) || 0;
const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到 Chrome 或 Edge，无法执行交付包回放 smoke。配置 BLOCKOUT_CHROME_PATH 后重试。");

fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
let browser;
let ownedServer;
try {
  if (!url) {
    const running = await startReplayServer({ rootPath: packagePath, port: 0 });
    ownedServer = running.server;
    url = running.url;
  }
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--enable-webgl", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  try {
    await page.waitForSelector('html[data-replay-ready="true"]', { timeout: 30_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      title: document.title,
      errorVisible: document.querySelector("#error")?.classList.contains("visible"),
      errorMessage: document.querySelector("#error-message")?.textContent,
      bodyText: document.body?.innerText?.slice(0, 1000),
    })).catch(() => null);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    throw new Error(`回放未进入 ready 状态：${JSON.stringify({ diagnostics, errors })}`, { cause: error });
  }
  await page.locator("#scrubber").evaluate((input, time) => {
    input.value = String(Math.min(Number(input.max), Math.max(Number(input.min), time)));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, seekTime);
  await page.waitForTimeout(350);
  const report = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const replay = window.__simulationReplay;
    return {
      ready: document.documentElement.dataset.replayReady === "true",
      validationStatus: document.querySelector("#status")?.textContent,
      packageId: replay?.state?.manifest?.packageId,
      simulationIdentity: replay?.state?.manifest?.simulationIdentity,
      frameLabel: document.querySelector("#frame-label")?.textContent,
      eventCount: document.querySelectorAll(".event").length,
      heldObjectCount: Number(document.querySelector("#ownership")?.textContent),
      traceFrameCount: replay?.state?.frames?.length,
      canvas: { width: canvas?.width, height: canvas?.height },
      webgl: Boolean(canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")),
    };
  });
  const frameBeforePlayback = await page.evaluate(() => window.__simulationReplay?.state?.currentFrame);
  await page.locator("#play").click();
  await page.waitForTimeout(280);
  const frameAfterPlayback = await page.evaluate(() => window.__simulationReplay?.state?.currentFrame);
  await page.locator("#play").click();
  report.playbackAdvanced = Number(frameAfterPlayback) > Number(frameBeforePlayback);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  if (errors.length) throw new Error(`回放控制台错误：${errors.join(" | ")}`);
  if (!report.ready || report.validationStatus !== "PASS" || !report.webgl || !report.packageId || !report.playbackAdvanced) {
    throw new Error(`回放 smoke 未通过：${JSON.stringify(report)}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, screenshotPath, ...report }, null, 2)}\n`);
} finally {
  await browser?.close().catch(() => {});
  if (ownedServer) await new Promise((resolve) => ownedServer.close(resolve));
}
