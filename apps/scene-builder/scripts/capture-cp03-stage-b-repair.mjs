import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonicalJson } from "@layered-redraw/pact-cp03-contracts";
import { chromium } from "playwright-core";

import {
  assert,
  createNetworkRecorder,
  repositoryRoot,
  resolveChromePath,
  viewport,
} from "./smoke-test-cp02.mjs";

const banner = "LOCAL SCRIPTED REPAIR — PROVIDER UNVERIFIED — NO PREFLIGHT — NO REPLACEMENT RUN";

const expectedCheckIds = Object.freeze([
  "canonical-role-binding",
  "wrapper-rejection",
  "runtime-schema-rejection",
  "unknown-reference-rejection",
  "known-reference-identity",
  "phase-request-policy",
  "gemini-low-local-serialization",
  "terminal-provider-error",
  "max-tokens-no-tool",
  "hard-timeout",
  "first-tool-result-one-shot",
  "reference-invalid-before-durability",
  "pair-local-eligibility",
  "legacy-archive-identity",
  "synthetic-secret-scan",
  "zero-external-side-effects",
]);

const boardSequence = Object.freeze([
  Object.freeze({
    id: "authority",
    index: "01",
    kicker: "AUTHORITY BOUNDARY",
    title: "Agent content stays agent-owned",
    lead: "creative role submission",
    bridge: "deterministic binder",
    result: "trusted runtime envelope",
    detail: "No wrapper repair. No model-authored role, turn, schema, session, or runtime version.",
  }),
  Object.freeze({
    id: "references",
    index: "02",
    kicker: "REFERENCE AUTHORITY",
    title: "Known IDs pass unchanged",
    lead: "frozen registry",
    bridge: "exact validation",
    result: "durability or fail-closed",
    detail: "Unknown rights, assets, bridges, source locks, objects, affordances, rollback, semantics, and evidence are rejected.",
  }),
  Object.freeze({
    id: "conductor",
    index: "03",
    kicker: "PERSISTENT CONDUCTOR",
    title: "One session, two bounded phases",
    lead: "intent 1024",
    bridge: "same session",
    result: "commit 512",
    detail: "The minimal commit selects accepted shard hashes and visible dissent; assembly remains deterministic.",
  }),
  Object.freeze({
    id: "terminal",
    index: "04",
    kicker: "TERMINAL TRUTH",
    title: "First terminal condition is evidence",
    lead: "HTTP 400 → provider error",
    bridge: "max tokens → content failure",
    result: "hard timeout → late",
    detail: "The first rejected expected tool result ends the attempt. No hidden second stream is granted.",
  }),
  Object.freeze({
    id: "evidence",
    index: "05",
    kicker: "EVIDENCE VERSIONING",
    title: "History stays immutable",
    lead: "legacy archive unchanged",
    bridge: "replacement policy 0.2",
    result: "pair-local eligibility",
    detail: "A failed pair does not erase an unrelated complete pair; global partial status remains visible.",
  }),
  Object.freeze({
    id: "boundary",
    index: "06",
    kicker: "EXTERNAL SIDE EFFECTS",
    title: "Five counters remain zero",
    lead: "provider 0 · Keychain 0",
    bridge: "external network 0",
    result: "preflight 0 · run 0",
    detail: "This board records local scripted engineering evidence only. Provider compatibility and artistic judgment are unproven.",
  }),
]);

const parseArgs = (args) => {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || parsed.has(key)) {
      throw new Error("STAGE_B_REPAIR_CAPTURE_ARGUMENTS_INVALID");
    }
    parsed.set(key, value);
  }
  const allowed = ["--gate-report", "--output-dir"];
  assert(args.length === 4, "STAGE_B_REPAIR_CAPTURE_ARGUMENTS_INVALID");
  assert([...parsed.keys()].every((key) => allowed.includes(key)), "STAGE_B_REPAIR_CAPTURE_ARGUMENTS_INVALID");
  assert(parsed.get("--gate-report"), "STAGE_B_REPAIR_CAPTURE_GATE_REPORT_REQUIRED");
  assert(parsed.get("--output-dir"), "STAGE_B_REPAIR_CAPTURE_OUTPUT_REQUIRED");
  return {
    gateReportPath: path.resolve(parsed.get("--gate-report")),
    outputDir: path.resolve(parsed.get("--output-dir")),
  };
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalSha256 = (value) => sha256(canonicalJson(value));
const sha256File = (filePath) => sha256(fs.readFileSync(filePath));

const isWithin = (root, candidate) => {
  const relation = path.relative(root, candidate);
  return relation === "" || (!relation.startsWith(`..${path.sep}`) && relation !== "..");
};

const assertOutputBoundary = (outputDir) => {
  const cp03Root = path.join(repositoryRoot, "checkpoints", "cp03");
  const repairRoot = path.join(cp03Root, "stage-b-replacement-repair");
  if (isWithin(cp03Root, outputDir)) {
    assert(outputDir === repairRoot, "STAGE_B_REPAIR_CAPTURE_CHECKPOINT_PATH_FORBIDDEN");
  }
};

const readVerifiedGate = (gateReportPath) => {
  const report = JSON.parse(fs.readFileSync(gateReportPath, "utf8"));
  assert(report.schemaVersion === "cp03-stage-b-replacement-repair-gate/0.1", "STAGE_B_REPAIR_GATE_SCHEMA_INVALID");
  assert(report.mode === "local-scripted", "STAGE_B_REPAIR_GATE_MODE_INVALID");
  assert(report.status === "PASS", "STAGE_B_REPAIR_GATE_NOT_PASS");
  assert(report.banner === banner, "STAGE_B_REPAIR_GATE_BANNER_INVALID");
  assert(report.providerCompatibilityProven === false, "STAGE_B_REPAIR_GATE_PROVIDER_CLAIM_INVALID");
  for (const counter of [
    "providerRequestsMade",
    "keychainReads",
    "externalNetworkRequests",
    "preflightsCreated",
    "runsStarted",
  ]) assert(report[counter] === 0, `STAGE_B_REPAIR_GATE_COUNTER_NONZERO:${counter}`);
  assert(Array.isArray(report.checks) && report.checks.length === expectedCheckIds.length, "STAGE_B_REPAIR_GATE_CHECKS_INVALID");
  assert(
    JSON.stringify(report.checks.map(({ id }) => id)) === JSON.stringify(expectedCheckIds),
    "STAGE_B_REPAIR_GATE_CHECK_ORDER_INVALID",
  );
  assert(report.checks.every(({ status }) => status === "PASS"), "STAGE_B_REPAIR_GATE_CHECK_FAILED");
  const { repairGateSha256, ...unsigned } = report;
  assert(/^[a-f0-9]{64}$/.test(repairGateSha256), "STAGE_B_REPAIR_GATE_HASH_INVALID");
  assert(canonicalSha256(unsigned) === repairGateSha256, "STAGE_B_REPAIR_GATE_HASH_MISMATCH");
  return report;
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const boardHtml = (report) => {
  const cards = boardSequence.map((entry) => `
    <article class="card" data-phase="${entry.id}">
      <header><span>${entry.index}</span><em>${escapeHtml(entry.kicker)}</em><strong>PASS</strong></header>
      <h2>${escapeHtml(entry.title)}</h2>
      <div class="flow"><b>${escapeHtml(entry.lead)}</b><i>→</i><b>${escapeHtml(entry.bridge)}</b><i>→</i><b>${escapeHtml(entry.result)}</b></div>
      <p>${escapeHtml(entry.detail)}</p>
    </article>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; color: #e4dccd; background: #080a09; }
    body::before { content: ""; position: fixed; inset: 0; z-index: 8; pointer-events: none; opacity: .2; background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,244,218,.06) 4px); }
    body::after { content: ""; position: fixed; inset: 0; z-index: 9; pointer-events: none; box-shadow: inset 0 0 150px 35px #000; }
    main { position: relative; width: 1280px; height: 720px; padding: 30px 38px 24px; background: radial-gradient(circle at 82% 12%, rgba(187,124,44,.11), transparent 32%), linear-gradient(120deg, #131510 0%, #090b09 58%, #070807 100%); }
    .mast { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: start; padding-bottom: 15px; border-bottom: 1px solid #4d4639; }
    .eyebrow { color: #c58b3e; font-size: 11px; letter-spacing: .24em; }
    h1 { margin: 7px 0 0; font: italic 29px/1.05 Georgia, serif; font-weight: 400; letter-spacing: .015em; }
    .seal { display: grid; grid-template-columns: auto auto; gap: 6px 15px; min-width: 300px; padding: 10px 13px; border: 1px solid #625038; background: rgba(7,8,7,.55); }
    .seal span { color: #7f8279; font-size: 9px; letter-spacing: .12em; }
    .seal strong { color: #72ae83; font-size: 10px; font-weight: 500; text-align: right; }
    .banner { margin: 15px 0 16px; padding: 9px 12px; border-left: 3px solid #cc8f3d; color: #e5b66f; background: linear-gradient(90deg, rgba(191,126,40,.16), transparent 72%); font-size: 12px; letter-spacing: .105em; white-space: nowrap; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 214px); gap: 12px; }
    .card { position: relative; min-width: 0; overflow: hidden; padding: 14px 15px 12px; border: 1px solid #35372f; background: rgba(13,15,12,.78); transition: border-color .32s ease, background .32s ease, transform .32s ease, opacity .32s ease, filter .32s ease; }
    .card::after { content: ""; position: absolute; right: -42px; bottom: -42px; width: 105px; height: 105px; border: 1px solid rgba(190,133,58,.13); transform: rotate(45deg); }
    .card.active { z-index: 2; border-color: #c58b3e; background: rgba(54,42,25,.92); transform: scale(1.018); }
    .card.dim { opacity: .52; filter: blur(.4px) saturate(.7); }
    .card header { display: grid; grid-template-columns: 25px 1fr auto; align-items: center; gap: 8px; }
    .card header span { color: #b77d35; font-size: 10px; }
    .card header em { color: #7f8278; font-size: 9px; font-style: normal; letter-spacing: .13em; }
    .card header strong { color: #6fab80; font-size: 9px; font-weight: 500; letter-spacing: .1em; }
    h2 { margin: 15px 0 13px; color: #e5dccd; font: 500 18px/1.12 Georgia, serif; }
    .flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 6px; min-height: 42px; padding: 7px 8px; border-top: 1px solid #443b2e; border-bottom: 1px solid #302e28; }
    .flow b { color: #cfad79; font-size: 8px; font-weight: 500; line-height: 1.35; text-align: center; }
    .flow i { color: #77572f; font-size: 10px; font-style: normal; }
    p { margin: 12px 0 0; color: #878981; font: 10px/1.42 Georgia, serif; }
    .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; color: #6e7168; font-size: 9px; letter-spacing: .1em; }
    .foot strong { color: #a77a42; font-weight: 500; }
    .phase-readout { color: #b9b1a2; }
  </style>
</head>
<body>
  <main>
    <header class="mast">
      <div><div class="eyebrow">PACT / CP03 / STAGE B REPLACEMENT REPAIR</div><h1>Authority, terminal truth, and evidence boundaries</h1></div>
      <div class="seal">
        <span>LOCAL CHECKS</span><strong>${String(report.checks.length).padStart(2, "0")} / ${String(report.checks.length).padStart(2, "0")}</strong>
        <span>LEGACY ARCHIVE</span><strong>UNCHANGED</strong>
        <span>PROVIDER EVIDENCE</span><strong>UNVERIFIED</strong>
      </div>
    </header>
    <div class="banner" data-banner>${escapeHtml(banner)}</div>
    <section class="grid">${cards}</section>
    <footer class="foot"><span>GATE ${escapeHtml(report.repairGateSha256.slice(0, 16))}… / DETERMINISTIC LOCAL BOARD</span><strong class="phase-readout">SEQUENCE 00 / 06</strong><span>HUMAN SELECTION UNAVAILABLE · CP03 ACCEPTANCE UNCHANGED</span></footer>
  </main>
</body>
</html>`;
};

const pngDimensions = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  assert(bytes.length >= 24, "STAGE_B_REPAIR_SCREENSHOT_INVALID");
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "STAGE_B_REPAIR_SCREENSHOT_INVALID");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const resolveFfprobe = () => {
  const candidates = [
    process.env.PACT_FFPROBE_PATH,
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/usr/bin/ffprobe",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert(executable, "STAGE_B_REPAIR_FFPROBE_MISSING");
  return executable;
};

const rationalNumber = (value) => {
  const [numerator, denominator] = String(value).split("/").map(Number);
  return denominator > 0 ? numerator / denominator : Number(value);
};

const probeVideo = (videoPath) => {
  const raw = execFileSync(resolveFfprobe(), [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,r_frame_rate:format=duration",
    "-of", "json",
    videoPath,
  ], { encoding: "utf8" });
  const parsed = JSON.parse(raw);
  const stream = parsed.streams?.[0];
  const durationSeconds = Number(parsed.format?.duration);
  const frameRate = rationalNumber(stream?.r_frame_rate);
  assert(["vp8", "vp9"].includes(stream?.codec_name), "STAGE_B_REPAIR_VIDEO_CODEC_INVALID");
  assert(stream?.width === viewport.width && stream?.height === viewport.height, "STAGE_B_REPAIR_VIDEO_DIMENSIONS_INVALID");
  assert(Number.isFinite(frameRate) && frameRate >= 20 && frameRate <= 60, "STAGE_B_REPAIR_VIDEO_FRAME_RATE_INVALID");
  assert(Number.isFinite(durationSeconds) && durationSeconds >= 17 && durationSeconds <= 24, "STAGE_B_REPAIR_VIDEO_DURATION_INVALID");
  return {
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    frameRate: stream.r_frame_rate,
    durationSeconds,
  };
};

const assertBannerVisible = async (page) => {
  const locator = page.locator("[data-banner]");
  assert(await locator.isVisible(), "STAGE_B_REPAIR_BANNER_NOT_VISIBLE");
  assert((await locator.innerText()).trim() === banner, "STAGE_B_REPAIR_BANNER_TEXT_INVALID");
  const box = await locator.boundingBox();
  assert(
    box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    "STAGE_B_REPAIR_BANNER_OUTSIDE_VIEWPORT",
  );
};

const launchCaptureBrowser = () => chromium.launch({
  executablePath: resolveChromePath(),
  headless: false,
  args: [
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-lcd-text",
    "--disable-font-subpixel-positioning",
    "--disable-skia-runtime-opts",
    "--force-color-profile=srgb",
    `--window-size=${viewport.width},${viewport.height}`,
  ],
});

const createCaptureReport = ({ gate, network, screenshotPath, videoProbe }) => {
  const report = {
    schemaVersion: "cp03-stage-b-replacement-repair-capture/0.1",
    status: "PASS",
    mode: "local-scripted",
    banner,
    repairGateSha256: gate.repairGateSha256,
    repairCheckCount: gate.checks.length,
    visibleSequence: boardSequence.map(({ id }) => id),
    browser: {
      requestCount: network.requestCount,
      requests: network.requests,
      nonLocalRequestCount: network.nonLocalRequestCount,
      nonLocalRequests: network.nonLocalRequests,
      failedRequests: network.failedRequests,
      consoleErrors: network.consoleErrors,
      bannerVisibilityChecks: boardSequence.length + 2,
    },
    screenshot: {
      path: "media/local-repair-summary.png",
      width: viewport.width,
      height: viewport.height,
      sha256: sha256File(screenshotPath),
    },
    video: {
      path: "media/local-repair-summary.webm",
      container: "webm",
      codec: videoProbe.codec,
      width: videoProbe.width,
      height: videoProbe.height,
      frameRate: videoProbe.frameRate,
      durationClass: "17_to_24_seconds",
      decodable: true,
      visibleSequence: boardSequence.map(({ id }) => id),
    },
    providerRequestsMade: 0,
    keychainReads: 0,
    externalNetworkRequests: 0,
    preflightsCreated: 0,
    runsStarted: 0,
    providerCompatibilityProven: false,
    humanModelSelectionAvailable: false,
    rubyMutationShown: false,
    cp03AcceptanceChanged: false,
  };
  return { ...report, reportSha256: canonicalSha256(report) };
};

export async function captureStageBRepair({ gateReportPath, outputDir }) {
  assertOutputBoundary(outputDir);
  const gate = readVerifiedGate(gateReportPath);
  const mediaDir = path.join(outputDir, "media");
  const screenshotPath = path.join(mediaDir, "local-repair-summary.png");
  const videoPath = path.join(mediaDir, "local-repair-summary.webm");
  const reportPath = path.join(outputDir, "capture-report.json");
  for (const target of [screenshotPath, videoPath, reportPath]) {
    assert(!fs.existsSync(target), "STAGE_B_REPAIR_CAPTURE_TARGET_EXISTS");
  }
  fs.mkdirSync(mediaDir, { recursive: true });

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pact-cp03-stage-b-repair-capture-"));
  const recorder = createNetworkRecorder();
  let browser;
  let context;
  try {
    browser = await launchCaptureBrowser();
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: stagingDir, size: viewport },
    });
    const page = await context.newPage();
    recorder.attach(page, "cp03-stage-b-replacement-repair");
    const video = page.video();
    await page.setContent(boardHtml(gate), { waitUntil: "load" });
    assert(await page.locator(".card").count() === boardSequence.length, "STAGE_B_REPAIR_CARD_COUNT_INVALID");
    await assertBannerVisible(page);
    await page.screenshot({ path: screenshotPath, type: "png", animations: "disabled" });
    await page.waitForTimeout(1_500);
    for (let index = 0; index < boardSequence.length; index += 1) {
      await page.locator(".card").evaluateAll((elements, activeIndex) => {
        elements.forEach((element, elementIndex) => {
          element.classList.toggle("active", elementIndex === activeIndex);
          element.classList.toggle("dim", elementIndex !== activeIndex);
        });
      }, index);
      await page.locator(".phase-readout").evaluate((element, activeIndex) => {
        element.textContent = `SEQUENCE ${String(activeIndex + 1).padStart(2, "0")} / 06`;
      }, index);
      await assertBannerVisible(page);
      await page.waitForTimeout(2_500);
    }
    await page.locator(".card").evaluateAll((elements) => {
      elements.forEach((element) => element.classList.remove("active", "dim"));
    });
    await page.locator(".phase-readout").evaluate((element) => {
      element.textContent = "SEQUENCE 06 / 06 · LOCAL GATE CLOSED";
    });
    await assertBannerVisible(page);
    await page.waitForTimeout(1_500);
    await context.close();
    context = undefined;
    await video.saveAs(videoPath);
  } finally {
    await context?.close();
    await browser?.close();
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  const screenshotDimensions = pngDimensions(screenshotPath);
  assert(
    screenshotDimensions.width === viewport.width && screenshotDimensions.height === viewport.height,
    "STAGE_B_REPAIR_SCREENSHOT_DIMENSIONS_INVALID",
  );
  assert(fs.statSync(videoPath).size > 0, "STAGE_B_REPAIR_VIDEO_MISSING");
  const videoProbe = probeVideo(videoPath);
  const network = recorder.snapshot();
  assert(network.nonLocalRequestCount === 0, "STAGE_B_REPAIR_CAPTURE_NON_LOCAL_REQUEST");
  assert(network.failedRequests.length === 0, "STAGE_B_REPAIR_CAPTURE_REQUEST_FAILURE");
  assert(network.consoleErrors.length === 0, "STAGE_B_REPAIR_CAPTURE_CONSOLE_ERROR");
  const report = createCaptureReport({ gate, network, screenshotPath, videoProbe });
  fs.writeFileSync(reportPath, `${canonicalJson(report)}\n`, { flag: "wx", mode: 0o600 });
  return {
    reportPath,
    reportSha256: report.reportSha256,
    screenshotSha256: report.screenshot.sha256,
    videoSha256: sha256File(videoPath),
    videoDurationSeconds: videoProbe.durationSeconds,
    nonLocalBrowserRequests: network.nonLocalRequestCount,
  };
}

const main = async () => {
  const result = await captureStageBRepair(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

main().catch((error) => {
  const code = error instanceof Error ? error.message.split(":")[0] : "UNKNOWN";
  process.stderr.write(`Stage B repair capture failed safely: ${code}.\n`);
  process.exitCode = 1;
});
