import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { humanResearchConfigErrors } from "../src/experiment-core.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedStages = new Set(["cognitive-pilot", "study-a", "study-b", "expert"]);
const expectedLaunchRecords = {
  "cognitive-pilot": "../data/frozen/pilot-launch-record.json",
  "study-a": "../data/frozen/study-a-launch-record.json",
  "study-b": "../data/frozen/study-b-launch-record.json",
  expert: "../data/frozen/expert-launch-record.json"
};
const governanceFiles = [
  "data/frozen/governance/approval-record.json",
  "data/frozen/governance/participant-information-sheet.md",
  "data/frozen/governance/consent-form.md",
  "data/frozen/governance/debrief.md",
  "data/frozen/governance/recruitment-notice.md",
  "data/frozen/governance/data-management-plan.md"
];
const stageFiles = {
  "cognitive-pilot": [
    "data/frozen/pilot-package-freeze.json",
    "data/frozen/pilot-study-b-manifest.json",
    "data/frozen/pilot-study-a-ids.csv",
    "data/frozen/pilot-study-b-ids.csv",
    "data/frozen/pilot-expert-ids.csv"
  ],
  "study-a": [
    "data/frozen/pilot-summary.json",
    "data/frozen/sample-plan.json",
    "data/frozen/study-b-power-input.json",
    "data/frozen/study-b-power-report.json",
    "data/frozen/study-b-model-config.json",
    "data/frozen/study-a-package-freeze.json",
    "data/frozen/study-a-ids.csv"
  ],
  "study-b": [
    "data/frozen/pilot-summary.json",
    "data/frozen/sample-plan.json",
    "data/frozen/study-b-power-input.json",
    "data/frozen/study-b-power-report.json",
    "data/frozen/study-b-model-config.json",
    "data/frozen/study-b-package-freeze.json",
    "data/frozen/study-b-manifest.json",
    "data/frozen/study-b-ids.csv"
  ],
  expert: [
    "data/frozen/pilot-summary.json",
    "data/frozen/sample-plan.json",
    "data/frozen/study-b-power-input.json",
    "data/frozen/study-b-power-report.json",
    "data/frozen/study-b-model-config.json",
    "data/frozen/expert-package-freeze.json",
    "data/frozen/study-b-manifest.json",
    "data/frozen/expert-ids.csv"
  ]
};

export async function assessHumanLaunchReadiness({ projectRoot = defaultRoot, stage }) {
  if (!allowedStages.has(stage)) throw new Error(`stage must be one of: ${[...allowedStages].join(", ")}`);
  const errors = [];
  const warnings = ["Mechanical readiness only: this report cannot establish ethics approval or researcher authorisation."];
  const config = await readJson(projectRoot, "config/study-config.json", errors);
  if (!config) return result(stage, errors, warnings);

  errors.push(...humanResearchConfigErrors(config));
  const expectedPhase = stage === "cognitive-pilot" ? "cognitive_pilot" : "main";
  if (config.collection_phase !== expectedPhase) errors.push(`${stage} requires collection_phase ${expectedPhase}`);
  if (config.allow_external_requests !== false) errors.push("allow_external_requests must remain false");
  if (config.launch_record !== expectedLaunchRecords[stage]) errors.push(`${stage} launch_record must be ${expectedLaunchRecords[stage]}`);

  for (const relativePath of [...governanceFiles, ...stageFiles[stage]]) {
    const text = await readText(projectRoot, relativePath, errors);
    if (text !== null && containsPlaceholder(text)) errors.push(`${relativePath} still contains placeholder text`);
  }

  const approval = await readJson(projectRoot, governanceFiles[0], errors, { duplicateMissing: false });
  if (approval) validateApprovalRecord(approval, config, stage, errors);

  let samplePlan = null;
  if (stage !== "cognitive-pilot") {
    const pilot = await readJson(projectRoot, "data/frozen/pilot-summary.json", errors, { duplicateMissing: false });
    if (pilot) validatePilotSummary(pilot, errors);
    samplePlan = await readJson(projectRoot, "data/frozen/sample-plan.json", errors, { duplicateMissing: false });
    if (samplePlan) validateSamplePlan(samplePlan, errors);
    if (samplePlan) await validatePlanningProvenance(projectRoot, samplePlan, errors);
  }

  const freezePath = stage === "cognitive-pilot"
    ? "data/frozen/pilot-package-freeze.json"
    : `data/frozen/${stage}-package-freeze.json`;
  const freeze = await readJson(projectRoot, freezePath, errors, { duplicateMissing: false });
  if (freeze) await validateFreeze(freeze, config, stage, projectRoot, errors);

  if (stage === "cognitive-pilot" || stage === "study-b" || stage === "expert") {
    const manifestPath = stage === "cognitive-pilot" ? "data/frozen/pilot-study-b-manifest.json" : "data/frozen/study-b-manifest.json";
    const manifest = await readJson(projectRoot, manifestPath, errors, { duplicateMissing: false });
    if (manifest) validateManifest(manifest, errors);
    const expectedManifestSuffix = stage === "cognitive-pilot" ? "data/frozen/pilot-study-b-manifest.json" : "data/frozen/study-b-manifest.json";
    const configuredManifests = stage === "cognitive-pilot" ? [config.study_b_manifest, config.expert_manifest] : [stage === "study-b" ? config.study_b_manifest : config.expert_manifest];
    if (configuredManifests.some((value) => !String(value || "").replaceAll("\\", "/").endsWith(expectedManifestSuffix))) {
      errors.push(`${stage} config manifest path must point to ${expectedManifestSuffix}`);
    }
  }

  await validateStageIdSheets(projectRoot, stage, samplePlan, errors);

  return result(stage, errors, warnings);
}

function validateApprovalRecord(record, config, stage, errors) {
  const pairs = [
    ["reviewRoute", "review_route"],
    ["ethicsStatus", "ethics_status"],
    ["approvedProtocolId", "approved_protocol_id"],
    ["protocolVersion", "protocol_version"],
    ["participantDocumentsVersion", "participant_documents_version"],
    ["institution", "institution"]
  ];
  for (const [recordField, configField] of pairs) {
    if (record[recordField] !== config[configField]) errors.push(`approval record ${recordField} does not match config ${configField}`);
  }
  if (stage === "cognitive-pilot" && record.scopeIncludesCognitivePilot !== true) errors.push("approval record does not cover the cognitive pilot");
  if (stage !== "cognitive-pilot" && record.scopeIncludesMainStudy !== true) errors.push("approval record does not cover the main study");
  if (!record.recordedAt || Number.isNaN(Date.parse(record.recordedAt))) errors.push("approval record recordedAt is invalid");
}

function validatePilotSummary(pilot, errors) {
  if (pilot.schemaVersion !== "kfc-pilot-summary/0.1") errors.push("pilot summary schemaVersion is invalid");
  if (Number(pilot.makerSessions) < 4) errors.push("pilot summary has fewer than 4 maker sessions");
  if (Number(pilot.audienceSessions) < 8) errors.push("pilot summary has fewer than 8 audience sessions");
  if (Number(pilot.expertSessions) < 2) errors.push("pilot summary has fewer than 2 expert sessions");
  for (const field of [
    "mainDatasetExcluded",
    "allReturnsStoredOutsideMainCorpus",
    "makerInteractionFailuresResolved",
    "layerCueingRiskReviewed",
    "flatTargetFidelityReviewed",
    "audienceComprehensionThresholdReviewed",
    "protocolTimingAndLengthReviewed",
    "expertBlindLeakCheckPassed",
    "openOnlyLengthFailureRuledOut"
  ]) {
    if (pilot[field] !== true) errors.push(`pilot summary ${field} must be true before main collection`);
  }
  if (!Array.isArray(pilot.unresolvedPrimaryBlockers) || pilot.unresolvedPrimaryBlockers.length) errors.push("pilot summary has unresolved primary blockers");
  if (pilot.decision !== "PROCEED") errors.push("pilot summary decision must be PROCEED");
  if (!pilot.signedOffAt || Number.isNaN(Date.parse(pilot.signedOffAt))) errors.push("pilot summary signedOffAt is invalid");
}

function validateSamplePlan(plan, errors) {
  if (plan.schemaVersion !== "kfc-sample-plan/0.1") errors.push("sample plan schemaVersion is invalid");
  if (!plan.frozenAt || Number.isNaN(Date.parse(plan.frozenAt))) errors.push("sample plan frozenAt is invalid");
  if (!plan.frozenBeforeConfirmatoryOutcomeInspection) errors.push("sample plan was not frozen before confirmatory outcome inspection");
  if (plan.pilotExcluded !== true) errors.push("sample plan must exclude pilot records");
  if (plan.studyA?.analysableTarget !== 18 || plan.studyA?.maximum !== 24 || plan.studyA?.blockSize !== 6) errors.push("Study A sample plan does not match the preregistered block design");
  const mode = plan.claimMode;
  if (!["confirmatory_protocol_effect", "formative_mechanism"].includes(mode)) errors.push("sample plan claimMode is invalid");
  const target = Number(plan.studyB?.analysableTarget);
  const maximum = Number(plan.studyB?.recruitMaximum);
  if (!Number.isSafeInteger(target) || target < 1) errors.push("Study B analysableTarget must be a positive integer");
  if (!Number.isSafeInteger(maximum) || maximum < target || maximum % 4 !== 0) errors.push("Study B recruitMaximum must be at least the target and end on a four-ID block");
  if (plan.studyB?.blockSize !== 4) errors.push("Study B blockSize must be 4");
  for (const field of ["simulationInputSha256", "simulationReportSha256", "simulationScriptSha256", "modelConfigSha256"]) {
    if (!/^[a-f0-9]{64}$/.test(String(plan.studyB?.[field] || ""))) errors.push(`Study B ${field} must be a SHA-256`);
  }
  if (mode === "confirmatory_protocol_effect" && (target < 128 || plan.studyB?.populationEffectClaimAllowed !== true)) {
    errors.push("confirmatory Study B requires at least 128 analysable and populationEffectClaimAllowed true");
  }
  if (mode === "formative_mechanism" && plan.studyB?.populationEffectClaimAllowed !== false) {
    errors.push("formative Study B must set populationEffectClaimAllowed false");
  }
}

async function validatePlanningProvenance(projectRoot, plan, errors) {
  const inputPath = "data/frozen/study-b-power-input.json";
  const reportPath = "data/frozen/study-b-power-report.json";
  const modelConfigPath = "data/frozen/study-b-model-config.json";
  const scriptPath = "analysis/study_b_power_simulation.py";
  const inputBytes = await readBytes(projectRoot, inputPath, errors);
  const reportBytes = await readBytes(projectRoot, reportPath, errors);
  const modelConfigBytes = await readBytes(projectRoot, modelConfigPath, errors);
  const scriptBytes = await readBytes(projectRoot, scriptPath, errors);
  if (!inputBytes || !reportBytes || !modelConfigBytes || !scriptBytes) return;
  const inputHash = sha256(inputBytes);
  const reportHash = sha256(reportBytes);
  if (inputHash !== plan.studyB?.simulationInputSha256) errors.push("sample plan simulationInputSha256 does not match frozen power input");
  if (reportHash !== plan.studyB?.simulationReportSha256) errors.push("sample plan simulationReportSha256 does not match frozen power report");
  if (sha256(modelConfigBytes) !== plan.studyB?.modelConfigSha256) errors.push("sample plan modelConfigSha256 does not match frozen Study B model config");
  if (sha256(scriptBytes) !== plan.studyB?.simulationScriptSha256) errors.push("sample plan simulationScriptSha256 does not match the planning script");
  let input;
  let report;
  let modelConfig;
  try {
    input = JSON.parse(inputBytes.toString("utf8"));
    report = JSON.parse(reportBytes.toString("utf8"));
    modelConfig = JSON.parse(modelConfigBytes.toString("utf8"));
  } catch (error) {
    errors.push(`power input/report JSON is invalid: ${error.message}`);
    return;
  }
  if (input.inputStatus !== "PILOT_NUISANCE_ESTIMATES_FROZEN") errors.push("power input is not marked PILOT_NUISANCE_ESTIMATES_FROZEN");
  if (report.status !== "PILOT_INFORMED_SAMPLE_PLANNING") errors.push("power report is not pilot-informed sample planning");
  if (report.inputSha256 !== inputHash) errors.push("power report inputSha256 does not match frozen power input");
  if (modelConfig.schemaVersion !== "kfc-study-b-model-config/0.1") errors.push("Study B model config schemaVersion is invalid");
  if (modelConfig.status !== "FROZEN_AFTER_PILOT_BEFORE_MAIN_COLLECTION") errors.push("Study B model config is not frozen for main collection");
  if (modelConfig.family !== "negative_binomial" || Number(modelConfig.dispersionAlpha) <= 0) errors.push("Study B model config requires a positive-dispersion negative_binomial family");
  if (modelConfig.orderEncoding !== "categorical") errors.push("Study B model config orderEncoding must be categorical");
  if (modelConfig.primaryContrast !== "average_protocol_across_equally_weighted_workflows") errors.push("Study B model config primaryContrast is invalid");
  if (Number(modelConfig.dispersionAlpha) !== Number(input.pilotNuisanceParameters?.dispersionAlpha)) errors.push("Study B model dispersionAlpha does not match the frozen power input nuisance parameter");
  if (modelConfig.powerInputSha256 !== inputHash) errors.push("Study B model config powerInputSha256 does not match the frozen power input");
  const pilotSummaryBytes = await readBytes(projectRoot, "data/frozen/pilot-summary.json", errors);
  if (pilotSummaryBytes && modelConfig.pilotSummarySha256 !== sha256(pilotSummaryBytes)) errors.push("Study B model config pilotSummarySha256 does not match the frozen pilot summary");
  if (!modelConfig.frozenAt || Number.isNaN(Date.parse(modelConfig.frozenAt))) errors.push("Study B model config frozenAt is invalid");
  if (plan.claimMode === "confirmatory_protocol_effect") {
    if (!Number.isSafeInteger(report.recommendedAnalyzableN)) errors.push("power report has no confirmatory recommendedAnalyzableN");
    if (Number(plan.studyB?.analysableTarget) < Number(report.recommendedAnalyzableN)) errors.push("sample plan target is below the power-report recommendation");
    if (Number(plan.studyB?.recruitMaximum) < Number(report.recommendedRecruitMaximum)) errors.push("sample plan recruitMaximum is below the power-report recommendation");
  }
}

async function validateFreeze(freeze, config, stage, projectRoot, errors) {
  const expectedFreezeStage = stage;
  if (freeze.schemaVersion !== "kfc-package-freeze/0.2") errors.push("package freeze schemaVersion is invalid");
  if (freeze.stage !== expectedFreezeStage) errors.push(`package freeze stage must be ${expectedFreezeStage}`);
  if (freeze.dataMode !== "human_research") errors.push("package freeze dataMode must be human_research");
  if (freeze.collectionPhase !== config.collection_phase) errors.push("package freeze collectionPhase does not match config");
  if (freeze.ethicsStatus !== config.ethics_status) errors.push("package freeze ethicsStatus does not match config");
  if (!Array.isArray(freeze.files) || !freeze.files.length) {
    errors.push("package freeze file list is empty");
    return;
  }
  const frozenPaths = new Set(freeze.files.map((record) => record.path));
  const expectedPaths = [
    "config/study-config.json",
    "web/index.html",
    "web/app.mjs",
    "web/ui.mjs",
    "web/styles.css",
    "src/experiment-core.mjs",
    "src/stimuli.mjs",
    ...governanceFiles,
    ...stageFiles[stage].filter((relativePath) => !relativePath.endsWith("package-freeze.json"))
  ];
  for (const expectedPath of expectedPaths) if (!frozenPaths.has(expectedPath)) errors.push(`package freeze omits required stage file: ${expectedPath}`);
  for (const record of freeze.files) {
    const text = await readBytes(projectRoot, record.path, errors);
    if (text && sha256(text) !== record.sha256) errors.push(`package freeze hash mismatch: ${record.path}`);
  }
  const material = structuredClone(freeze);
  delete material.bundleSha256;
  if (freeze.bundleSha256 !== sha256(Buffer.from(JSON.stringify(material)))) errors.push("package freeze bundleSha256 is invalid");
}

function validateManifest(manifest, errors) {
  if (!manifest.manifestId || !Array.isArray(manifest.artefacts) || !manifest.artefacts.length) errors.push("Study B manifest is empty or invalid");
  if (!manifest.sha256) errors.push("Study B manifest sha256 is missing");
  if (manifest.sha256) {
    const material = structuredClone(manifest);
    delete material.sha256;
    if (manifest.sha256 !== sha256(Buffer.from(JSON.stringify(material)))) errors.push("Study B manifest sha256 does not match its content");
  }
  const cells = new Set((manifest.artefacts || []).filter((item) => item.technicalStatus === "PASS").map((item) => `${item.briefId}/${item.sourceWorkflow}`));
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const workflow of ["flat", "layered"]) if (!cells.has(`${briefId}/${workflow}`)) errors.push(`Study B manifest lacks PASS cell ${briefId}/${workflow}`);
  }
}

async function validateStageIdSheets(projectRoot, stage, samplePlan, errors) {
  const specifications = stage === "cognitive-pilot" ? [
    ["data/frozen/pilot-study-a-ids.csv", "PILOT-A-", 4, 6, null],
    ["data/frozen/pilot-study-b-ids.csv", "PILOT-B-", 8, 12, 4],
    ["data/frozen/pilot-expert-ids.csv", "PILOT-E-", 2, 2, null]
  ] : stage === "study-a" ? [
    ["data/frozen/study-a-ids.csv", "A-", 18, 24, 6]
  ] : stage === "study-b" ? [
    ["data/frozen/study-b-ids.csv", "B-", Number(samplePlan?.studyB?.recruitMaximum), Number(samplePlan?.studyB?.recruitMaximum), 4]
  ] : [
    ["data/frozen/expert-ids.csv", "E-", Number(samplePlan?.expert?.plannedAnalysable) + Number(samplePlan?.expert?.reserve), Infinity, null]
  ];

  for (const [relativePath, prefix, minimum, maximum, blockSize] of specifications) {
    const text = await readText(projectRoot, relativePath, []);
    if (text === null) continue;
    const lines = text.trim().split(/\r?\n/);
    if (lines[0] !== "participant_id,allocation_block_id,internal_assignment,status") {
      errors.push(`${relativePath} has an invalid header`);
      continue;
    }
    const rows = lines.slice(1).map((line) => line.split(","));
    const ids = rows.map((row) => row[0]);
    if (rows.some((row) => row.length !== 4 || row[3] !== "UNUSED")) errors.push(`${relativePath} must contain four columns and UNUSED status before launch`);
    if (new Set(ids).size !== ids.length) errors.push(`${relativePath} contains duplicate IDs`);
    if (ids.some((id) => !id.startsWith(prefix))) errors.push(`${relativePath} contains an ID outside prefix ${prefix}`);
    const ordinals = ids.map((id) => Number(id.match(/(\d+)$/)?.[1]));
    if (ordinals.some((value, index) => value !== index + 1)) errors.push(`${relativePath} IDs must be consecutive from 1`);
    if (!Number.isFinite(minimum) || rows.length < minimum || rows.length > maximum) errors.push(`${relativePath} has ${rows.length} IDs; expected ${minimum}${minimum === maximum ? "" : `–${maximum}`}`);
    if (blockSize && rows.length % blockSize) errors.push(`${relativePath} does not end on a complete ${blockSize}-ID block`);
  }
}

async function readJson(projectRoot, relativePath, errors, { duplicateMissing = true } = {}) {
  const text = await readText(projectRoot, relativePath, duplicateMissing ? errors : []);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

async function readText(projectRoot, relativePath, errors) {
  try {
    return await fs.readFile(safePath(projectRoot, relativePath), "utf8");
  } catch (error) {
    errors.push(`missing or unreadable file: ${relativePath}`);
    return null;
  }
}

async function readBytes(projectRoot, relativePath, errors) {
  try {
    return await fs.readFile(safePath(projectRoot, relativePath));
  } catch {
    errors.push(`missing frozen file: ${relativePath}`);
    return null;
  }
}

function safePath(projectRoot, relativePath) {
  const resolved = path.resolve(projectRoot, relativePath);
  if (!resolved.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) throw new Error(`Refusing path outside project: ${relativePath}`);
  return resolved;
}

function containsPlaceholder(text) {
  return /TO_BE_COMPLETED|\{\{[^}]+\}\}|YYYY-MM-DD/.test(text);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function result(stage, errors, warnings) {
  return {
    schemaVersion: "kfc-launch-readiness/0.1",
    checkedAt: new Date().toISOString(),
    stage,
    ready: errors.length === 0,
    status: errors.length ? "BLOCKED" : "MECHANICALLY_READY_RESEARCHER_CONFIRMATION_REQUIRED",
    errors: [...new Set(errors)],
    warnings
  };
}

export async function createLaunchRecord(projectRoot, stage) {
  const configBytes = await fs.readFile(path.join(projectRoot, "config", "study-config.json"));
  const config = JSON.parse(configBytes.toString("utf8"));
  const freezeRelative = stage === "cognitive-pilot"
    ? "data/frozen/pilot-package-freeze.json"
    : `data/frozen/${stage}-package-freeze.json`;
  const freeze = JSON.parse(await fs.readFile(path.join(projectRoot, ...freezeRelative.split("/")), "utf8"));
  const runtimeFiles = freeze.files.filter((record) => (
    record.path.startsWith("web/")
    || record.path.startsWith("src/")
    || record.path === "config/study-config.json"
    || record.path === "data/frozen/pilot-study-b-manifest.json"
    || record.path === "data/frozen/study-b-manifest.json"
  ));
  const requiredRuntimePaths = ["web/index.html", "web/app.mjs", "web/ui.mjs", "web/styles.css", "src/experiment-core.mjs", "src/stimuli.mjs", "config/study-config.json"];
  for (const requiredPath of requiredRuntimePaths) {
    if (!runtimeFiles.some((record) => record.path === requiredPath)) throw new Error(`freeze lacks runtime file ${requiredPath}`);
  }
  return {
    schemaVersion: "kfc-launch-record/0.1",
    generatedAt: new Date().toISOString(),
    status: "MECHANICALLY_READY_RESEARCHER_CONFIRMATION_REQUIRED",
    stage,
    collectionPhase: config.collection_phase,
    allowedModes: stage === "cognitive-pilot" ? ["study-a", "study-b", "expert"] : [stage],
    configSha256: sha256(configBytes),
    packageFreezePath: `../${freezeRelative}`,
    packageFreezeBundleSha256: freeze.bundleSha256,
    runtimeFiles,
    note: "This fail-closed software record does not establish ethics approval. An authorised researcher must confirm the authoritative decision before starting the server."
  };
}

function parseCliArguments(args) {
  const stage = args[0];
  let writeRecord = null;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] !== "--write-record" || !args[index + 1]) throw new Error(`Invalid readiness argument: ${args[index] || "<missing>"}`);
    writeRecord = args[index + 1];
    index += 1;
  }
  return { stage, writeRecord };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { stage, writeRecord } = parseCliArguments(process.argv.slice(2));
  const report = await assessHumanLaunchReadiness({ stage });
  if (report.ready && writeRecord) {
    const expected = expectedLaunchRecords[stage].replace(/^\.\.\//, "");
    if (writeRecord.replaceAll("\\", "/") !== expected) throw new Error(`--write-record must be ${expected}`);
    const launchRecord = await createLaunchRecord(defaultRoot, stage);
    const outputPath = safePath(defaultRoot, writeRecord);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(launchRecord, null, 2)}\n`, "utf8");
    report.launchRecord = writeRecord;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 2;
}
