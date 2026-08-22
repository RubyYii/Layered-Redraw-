import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import {
  assert,
  collectBrowserEnvironment,
  createNetworkRecorder,
  launchCp02Browser,
  projectRoot,
  readTargetMachine,
  runtimeCommit,
  startCp02Server,
  viewport,
  writeJson,
} from "./smoke-test-cp02.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const artifactRoot = path.join(projectRoot, "artifacts", "cp03-foundation");
const softwareRendererPattern = /swiftshader|llvmpipe|software renderer|mesa offscreen/i;

const safeTimestamp = () => new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const pngChunk = (type, data = Buffer.alloc(0)) => {
  const name = Buffer.from(type, "ascii");
  const body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
};

const createTinyPng = (width, height, pixelAt) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha = 255] = pixelAt(x, y);
      const offset = rowStart + 1 + x * 4;
      scanlines[offset] = red;
      scanlines[offset + 1] = green;
      scanlines[offset + 2] = blue;
      scanlines[offset + 3] = alpha;
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND"),
  ]);
};

const createSpatialBridgeFixture = () => {
  const rgb = createTinyPng(4, 2, (x, y) => y === 0
    ? [232 - x * 18, 143 + x * 17, 55 + x * 26]
    : [32 + x * 24, 70 + x * 20, 104 + x * 21]);
  const depth = createTinyPng(4, 2, (x, y) => {
    const nearness = 160 - Math.round(((y * 4 + x) / 7) * 65);
    return [nearness, nearness, nearness];
  });
  const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
  const bridge = {
    kind: "layered-redraw-spatial-bridge",
    schema_version: "1.0",
    source: {
      id: "cp03-foundation-rgb",
      role: "primary-rgb",
      label: "CP03 Governed RGB-D",
      width: 4,
      height: 2,
      rgb_artifact: "references/cp03-foundation/rgb.png",
      rgb_sha256: hash(rgb),
    },
    depth: {
      id: "cp03-foundation-depth",
      preview_artifact: "references/cp03-foundation/depth/depth-preview.png",
      artifact_sha256: { preview: hash(depth) },
      orientation: "near-white",
      relative_depth: true,
      metric_scale: false,
    },
    surface: {
      representation: "rgb-depth-heightfield",
      mesh_resolution: 24,
      displacement: 0.65,
      perspective: 0.58,
      near_direction: "+surface-normal",
      texture_fit: "preserve-aspect",
    },
    semantic_layers: { status: "missing", count: 0, layers: [] },
    invariants: {
      raw_depth_immutable: true,
      art_direction_changes_interpretation_only: true,
      relative_depth_must_not_be_treated_as_metres: true,
    },
    handoff: {
      target: "apps/scene-builder",
      contract: "depth-heightfield-v1",
      status: "ready-for-import",
    },
    contract_sha256: "d".repeat(64),
  };
  return {
    inputs: [
      { name: "spatial-bridge.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bridge)) },
      { name: "rgb.png", mimeType: "image/png", buffer: rgb },
      { name: "depth-preview.png", mimeType: "image/png", buffer: depth },
    ],
    rgbSha256: hash(rgb),
    depthSha256: hash(depth),
  };
};

const cp02Snapshot = (page) => page.evaluate(() => window.__PACT_CP02_EVIDENCE__.snapshot());

const pauseForEvidence = (page, durationMs = 700) => page.waitForTimeout(durationMs);

const waitForCp02Ready = (page) => page.waitForFunction(
  () => window.__PACT_CP02_EVIDENCE__?.snapshot().ready === true,
  undefined,
  { timeout: 15_000 },
);

const selectCarrier = async (page, objectId) => {
  const carrier = page.locator(`.hierarchy-main[data-object-id="${objectId}"]`);
  assert(await carrier.count() === 1, `Carrier ${objectId} is missing from the scene hierarchy`);
  // CP02 deliberately hides the ordinary editor side panel. Dispatch the existing
  // hierarchy button's selection handler without adding a CP03-only product UI.
  await carrier.evaluate((button) => button.click());
  await page.waitForFunction(
    (selectedId) => document.querySelector(`.hierarchy-main[data-object-id="${selectedId}"]`)
      ?.closest(".hierarchy-row")?.getAttribute("aria-selected") === "true",
    objectId,
  );
};

const importSpatialFixture = (page, fixture) => page.locator("#spatial-bridge-files").setInputFiles(fixture.inputs);

export async function runCp03FoundationSmoke() {
  const runId = safeTimestamp();
  const runRoot = path.join(artifactRoot, "runs", runId);
  const stillsDir = path.join(runRoot, "stills");
  const rawVideoDir = path.join(runRoot, "raw-video");
  const reportPath = path.join(runRoot, "foundation-visible-smoke.report.json");
  const videoPath = path.join(runRoot, "foundation-visible-smoke-uncut.webm");
  const authorisedScreenshotPath = path.join(stillsDir, "01-authorised-rgbd.png");
  const rejectedScreenshotPath = path.join(stillsDir, "02-source-locked-rejected.png");
  fs.mkdirSync(stillsDir, { recursive: true });
  fs.mkdirSync(rawVideoDir, { recursive: true });

  const fixture = createSpatialBridgeFixture();
  const networkRecorder = createNetworkRecorder();
  const runtimeHead = runtimeCommit();
  const targetMachine = readTargetMachine();
  let server;
  let browser;
  let context;
  let page;
  let video;
  let origin;

  try {
    ({ server, origin } = await startCp02Server());
    const launched = await launchCp02Browser({ headless: false });
    browser = launched.browser;
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: rawVideoDir, size: viewport },
    });
    page = await context.newPage();
    video = page.video();
    networkRecorder.attach(page, "cp03-foundation-visible");
    await page.goto(`${origin}/?case=pact-cp02`, { waitUntil: "networkidle" });
    await waitForCp02Ready(page);

    const environment = await collectBrowserEnvironment(page, {
      browser,
      headless: false,
      targetMachine,
    });
    assert(environment.mode === "headful", "CP03 foundation evidence must use visible Chrome");
    assert(
      environment.viewport.width === viewport.width && environment.viewport.height === viewport.height,
      `CP03 foundation viewport must be ${viewport.width}x${viewport.height}`,
    );
    assert(!softwareRendererPattern.test(String(environment.webgl?.renderer ?? "")), "CP03 foundation used a software renderer");

    const initial = await cp02Snapshot(page);
    assert(initial.governanceCounts.SOURCE_LOCKED === 1, "CP03 foundation requires one source-locked photograph");
    assert(initial.appliedPatchDepth === 0, "CP03 foundation did not start from an unmodified CP02 project");

    await page.locator("#cp02-evidence-overlay").check();
    await page.locator("#cp02-preview").click();
    await page.waitForFunction(() => window.__PACT_CP02_EVIDENCE__.snapshot().outcome === "PROPOSED");
    await pauseForEvidence(page);
    await page.locator("#cp02-guardian-allow").click();
    await page.waitForFunction(() => {
      const state = window.__PACT_CP02_EVIDENCE__.snapshot();
      return state.appliedPatchDepth === 1
        && state.latestReceipt?.outcome === "APPLIED"
        && state.projectHash === state.latestReceipt.resultHash
        && state.materializedAssets.length === 2;
    });
    const authorised = await cp02Snapshot(page);
    assert(authorised.authorisedObjectIds.includes("cp02-memory-table"), "Authorised table carrier is missing");

    await selectCarrier(page, "cp02-memory-table");
    await importSpatialFixture(page, fixture);
    await page.waitForFunction(
      () => document.querySelector("#asset-session-title")?.textContent === "CP03 Governed RGB-D",
      undefined,
      { timeout: 10_000 },
    );
    const authorisedDetail = await page.locator("#asset-session-detail").textContent();
    assert(authorisedDetail?.includes("RGB／深度哈希已验证"), "Authorised RGB-D import did not expose hash verification");
    assert(authorisedDetail?.includes("相对 2.5D"), "Authorised RGB-D import hid the relative-scale boundary");
    const afterAuthorisedImport = await cp02Snapshot(page);
    assert(afterAuthorisedImport.projectHash === authorised.projectHash, "Session RGB-D import changed the governed project hash");
    await pauseForEvidence(page, 900);
    await page.screenshot({ path: authorisedScreenshotPath, animations: "disabled" });

    await selectCarrier(page, "sandbox-photo_image");
    const sourceTitleBefore = await page.locator("#asset-session-title").textContent();
    await importSpatialFixture(page, fixture);
    await page.waitForFunction(() => {
      const toast = document.querySelector("#toast");
      return !toast?.hidden && /SOURCE_LOCKED|载体禁止附加运行时素材/.test(toast?.textContent ?? "");
    });
    const rejectionText = await page.locator("#toast").textContent();
    assert(/SOURCE_LOCKED/.test(rejectionText ?? ""), "Source-targeted RGB-D import did not identify SOURCE_LOCKED");
    assert(await page.locator("#asset-session-title").textContent() === sourceTitleBefore, "Rejected source import changed its session asset");
    const afterSourceAttempt = await cp02Snapshot(page);
    assert(afterSourceAttempt.projectHash === authorised.projectHash, "Rejected source import changed the governed project hash");
    assert(afterSourceAttempt.governanceCounts.SOURCE_LOCKED === 1, "Rejected source import lost source governance");
    await page.screenshot({ path: rejectedScreenshotPath, animations: "disabled" });
    await pauseForEvidence(page, 900);

    await page.locator("#cp02-undo").click();
    await page.waitForFunction((expectedHash) => {
      const state = window.__PACT_CP02_EVIDENCE__.snapshot();
      return state.appliedPatchDepth === 0
        && state.latestReceipt?.outcome === "UNDONE"
        && state.projectHash === expectedHash;
    }, initial.projectHash);
    const undone = await cp02Snapshot(page);
    assert(undone.projectHash === initial.projectHash, "CP03 foundation undo did not restore the exact initial project hash");
    assert(undone.governanceCounts.SOURCE_LOCKED === 1, "CP03 foundation undo lost source governance");
    await pauseForEvidence(page, 700);

    const network = networkRecorder.snapshot();
    assert(network.nonLocalRequestCount === 0, `Non-loopback browser requests detected: ${network.nonLocalRequestCount}`);
    assert(network.consoleErrors.length === 0, `Browser errors detected: ${JSON.stringify(network.consoleErrors)}`);

    const report = {
      schemaVersion: 1,
      runId,
      capturedAt: new Date().toISOString(),
      runtimeCommit: runtimeHead,
      status: "PASS",
      evidenceTier: "LOCAL_RUNTIME_TESTED",
      artisticApproval: false,
      environment,
      fixture: {
        label: "CP03 Governed RGB-D",
        rgbSha256: fixture.rgbSha256,
        depthSha256: fixture.depthSha256,
        metricScale: false,
        collisionGeometry: false,
      },
      governance: {
        initialProjectHash: initial.projectHash,
        authorisedProjectHash: authorised.projectHash,
        authorisedCarrier: "cp02-memory-table",
        sourceCarrier: "sandbox-photo_image",
        sourceState: "SOURCE_LOCKED",
        sourceAttachmentRejected: true,
        rejectionText,
        exactUndoRestored: undone.projectHash === initial.projectHash,
      },
      network,
      artifacts: {
        authorisedScreenshot: authorisedScreenshotPath,
        sourceRejectionScreenshot: rejectedScreenshotPath,
        uncutVideo: videoPath,
      },
      boundary: "Engineering foundation evidence only; no model provider was called and no artistic approval is implied.",
    };

    await page.close();
    await context.close();
    const rawVideoPath = await video.path();
    fs.renameSync(rawVideoPath, videoPath);
    writeJson(reportPath, report);
    return { ok: true, runId, reportPath, videoPath, authorisedScreenshotPath, rejectedScreenshotPath };
  } catch (error) {
    const network = networkRecorder.snapshot();
    writeJson(path.join(runRoot, "foundation-visible-smoke.failure.json"), {
      schemaVersion: 1,
      runId,
      failedAt: new Date().toISOString(),
      runtimeCommit: runtimeHead,
      message: error.message,
      stack: error.stack,
      network,
      preserved: true,
    });
    throw error;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMain) {
  runCp03FoundationSmoke()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
