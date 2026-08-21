import fs from "node:fs";
import path from "node:path";

import {
  artifactRoot,
  assert,
  createNetworkRecorder,
  launchCp02Browser,
  projectPath,
  runInteractionSequence,
  runtimeCommit,
  sha256File,
  sourceLockPath,
  startCp02Server,
  viewport,
  writeJson,
} from "./smoke-test-cp02.mjs";

const expectedStills = [
  "01-establishing.png",
  "02-before.png",
  "03-preview.png",
  "04-authorised.png",
  "05-thermos-proposed.png",
  "06-cup-and-thermos.png",
  "07-thermos-undone.png",
  "08-undone.png",
  "09-rejected.png",
];

const expectedReceipts = [
  "01-initial-apply.json",
  "02-thermos-apply.json",
  "03-undo-thermos.json",
  "04-chair-move.json",
  "05-undo-chair.json",
  "06-undo-initial.json",
  "07-source-rejected.json",
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const pngDimensions = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  assert(buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG", `Invalid PNG: ${filePath}`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const fileRecord = (filePath) => ({
  path: path.relative(artifactRoot, filePath),
  bytes: fs.statSync(filePath).size,
  sha256: sha256File(filePath),
});

const preserveExistingInteraction = (runId) => {
  const outputPath = path.join(artifactRoot, "interaction.webm");
  if (!fs.existsSync(outputPath)) return null;
  const historyDir = path.join(artifactRoot, "history", `${runId}-render-rerun`);
  fs.mkdirSync(historyDir, { recursive: true });
  const archivedPath = path.join(historyDir, "interaction.webm");
  fs.renameSync(outputPath, archivedPath);
  return archivedPath;
};

const mergeNetworkReports = (smokeNetwork, renderNetwork) => ({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  smoke: smokeNetwork,
  render: renderNetwork,
  requestCount: Number(smokeNetwork.requestCount ?? 0) + Number(renderNetwork.requestCount ?? 0),
  nonLocalRequestCount: Number(smokeNetwork.nonLocalRequestCount ?? 0) + Number(renderNetwork.nonLocalRequestCount ?? 0),
  nonLocalRequests: [...(smokeNetwork.nonLocalRequests ?? []), ...(renderNetwork.nonLocalRequests ?? [])],
  failedRequests: [...(smokeNetwork.failedRequests ?? []), ...(renderNetwork.failedRequests ?? [])],
  consoleErrors: [...(smokeNetwork.consoleErrors ?? []), ...(renderNetwork.consoleErrors ?? [])],
});

export async function renderCp02Evidence() {
  const runStatePath = path.join(artifactRoot, "run-state.json");
  const performancePath = path.join(artifactRoot, "performance.json");
  const networkPath = path.join(artifactRoot, "network.json");
  for (const required of [runStatePath, performancePath, networkPath, projectPath, sourceLockPath]) {
    assert(fs.existsSync(required), `Missing CP02 smoke prerequisite: ${required}`);
  }

  const runState = readJson(runStatePath);
  const performance = readJson(performancePath);
  const smokeNetwork = readJson(networkPath);
  assert(performance.correctness?.status === "PASS", "CP02 correctness smoke did not pass");
  assert(smokeNetwork.nonLocalRequestCount === 0, "Smoke evidence contains non-local requests");
  assert(smokeNetwork.consoleErrors?.length === 0, "Smoke evidence contains browser errors");

  const stillPaths = expectedStills.map((name) => path.join(artifactRoot, "stills", name));
  const receiptPaths = expectedReceipts.map((name) => path.join(artifactRoot, "receipts", name));
  for (const required of [...stillPaths, ...receiptPaths]) assert(fs.existsSync(required), `Missing CP02 artifact: ${required}`);
  for (const stillPath of stillPaths) {
    const dimensions = pngDimensions(stillPath);
    assert(dimensions.width === viewport.width && dimensions.height === viewport.height, `Still is not 1280x720: ${stillPath}`);
  }

  const archivedInteraction = preserveExistingInteraction(runState.runId);
  const videoStagingDir = path.join(artifactRoot, "video-staging", runState.runId);
  fs.mkdirSync(videoStagingDir, { recursive: true });
  const interactionPath = path.join(artifactRoot, "interaction.webm");
  const renderNetworkRecorder = createNetworkRecorder();

  let server;
  let browser;
  let context;
  let origin;
  try {
    ({ server, origin } = await startCp02Server());
    const launched = await launchCp02Browser({ headless: process.env.CP02_HEADLESS === "1" });
    browser = launched.browser;
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: videoStagingDir, size: viewport },
    });
    const page = await context.newPage();
    renderNetworkRecorder.attach(page, "uncut-interaction-video");
    const video = page.video();
    await page.goto(`${origin}/?case=pact-cp02`, { waitUntil: "networkidle" });
    await runInteractionSequence(page, { pauseMs: 850 });
    await page.waitForTimeout(1200);
    await context.close();
    context = null;
    await video.saveAs(interactionPath);
  } finally {
    await context?.close();
    await browser?.close();
    await server?.close();
  }

  assert(fs.existsSync(interactionPath), "Playwright did not produce interaction.webm");
  assert(fs.statSync(interactionPath).size > 100_000, "interaction.webm is unexpectedly small");

  const renderNetwork = renderNetworkRecorder.snapshot();
  const network = mergeNetworkReports(smokeNetwork, renderNetwork);
  writeJson(networkPath, network);
  assert(network.nonLocalRequestCount === 0, `Render captured ${network.nonLocalRequestCount} non-local requests`);
  assert(network.consoleErrors.length === 0, `Render captured browser errors: ${JSON.stringify(network.consoleErrors)}`);

  const sourceLock = readJson(sourceLockPath);
  const project = readJson(projectPath);
  const commit = runtimeCommit();
  const report = {
    schemaVersion: 1,
    runId: runState.runId,
    generatedAt: new Date().toISOString(),
    runtimeCommit: commit,
    sourceRuntimeCommit: sourceLock.runtimeCommit,
    sourceProjectSha256: sourceLock.baseProject.sha256,
    sourcePhotoSha256: sourceLock.b2Source.sha256,
    projectObjectCount: project.objects.length,
    executionMode: "engineering-evidence",
    correctness: performance.correctness,
    runtimeDecision: {
      status: performance.gate.status,
      metrics: performance.gate.metrics,
      evidenceTier: performance.gate.status === "PASS" ? "RUNTIME_TESTED_CANDIDATE" : "STAGE_EXPERIMENT",
      note: "Archive verification is still required before RUNTIME_TESTED; this decision never implies artistic approval.",
    },
    network: {
      status: network.nonLocalRequestCount === 0 && network.consoleErrors.length === 0 ? "PASS" : "FAIL",
      requestCount: network.requestCount,
      nonLocalRequestCount: network.nonLocalRequestCount,
      consoleErrorCount: network.consoleErrors.length,
    },
    media: {
      interaction: fileRecord(interactionPath),
      uncutInteractionCapture: true,
      stills: stillPaths.map((filePath) => ({ ...fileRecord(filePath), ...pngDimensions(filePath) })),
      receipts: receiptPaths.map(fileRecord),
    },
    visualInspection: {
      status: "PENDING_CONTROLLER_INSPECTION",
      inspectedFiles: [],
      observations: [],
      artistDecision: "PENDING_HUMAN_REVIEW",
      artisticallyApproved: false,
    },
    casePack: interaction.initial.casePack,
    localAssetDisplay: {
      materializedDuringCheckpoint: true,
      publicReleaseAuthorized: interaction.initial.casePack.publicReleaseAuthorized,
      status: "LOCAL_CASE_PACK_MATERIALIZED",
      initialMaterializedAssets: interaction.authorised.materializedAssets,
      additiveMaterializedAssets: interaction.thermosAuthorised.materializedAssets,
    },
    preservedPreviousInteraction: archivedInteraction,
  };
  writeJson(path.join(artifactRoot, "render-report.json"), report);
  writeJson(runStatePath, {
    ...runState,
    renderCompletedAt: new Date().toISOString(),
    renderStatus: "PASS_PENDING_VISUAL_INSPECTION",
    interactionSha256: report.media.interaction.sha256,
  });
  return {
    ok: true,
    runId: runState.runId,
    interaction: report.media.interaction,
    stills: report.media.stills.length,
    performanceStatus: performance.gate.status,
    visualInspection: report.visualInspection.status,
  };
}

renderCp02Evidence()
  .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch((error) => {
    writeJson(path.join(artifactRoot, "render-failure.json"), {
      schemaVersion: 1,
      failedAt: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      preserved: true,
    });
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
