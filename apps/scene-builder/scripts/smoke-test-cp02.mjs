import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";
import { createServer } from "vite";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);

export const projectRoot = path.resolve(scriptDir, "..");
export const repositoryRoot = path.resolve(projectRoot, "../..");
export const artifactRoot = path.join(projectRoot, "artifacts", "window-case-cp02");
export const projectPath = path.join(
  projectRoot,
  "projects",
  "window-case-cp02",
  "cp02-mutable-room.blockout.json",
);
export const catalogPath = path.join(projectRoot, "projects", "window-case-cp02", "asset-catalog.json");
export const sourceLockPath = path.join(projectRoot, "projects", "window-case-cp02", "source-lock.json");
export const viewport = Object.freeze({ width: 1280, height: 720 });

const exactTarget = Object.freeze({ modelName: "MacBook Air", chip: "Apple M5" });
const softwareRendererPattern = /swiftshader|llvmpipe|software renderer|mesa offscreen/i;
const lockedStates = new Set(["SOURCE_LOCKED", "EVIDENCE_LOCKED", "STAGE_LOCKED"]);

export const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const round = (value, precision = 4) => Number(Number(value).toFixed(precision));

const quantile = (sorted, fraction) => {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
};

export function summarizeSeries(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return { count: 0, median: null, p95: null, min: null, max: null };
  return {
    count: sorted.length,
    median: round(quantile(sorted, 0.5)),
    p95: round(quantile(sorted, 0.95)),
    min: round(sorted[0]),
    max: round(sorted.at(-1)),
  };
}

export function longestLowQualityInterval(samples, threshold = 0.75) {
  let currentStart = null;
  let longest = 0;
  let lastElapsed = 0;
  for (const sample of samples) {
    const elapsed = Number(sample?.elapsedMs);
    const quality = Number(sample?.performance?.qualityScale);
    if (!Number.isFinite(elapsed) || !Number.isFinite(quality)) continue;
    lastElapsed = elapsed;
    if (quality < threshold) {
      currentStart ??= elapsed;
    } else if (currentStart !== null) {
      longest = Math.max(longest, elapsed - currentStart);
      currentStart = null;
    }
  }
  if (currentStart !== null) longest = Math.max(longest, lastElapsed - currentStart);
  return round(longest);
}

export function isLocalRequest(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function evaluateRuntimeGate({ environment, adaptive, operations }) {
  const environmentReasons = [];
  if (environment.headless) environmentReasons.push("headless_browser");
  if (environment.viewport?.width !== viewport.width || environment.viewport?.height !== viewport.height) {
    environmentReasons.push("wrong_viewport");
  }
  if (softwareRendererPattern.test(String(environment.webgl?.renderer ?? ""))) {
    environmentReasons.push("software_renderer");
  }
  if (!environment.targetMachine?.matches) environmentReasons.push("wrong_target_machine");

  const frame = summarizeSeries(adaptive.frameDeltasMs ?? []);
  const apply = summarizeSeries(operations.applyMs ?? []);
  const undo = summarizeSeries(operations.undoMs ?? []);
  const medianFps = frame.median ? round(1000 / frame.median) : 0;
  const metrics = {
    medianFps,
    frameTimeP95Ms: frame.p95,
    applyP95Ms: apply.p95,
    undoP95Ms: undo.p95,
    longestBelow75QualityMs: Number(adaptive.longestBelow75QualityMs ?? 0),
  };

  const failedThresholds = [];
  if (medianFps < 30) failedThresholds.push("median_fps_below_30");
  if (frame.p95 === null || frame.p95 > 50) failedThresholds.push("frame_p95_above_50ms");
  if (apply.count < 20) failedThresholds.push("fewer_than_20_apply_samples");
  else if (apply.p95 > 250) failedThresholds.push("apply_p95_above_250ms");
  if (undo.count < 20) failedThresholds.push("fewer_than_20_undo_samples");
  else if (undo.p95 > 250) failedThresholds.push("undo_p95_above_250ms");
  if (metrics.longestBelow75QualityMs >= 5000) failedThresholds.push("quality_below_75_for_5s");

  return {
    status: environmentReasons.length ? "ENVIRONMENT_INVALID" : failedThresholds.length ? "FAIL" : "PASS",
    environmentReasons,
    failedThresholds,
    metrics,
    thresholds: {
      medianFpsMinimum: 30,
      frameTimeP95MsMaximum: 50,
      applyP95MsMaximum: 250,
      undoP95MsMaximum: 250,
      applySamplesMinimum: 20,
      undoSamplesMinimum: 20,
      continuousBelow75QualityMsMaximumExclusive: 5000,
    },
  };
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

export const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};

export const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const safeTimestamp = () => new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");

export function archivePreviousArtifacts(runId) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const entries = [
    "interaction.webm",
    "network.json",
    "performance.json",
    "receipts",
    "render-report.json",
    "run-state.json",
    "smoke-failure.json",
    "stills",
  ].filter((entry) => fs.existsSync(path.join(artifactRoot, entry)));
  if (!entries.length) return null;
  const historyRoot = path.join(artifactRoot, "history", runId);
  fs.mkdirSync(historyRoot, { recursive: true });
  for (const entry of entries) fs.renameSync(path.join(artifactRoot, entry), path.join(historyRoot, entry));
  return historyRoot;
}

const commandText = (command, args) => execFileSync(command, args, { encoding: "utf8" }).trim();

export function readTargetMachine() {
  const profile = commandText("system_profiler", ["SPHardwareDataType"]);
  const field = (label) => profile.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
  const machine = {
    modelName: field("Model Name"),
    modelIdentifier: field("Model Identifier"),
    chip: field("Chip"),
    memory: field("Memory"),
    architecture: os.arch(),
    os: commandText("sw_vers", []),
  };
  machine.matches = machine.modelName === exactTarget.modelName && machine.chip === exactTarget.chip;
  machine.expected = { ...exactTarget };
  return machine;
}

export const runtimeCommit = () => commandText("git", ["rev-parse", "HEAD"]);

export async function startCp02Server() {
  const server = await createServer({
    root: projectRoot,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === "object" && address ? address.port : null;
  if (!port) {
    await server.close();
    throw new Error("Vite did not expose an available loopback port");
  }
  return { server, origin: `http://127.0.0.1:${port}` };
}

export function resolveChromePath() {
  const candidates = [
    process.env.BLOCKOUT_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error("BLOCKOUT_CHROME_PATH does not resolve to system Chrome or Edge");
  return executablePath;
}

export async function launchCp02Browser({ headless = process.env.CP02_HEADLESS === "1" } = {}) {
  const executablePath = resolveChromePath();
  const browser = await chromium.launch({
    executablePath,
    headless,
    args: [
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-gpu-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });
  return { browser, executablePath, headless };
}

export function createNetworkRecorder() {
  const requests = [];
  const nonLocalRequests = [];
  const failedRequests = [];
  const consoleErrors = [];
  return {
    attach(page, label) {
      page.on("request", (request) => {
        const record = { label, method: request.method(), resourceType: request.resourceType(), url: request.url() };
        requests.push(record);
        if (!isLocalRequest(request.url())) nonLocalRequests.push(record);
      });
      page.on("requestfailed", (request) => {
        failedRequests.push({ label, url: request.url(), failure: request.failure()?.errorText ?? "unknown" });
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push({ label, text: message.text() });
      });
      page.on("pageerror", (error) => consoleErrors.push({ label, text: error.message }));
    },
    snapshot() {
      return {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        requestCount: requests.length,
        requests,
        nonLocalRequestCount: nonLocalRequests.length,
        nonLocalRequests,
        failedRequests,
        consoleErrors,
      };
    },
  };
}

const sortedUnique = (values) => [...new Set(values)].sort();

const assertExactIds = (actual, expected, label) => {
  const left = sortedUnique(actual);
  const right = sortedUnique(expected);
  assert(
    left.length === right.length && left.every((value, index) => value === right[index]),
    `${label} changed-ID set mismatch`,
  );
};

const expectedPatchIds = () => {
  const catalog = readJson(catalogPath).filter((asset) => asset.status === "PROJECT_AUTHORED_PROXY");
  const idsFor = (asset) => [asset.objectId, ...asset.bundle.children.map((child) => child.id)];
  const initial = catalog.flatMap(idsFor);
  const chair = idsFor(catalog.find((asset) => asset.semanticClass === "chair"));
  return { initial, chair };
};

const waitForReady = (page) => page.waitForFunction(
  () => window.__PACT_CP02_EVIDENCE__?.snapshot().ready === true,
  undefined,
  { timeout: 15_000 },
);

const snapshot = (page) => page.evaluate(() => window.__PACT_CP02_EVIDENCE__.snapshot());

const screenshot = async (page, filePath) => {
  await page.waitForTimeout(240);
  await page.screenshot({ path: filePath, animations: "disabled" });
};

export async function runInteractionSequence(page, { stillsDir = null, pauseMs = 0 } = {}) {
  const expected = expectedPatchIds();
  const receipts = {};
  const maybePause = () => pauseMs > 0 ? page.waitForTimeout(pauseMs) : Promise.resolve();
  const maybeScreenshot = (name) => stillsDir
    ? screenshot(page, path.join(stillsDir, name))
    : Promise.resolve();

  await waitForReady(page);
  const initial = await snapshot(page);
  assert(initial.objectCount === 200, `CP02 initial object count must be 200, got ${initial.objectCount}`);
  assert(initial.governanceCounts.SOURCE_LOCKED === 1, "CP02 must contain exactly one SOURCE_LOCKED object");
  await maybeScreenshot("01-establishing.png");
  await maybePause();

  await page.locator("#cp02-evidence-overlay").check();
  await maybeScreenshot("02-before.png");
  await maybePause();

  await page.locator("#cp02-preview").click();
  await page.waitForFunction(() => window.__PACT_CP02_EVIDENCE__.snapshot().outcome === "PROPOSED");
  const proposed = await snapshot(page);
  assert(proposed.projectHash === initial.projectHash, "Proposal preview mutated the project hash");
  assert(proposed.objectCount === 200, "Proposal preview entered SceneStore");
  assert(proposed.proposalPrimitiveCount === 15, "Proposal preview must contain 15 ephemeral primitives");
  await maybeScreenshot("03-preview.png");
  await maybePause();

  await page.locator("#cp02-guardian-allow").click();
  await page.waitForFunction(() => {
    const state = window.__PACT_CP02_EVIDENCE__.snapshot();
    return state.appliedPatchDepth === 1
      && state.latestReceipt?.outcome === "APPLIED"
      && state.projectHash === state.latestReceipt.resultHash;
  });
  const authorised = await snapshot(page);
  receipts.initialApply = authorised.latestReceipt;
  assert(receipts.initialApply.preconditionHash === initial.projectHash, "Initial patch precondition hash mismatch");
  assert(receipts.initialApply.protectedPreconditionHash === receipts.initialApply.protectedResultHash, "Initial patch changed protected objects");
  assertExactIds(receipts.initialApply.expectedChangedObjectIds, expected.initial, "Initial patch");
  assert(authorised.objectCount === 218, `Authorised room must contain 218 objects, got ${authorised.objectCount}`);
  await maybeScreenshot("04-authorised.png");
  await maybePause();

  await page.locator("#cp02-move-chair").click();
  await page.waitForFunction(() => {
    const state = window.__PACT_CP02_EVIDENCE__.snapshot();
    return state.appliedPatchDepth === 2
      && state.latestReceipt?.patchId === "CP02-REFRAME-CHAIR-MOVE-001"
      && state.projectHash === state.latestReceipt.resultHash;
  });
  const moved = await snapshot(page);
  receipts.chairMove = moved.latestReceipt;
  assert(receipts.chairMove.protectedPreconditionHash === receipts.chairMove.protectedResultHash, "Chair move changed protected objects");
  assertExactIds(receipts.chairMove.expectedChangedObjectIds, expected.chair, "Chair move");
  await maybePause();

  await page.locator("#cp02-undo").click();
  await page.waitForFunction(() => {
    const state = window.__PACT_CP02_EVIDENCE__.snapshot();
    return state.appliedPatchDepth === 1
      && state.latestReceipt?.outcome === "UNDONE"
      && state.projectHash === state.latestReceipt.resultHash;
  });
  receipts.undoChair = (await snapshot(page)).latestReceipt;
  assert(receipts.undoChair.resultHash === receipts.initialApply.resultHash, "Chair undo did not restore initial patch result");
  await maybePause();

  await page.locator("#cp02-undo").click();
  await page.waitForFunction(() => {
    const state = window.__PACT_CP02_EVIDENCE__.snapshot();
    return state.appliedPatchDepth === 0
      && state.latestReceipt?.outcome === "UNDONE"
      && state.projectHash === state.latestReceipt.resultHash;
  });
  const undone = await snapshot(page);
  receipts.undoInitial = undone.latestReceipt;
  assert(undone.projectHash === initial.projectHash, "Two exact undos did not restore the initial project hash");
  assert(undone.objectCount === 200, "Two exact undos did not restore the initial object count");
  await maybeScreenshot("05-undone.png");
  await maybePause();

  const beforeSourceAttemptHash = undone.projectHash;
  await page.locator("#cp02-attempt-source-rewrite").click();
  await page.waitForFunction(() => {
    const state = window.__PACT_CP02_EVIDENCE__.snapshot();
    return state.latestReceipt?.patchId === "CP02-FORBIDDEN-SOURCE-REWRITE-001"
      && state.outcome === "WITHHELD"
      && state.projectHash === state.latestReceipt.resultHash;
  });
  const rejected = await snapshot(page);
  receipts.sourceRejected = rejected.latestReceipt;
  assert(rejected.projectHash === beforeSourceAttemptHash, "Rejected source-photo patch changed the project hash");
  assert(receipts.sourceRejected.reasonCode === "SCENE_PATCH_REJECTED", "Source-photo patch did not use ScenePatch rejection");
  assert(rejected.governanceCounts.SOURCE_LOCKED === 1, "Source-photo rejection lost SOURCE_LOCKED state");
  await maybeScreenshot("06-rejected.png");
  await maybePause();

  return {
    initial,
    proposed,
    authorised,
    moved,
    undone,
    rejected,
    receipts,
  };
}

export async function benchmarkPatchCycles(page, cycles = 20) {
  const applyMs = [];
  const undoMs = [];
  const expected = expectedPatchIds();

  for (let index = 0; index < cycles; index += 1) {
    const baseline = await snapshot(page);
    assert(baseline.appliedPatchDepth === 0, `Benchmark cycle ${index + 1} did not start at depth zero`);
    await page.locator("#cp02-preview").click();
    await page.waitForFunction(() => window.__PACT_CP02_EVIDENCE__.snapshot().outcome === "PROPOSED");
    const proposed = await snapshot(page);
    assert(proposed.projectHash === baseline.projectHash, `Benchmark cycle ${index + 1} preview mutated state`);

    const receiptCountBeforeApply = proposed.receipts.length;
    const applyStartedAt = await page.evaluate(() => performance.now());
    await page.locator("#cp02-guardian-allow").click();
    await page.waitForFunction((minimumReceipts) => {
      const state = window.__PACT_CP02_EVIDENCE__.snapshot();
      return state.receipts.length > minimumReceipts
        && state.appliedPatchDepth === 1
        && state.latestReceipt?.outcome === "APPLIED"
        && state.projectHash === state.latestReceipt.resultHash;
    }, receiptCountBeforeApply);
    applyMs.push(round((await page.evaluate(() => performance.now())) - applyStartedAt));
    const applied = await snapshot(page);
    assert(applied.latestReceipt.preconditionHash === baseline.projectHash, `Benchmark apply ${index + 1} precondition mismatch`);
    assert(applied.latestReceipt.protectedPreconditionHash === applied.latestReceipt.protectedResultHash, `Benchmark apply ${index + 1} changed protected objects`);
    assertExactIds(applied.latestReceipt.expectedChangedObjectIds, expected.initial, `Benchmark apply ${index + 1}`);

    const receiptCountBeforeUndo = applied.receipts.length;
    const undoStartedAt = await page.evaluate(() => performance.now());
    await page.locator("#cp02-undo").click();
    await page.waitForFunction((minimumReceipts) => {
      const state = window.__PACT_CP02_EVIDENCE__.snapshot();
      return state.receipts.length > minimumReceipts
        && state.appliedPatchDepth === 0
        && state.latestReceipt?.outcome === "UNDONE"
        && state.projectHash === state.latestReceipt.resultHash;
    }, receiptCountBeforeUndo);
    undoMs.push(round((await page.evaluate(() => performance.now())) - undoStartedAt));
    const restored = await snapshot(page);
    assert(restored.projectHash === baseline.projectHash, `Benchmark undo ${index + 1} did not restore precondition`);
    assert(restored.latestReceipt.protectedPreconditionHash === applied.latestReceipt.protectedResultHash, `Benchmark undo ${index + 1} protected precondition mismatch`);
    assert(restored.latestReceipt.protectedResultHash === applied.latestReceipt.protectedPreconditionHash, `Benchmark undo ${index + 1} protected result mismatch`);
  }

  return { cycles, applyMs, undoMs, apply: summarizeSeries(applyMs), undo: summarizeSeries(undoMs) };
}

export async function sampleAnimationFrames(page, durationMs) {
  return page.evaluate((requestedDurationMs) => new Promise((resolve) => {
    const frameDeltasMs = [];
    const adaptationSnapshots = [];
    let startedAt = null;
    let previousTimestamp = null;
    let nextAdaptationAt = 0;

    const sample = (timestamp) => {
      startedAt ??= timestamp;
      if (previousTimestamp !== null) frameDeltasMs.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      const elapsedMs = timestamp - startedAt;
      if (elapsedMs >= nextAdaptationAt) {
        adaptationSnapshots.push({
          elapsedMs,
          performance: window.__PACT_CP02_EVIDENCE__?.snapshot().performance ?? null,
        });
        nextAdaptationAt += 1000;
      }
      if (elapsedMs >= requestedDurationMs) {
        resolve({ requestedDurationMs, actualDurationMs: elapsedMs, frameDeltasMs, adaptationSnapshots });
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }), durationMs);
}

export async function collectBrowserEnvironment(page, { browser, headless, targetMachine }) {
  const browserState = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport canvas");
    const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    const debug = context?.getExtension("WEBGL_debug_renderer_info");
    const canvasRect = canvas?.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      canvas: { width: Math.round(canvasRect?.width ?? 0), height: Math.round(canvasRect?.height ?? 0) },
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
      webgl: {
        version: context ? context.getParameter(context.VERSION) : null,
        vendor: context ? context.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR) : null,
        renderer: context ? context.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER) : null,
      },
    };
  });
  return {
    ...browserState,
    headless,
    mode: headless ? "headless" : "headful",
    browserVersion: browser.version(),
    targetMachine,
  };
}

const prepareEvidenceDirectories = (runId) => {
  const archived = archivePreviousArtifacts(runId);
  const stillsDir = path.join(artifactRoot, "stills");
  const receiptsDir = path.join(artifactRoot, "receipts");
  fs.mkdirSync(stillsDir, { recursive: true });
  fs.mkdirSync(receiptsDir, { recursive: true });
  return { archived, stillsDir, receiptsDir };
};

const writeReceipts = (receiptsDir, receipts) => {
  const names = {
    initialApply: "01-initial-apply.json",
    chairMove: "02-chair-move.json",
    undoChair: "03-undo-chair.json",
    undoInitial: "04-undo-initial.json",
    sourceRejected: "05-source-rejected.json",
  };
  for (const [key, filename] of Object.entries(names)) writeJson(path.join(receiptsDir, filename), receipts[key]);
};

export async function runSmokeEvidence() {
  for (const required of [projectPath, catalogPath, sourceLockPath]) {
    assert(fs.existsSync(required), `Missing CP02 evidence input: ${required}`);
  }
  const runId = safeTimestamp();
  const { archived, stillsDir, receiptsDir } = prepareEvidenceDirectories(runId);
  const sourceProject = readJson(projectPath);
  const sourceLock = readJson(sourceLockPath);
  const targetMachine = readTargetMachine();
  const commit = runtimeCommit();
  const headless = process.env.CP02_HEADLESS === "1";
  const debugShort = process.env.CP02_DEBUG_SHORT === "1";
  const benchmarkCycles = debugShort ? 2 : 20;
  const adaptiveDurationMs = debugShort ? 2_000 : 60_000;
  const fullQualityDurationMs = debugShort ? 1_500 : 30_000;
  const networkRecorder = createNetworkRecorder();

  let server;
  let browser;
  let origin;
  try {
    ({ server, origin } = await startCp02Server());
    ({ browser } = await launchCp02Browser({ headless }));

    const correctnessContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const correctnessPage = await correctnessContext.newPage();
    networkRecorder.attach(correctnessPage, "correctness-adaptive");
    await correctnessPage.goto(`${origin}/?case=pact-cp02`, { waitUntil: "networkidle" });
    const interaction = await runInteractionSequence(correctnessPage, { stillsDir });
    writeReceipts(receiptsDir, interaction.receipts);

    const operationBenchmark = await benchmarkPatchCycles(correctnessPage, benchmarkCycles);
    await correctnessPage.locator("#cp02-preview").click();
    await correctnessPage.waitForFunction(() => window.__PACT_CP02_EVIDENCE__.snapshot().outcome === "PROPOSED");
    await correctnessPage.locator("#cp02-guardian-allow").click();
    await correctnessPage.waitForFunction(() => {
      const state = window.__PACT_CP02_EVIDENCE__.snapshot();
      return state.appliedPatchDepth === 1 && state.projectHash === state.latestReceipt?.resultHash;
    });

    const environment = await collectBrowserEnvironment(correctnessPage, { browser, headless, targetMachine });
    const adaptiveRaw = await sampleAnimationFrames(correctnessPage, adaptiveDurationMs);
    const adaptive = {
      ...adaptiveRaw,
      frame: summarizeSeries(adaptiveRaw.frameDeltasMs),
      longestBelow75QualityMs: longestLowQualityInterval(adaptiveRaw.adaptationSnapshots, 0.75),
    };
    await correctnessContext.close();

    const fullContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const fullPage = await fullContext.newPage();
    networkRecorder.attach(fullPage, "full-quality-diagnostic");
    await fullPage.goto(`${origin}/?case=pact-cp02&renderQuality=full`, { waitUntil: "networkidle" });
    await waitForReady(fullPage);
    await fullPage.locator("#cp02-preview").click();
    await fullPage.waitForFunction(() => window.__PACT_CP02_EVIDENCE__.snapshot().outcome === "PROPOSED");
    await fullPage.locator("#cp02-guardian-allow").click();
    await fullPage.waitForFunction(() => {
      const state = window.__PACT_CP02_EVIDENCE__.snapshot();
      return state.appliedPatchDepth === 1 && state.projectHash === state.latestReceipt?.resultHash;
    });
    const fullEnvironment = await collectBrowserEnvironment(fullPage, { browser, headless, targetMachine });
    const fullRaw = await sampleAnimationFrames(fullPage, fullQualityDurationMs);
    const fullQuality = { ...fullRaw, frame: summarizeSeries(fullRaw.frameDeltasMs), environment: fullEnvironment };
    assert(
      fullRaw.adaptationSnapshots.filter((sample) => sample.performance).every((sample) => sample.performance.adaptationEnabled === false),
      "renderQuality=full diagnostic unexpectedly enabled adaptation",
    );
    await fullContext.close();

    const network = networkRecorder.snapshot();
    writeJson(path.join(artifactRoot, "network.json"), network);
    assert(network.nonLocalRequestCount === 0, `Non-local browser requests detected: ${network.nonLocalRequestCount}`);
    assert(network.consoleErrors.length === 0, `Browser errors detected: ${JSON.stringify(network.consoleErrors)}`);

    const gate = evaluateRuntimeGate({ environment, adaptive, operations: operationBenchmark });
    const performance = {
      schemaVersion: 1,
      runId,
      debugShort,
      capturedAt: new Date().toISOString(),
      runtimeCommit: commit,
      sourceRuntimeCommit: sourceLock.runtimeCommit,
      sourceProjectSha256: sourceLock.baseProject.sha256,
      sourcePhotoSha256: sourceLock.b2Source.sha256,
      projectObjectCount: sourceProject.objects.length,
      environment,
      correctness: {
        status: "PASS",
        initialProjectHash: interaction.initial.projectHash,
        finalProjectHash: interaction.rejected.projectHash,
        exactUndoRestored: interaction.rejected.projectHash === interaction.initial.projectHash,
        sourcePhotoRejected: interaction.receipts.sourceRejected.outcome === "WITHHELD",
      },
      operationBenchmark,
      adaptive,
      fullQuality,
      gate,
      evidenceBoundary: gate.status === "PASS"
        ? "Eligible to support RUNTIME_TESTED after archive verification; no artistic approval implied."
        : "CP02 remains STAGE_EXPERIMENT; failed or invalid samples are preserved.",
    };
    writeJson(path.join(artifactRoot, "performance.json"), performance);
    writeJson(path.join(artifactRoot, "run-state.json"), {
      schemaVersion: 1,
      runId,
      smokeCompletedAt: new Date().toISOString(),
      runtimeCommit: commit,
      performanceStatus: gate.status,
      archivedPreviousEvidence: archived,
      renderStatus: "PENDING",
    });
    return { ok: true, runId, artifactRoot, performanceStatus: gate.status, metrics: gate.metrics, networkRequests: network.requestCount };
  } catch (error) {
    const network = networkRecorder.snapshot();
    writeJson(path.join(artifactRoot, "network.json"), network);
    writeJson(path.join(artifactRoot, "smoke-failure.json"), {
      schemaVersion: 1,
      runId,
      failedAt: new Date().toISOString(),
      runtimeCommit: commit,
      message: error.message,
      stack: error.stack,
      partialNetworkReport: "network.json",
      preserved: true,
    });
    throw error;
  } finally {
    await browser?.close();
    await server?.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMain) {
  runSmokeEvidence()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
