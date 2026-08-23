import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const root = process.cwd();
const urlIndex = process.argv.indexOf("--url");
const baseUrl = urlIndex >= 0 ? process.argv[urlIndex + 1] : "http://127.0.0.1:5173/";
const outputRoot = path.join(root, "artifacts", "cp03-audience-smoke");
const failurePath = path.join(outputRoot, "failure.png");
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
if (!executablePath) throw new Error("未找到 Chrome 或 Edge，无法执行 CP03 观众 UI smoke。");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const actions = ["Translate", "Reframe", "Merge", "Continue", "KeepOpaque"];
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(20_000);
const consoleErrors = [];
const nonLocalRequests = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("request", (request) => {
  const url = new URL(request.url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) nonLocalRequests.push(request.url());
});

try {
  const url = new URL(baseUrl);
  url.searchParams.set("case", "pact-cp03");
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.waitForSelector("#viewport canvas");
  assert(await page.locator("#cp03-panel").isVisible(), "CP03 观众台没有显示。");
  assert(await page.locator("#inspector-panel").isHidden(), "CP03 观众模式仍暴露操作员检查器。");
  assert((await page.locator(".cp03-local-badge").textContent())?.includes("0-CALL"), "本地 Provider 边界标签缺失。");

  for (const [index, action] of actions.entries()) {
    if (index > 0) {
      await page.locator("#cp03-reset").click();
      await page.waitForFunction(() => document.querySelector("#cp03-outcome")?.textContent === "READY");
    }
    await page.locator(`[data-cp03-action="${action}"]`).click();
    await page.locator("#cp03-viewer-input").fill(`本地五动作视觉验收 ${action}；不代表真实 Provider。`);
    await page.locator("#cp03-propose").click();
    await page.waitForFunction(() => document.querySelector("#cp03-outcome")?.textContent === "PROPOSED");
    const draftHash = (await page.locator("#cp03-draft-hash").textContent())?.trim() ?? "";
    assert(/^[a-f0-9]{64}$/.test(draftHash), `${action} 没有生成规范 Draft Hash。`);
    await page.locator("#cp03-approve").click();
    await page.waitForFunction(() => document.querySelector("#cp03-outcome")?.textContent === "APPLIED");
    const evidence = await page.evaluate(() => window.__PACT_CP03_EVIDENCE__.snapshot());
    assert(evidence.providerRequestsMade === 0, `${action} 意外产生 Provider 请求。`);
    assert(evidence.visualActions.at(-1) === action, `${action} 的 Three.js 效果没有进入证据状态。`);
    assert(evidence.gateStatus === "PASS · HASH LINKED", `${action} 的 Capability Gate 没有通过。`);
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(outputRoot, `${String(index + 1).padStart(2, "0")}-${action}.png`), animations: "disabled" });
  }

  const desktopPath = path.join(outputRoot, "cp03-audience-desktop.png");
  await page.screenshot({ path: desktopPath, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const panelBounds = await page.locator("#cp03-panel").boundingBox();
  assert(panelBounds && panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= 390, "移动端观众底部面板超出视口。");
  const mobilePath = path.join(outputRoot, "cp03-audience-mobile.png");
  await page.screenshot({ path: mobilePath, fullPage: true, animations: "disabled" });
  const finalEvidence = await page.evaluate(() => window.__PACT_CP03_EVIDENCE__.snapshot());
  assert(finalEvidence.proposalCount === 5, "五动作演练没有保留五个提案。 ");
  assert(finalEvidence.approvalCount === 5 && finalEvidence.receiptCount === 5, "五动作回执链不完整。");
  assert(finalEvidence.checkpointEligible === false, "本地工程证据被错误标记为 checkpoint。 ");
  assert(new Set(finalEvidence.visualActions).size === 5, "五种动作没有各自产生视觉效果。");
  assert(nonLocalRequests.length === 0, `出现非本地请求：${nonLocalRequests.join(" | ")}`);
  assert(consoleErrors.length === 0, `页面出现控制台错误：${consoleErrors.join(" | ")}`);

  fs.rmSync(failurePath, { force: true });
  const report = {
    ok: true,
    mode: finalEvidence.mode,
    providerRequestsMade: finalEvidence.providerRequestsMade,
    visualActions: finalEvidence.visualActions,
    proposalCount: finalEvidence.proposalCount,
    receiptCount: finalEvidence.receiptCount,
    checkpointEligible: finalEvidence.checkpointEligible,
    screenshots: fs.readdirSync(outputRoot).filter((name) => name.endsWith(".png")).sort(),
  };
  fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
