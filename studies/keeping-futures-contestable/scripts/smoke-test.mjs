import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assignStudyB } from "../src/experiment-core.mjs";

const playwrightModule = await import("../../../apps/scene-builder/node_modules/playwright-core/index.js");
const { chromium } = playwrightModule.default;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.resolve(projectRoot, "artifacts", "ui-smoke");
if (!outputRoot.endsWith(path.join("artifacts", "ui-smoke"))) throw new Error("Unexpected smoke output path");
await fsp.rm(outputRoot, { recursive: true, force: true });
await fsp.mkdir(outputRoot, { recursive: true });

const port = 4187;
const baseUrl = `http://127.0.0.1:${port}/web/index.html`;
const server = spawn(process.execPath, ["scripts/serve.mjs", "--port", String(port)], {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("No Chrome or Edge executable found for UI smoke test");

let browser;
try {
  await waitForServer(baseUrl);
  const blockedCoordinatorFile = await fetch(`http://127.0.0.1:${port}/data/frozen/study-a-ids.csv`);
  assert(blockedCoordinatorFile.status === 403, `coordinator-only file returned HTTP ${blockedCoordinatorFile.status}`);
  const allowedConfig = await fetch(`http://127.0.0.1:${port}/config/study-config.json`);
  assert(allowedConfig.ok, "runtime config is not publicly readable by the local app");
  const runtimeConfig = await allowedConfig.json();
  browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const nonLocalRequests = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) nonLocalRequests.push(request.url());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert(await page.locator("h1").textContent() === "让未来保持可质疑。", "landing headline missing");
  assert((await page.locator("body").textContent()).includes("NOT_APPROVED_FOR_RECRUITMENT"), "ethics status is not visible");
  await page.screenshot({ path: path.join(outputRoot, "01-landing-desktop.png"), fullPage: true, animations: "disabled" });

  await startSession(page, "study-a", "DEMO-A-CHECK-3");
  const carePreview = await page.evaluate(() => window.__KFC_STUDY__.snapshot().trials[0]);
  assert(carePreview.briefId === "carelink-home-2032", "visual audit ID no longer opens the CareLink brief first");
  await page.screenshot({ path: path.join(outputRoot, "02-study-a-care-base.png"), fullPage: true, animations: "disabled" });

  await startSession(page, "study-a", "DEMO-A-SMOKE");
  for (let task = 0; task < 2; task += 1) {
    const taskCondition = await page.evaluate(() => {
      const snapshot = window.__KFC_STUDY__.snapshot();
      return snapshot.trials[snapshot.currentTrialIndex].condition;
    });
    await page.locator("#purpose").fill("这是一个分配资源并规定参与方式的未来系统。 ");
    await page.locator("#assumptions").fill("它假设机构数据优先，并决定谁能进入服务和提出申诉。 ");
    await page.locator("#revealChallenge").click();
    if (await page.locator('input[name="targetLayer"]').count()) {
      await page.locator('input[name="targetLayer"]').first().check();
    }
    await page.locator("#editPrompt").fill("修改手机、同意或代表权规则，让受影响者可以质疑并复核决定。 ");
    await page.locator("#generateCandidate").click();
    await page.waitForSelector("#applyCandidate");
    await page.screenshot({ path: path.join(outputRoot, `02-study-a-${taskCondition}-candidate.png`), fullPage: true, animations: "disabled" });
    await page.locator("#applyCandidate").click();
    await page.locator("#finishEditing").click();
    await page.locator("#changedAssumption").fill("改变了谁能够参与决定并要求复核的关系。 ");
    await page.locator("#newAssumptions").fill("注意到系统也预设了哪些证据更有权威。 ");
    await page.locator("#unresolved").fill("紧急效率与共同决定之间仍然未决。 ");
    await page.locator("#unintended").fill("无");
    await page.locator('input[name="control"][value="4"]').check({ force: true });
    await page.locator("#completeATrial").click();
  }
  await page.locator("#workspaceDifference").fill("两个工作区让修改边界和假设以不同方式显现。 ");
  await page.locator("#tradeoff").fill("局部控制减少无关变化，但也约束意外组合。 ");
  await page.locator('input[name="preference"][value="NO_PREFERENCE"]').check();
  await page.locator("#demandGuess").fill("比较编辑结构对推测性修改的影响。 ");
  await page.locator("#completeA").click();
  assert(await page.locator("#downloadReturn").isEnabled(), "Study A validated export is disabled");
  const studyASnapshot = await page.evaluate(() => window.__KFC_STUDY__.snapshot());
  assert(studyASnapshot.completedAt && studyASnapshot.trials.length === 2, "Study A did not complete two trials");

  const manifest = JSON.parse(await fsp.readFile(path.join(projectRoot, "data", "demo", "study-b-manifest.json"), "utf8"));
  const protocolIds = findProtocolIds(manifest.artefacts);
  for (const protocol of ["closed", "open"]) {
    await startSession(page, "study-b", protocolIds[protocol]);
    if (protocol === "closed") {
      await page.locator('input[name="meetsPurpose"][value="PARTLY"]').check();
      await page.locator('input[name="clarity"][value="3"]').check({ force: true });
      await page.locator("#defects").fill("部分规则缺少可见的解释与复核路径。 ");
      await page.locator("#requirements").fill("给定用途要求居民能够理解并质疑资源分配依据。 ");
      await page.locator("#fix").fill("增加明确的决定依据和人工复核入口即可满足最低要求。 ");
      await page.locator('input[name="passFail"][value="FAIL"]').check();
      await page.locator("#protocolRationale").fill("依据用途与当前规则之间的不一致作出判断。 ");
    } else {
      await page.locator("#readings").fill("它既可能提供支持，也可能把公共服务转化为行为治理。 ");
      await page.locator("#tension").fill("效率与参与权之间的张力不应被立即消除。 ");
      await page.locator("#stakeholders").fill("受影响居民可以质疑，但未被数据记录的人可能无法发声。 ");
      await page.locator("#arrangements").fill("可以加入社区共同复核和多种非数字接入方式。 ");
    }
    await page.locator("#lockProtocol").click();
    assert(await page.locator("#description").isVisible(), `${protocol} did not advance to common probe`);
    await page.locator("#description").fill("一个未来服务正在分配公共资源或协调照护。 ");
    await page.locator("#assumptions").fill("系统假设机构数据比个人经验更有权威。 ");
    await page.locator("#alternative").fill("受影响者可以共同制定规则并保留申诉。 ");
    await page.locator("#evidence").fill("依据界面中的规则字段、指标与缺失的入口。 ");
    await page.locator('input[name="comprehension"][value="0"]').check();
    await page.locator('input[name="closure"][value="2"]').check({ force: true });
    if (protocol === "open") await page.screenshot({ path: path.join(outputRoot, "03-study-b-common-probe.png"), fullPage: true, animations: "disabled" });
    await page.locator("#completeBTrial").click();
    const snapshot = await page.evaluate(() => window.__KFC_STUDY__.snapshot());
    assert(snapshot.currentTrialIndex === 1, `${protocol} common probe was not recorded`);
  }

  await startSession(page, "expert", "DEMO-E-SMOKE");
  const expertText = await page.locator("body").textContent();
  assert(!/sourceWorkflow|technicalStatus|\bflat\b|\blayered\b/i.test(expertText), "expert UI leaks workflow or technical fields");
  await page.locator('input[name="keepDecision"][value="REVISE"]').check();
  await page.locator('input[name="purposeFit"][value="3"]').check({ force: true });
  await page.locator('input[name="interpretiveOpenness"][value="4"]').check({ force: true });
  await page.locator("#expertRationale").fill("规则关系能够开启讨论，但申诉主体仍不明确。 ");
  await page.locator("#requiredRevision").fill("明确谁可以提出异议以及如何留下回执。 ");
  await page.screenshot({ path: path.join(outputRoot, "04-expert-blind-audit.png"), fullPage: true, animations: "disabled" });
  await page.locator("#completeExpertTrial").click();
  const expertSnapshot = await page.evaluate(() => window.__KFC_STUDY__.snapshot());
  assert(expertSnapshot.currentTrialIndex === 1, "expert decision was not recorded");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(bodyWidth <= 390, `mobile layout overflows: ${bodyWidth}px`);
  await page.screenshot({ path: path.join(outputRoot, "05-landing-mobile.png"), fullPage: true, animations: "disabled" });

  assert(nonLocalRequests.length === 0, `non-local requests detected: ${nonLocalRequests.join(" | ")}`);
  assert(consoleErrors.length === 0, `browser errors detected: ${consoleErrors.join(" | ")}`);
  const report = {
    ok: true,
    packageVersion: runtimeConfig.package_version,
    nonLocalRequests: 0,
    consoleErrors: 0,
    studyATrialsCompleted: 2,
    studyBProtocolsExercised: ["closed", "open"],
    expertBlindLeakCheck: "PASS",
    coordinatorFileAccess: "BLOCKED_403",
    screenshots: (await fsp.readdir(outputRoot)).filter((name) => name.endsWith(".png")).sort()
  };
  await fsp.writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => {});
  server.kill();
  if (serverOutput && server.exitCode && server.exitCode !== 0) console.error(serverOutput);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local server did not start. Output: ${serverOutput}`);
}

async function startSession(page, mode, participantId) {
  await page.goto(`${baseUrl}?mode=${mode}`, { waitUntil: "networkidle" });
  await page.locator("#participantId").fill(participantId);
  await page.locator("#consent").check();
  await page.locator("#startSession").click();
  await page.waitForSelector(".workspace, .completion");
}

function findProtocolIds(artefacts) {
  const result = {};
  for (let index = 1; index < 100 && Object.keys(result).length < 2; index += 1) {
    const id = `DEMO-B-SMOKE-${index}`;
    const protocol = assignStudyB(id, artefacts).protocol;
    result[protocol] ||= id;
  }
  if (!result.closed || !result.open) throw new Error("Could not find deterministic IDs for both Study B protocols");
  return result;
}
