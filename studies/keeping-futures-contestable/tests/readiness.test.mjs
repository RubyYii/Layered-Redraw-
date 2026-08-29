import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assessHumanLaunchReadiness, createLaunchRecord } from "../scripts/check-human-launch-readiness.mjs";
import { generateParticipantIds } from "../scripts/generate-participant-ids.mjs";
import { csvStringify } from "../src/data-pipeline.mjs";

test("human launch readiness fails closed on a demo-only configuration", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-readiness-"));
  await fs.mkdir(path.join(projectRoot, "config"), { recursive: true });
  await fs.writeFile(path.join(projectRoot, "config", "study-config.json"), JSON.stringify({
    data_mode: "demo_only",
    collection_phase: "demo",
    ethics_status: "NOT_APPROVED_FOR_RECRUITMENT",
    recruitment_open: false,
    allow_external_requests: false
  }), "utf8");

  const report = await assessHumanLaunchReadiness({ projectRoot, stage: "cognitive-pilot" });
  assert.equal(report.ready, false);
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.errors.includes("data_mode must be human_research"));
  assert.ok(report.errors.some((error) => error.includes("participant-information-sheet.md")));
});

test("a complete synthetic governance fixture produces a stage-bound launch record", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-ready-fixture-"));
  const write = async (relativePath, value) => {
    const target = path.join(projectRoot, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, value);
  };
  const config = {
    schema_version: "kfc-study-config/0.1",
    package_version: "kfc-fixture",
    data_mode: "human_research",
    collection_phase: "cognitive_pilot",
    ethics_status: "APPROVED",
    review_route: "approval",
    approved_protocol_id: "PIPELINE-FIXTURE-NOT-AN-APPROVAL",
    approval_date: "2026-08-28",
    protocol_version: "0.1",
    participant_documents_version: "1.0",
    recruitment_open: true,
    launch_record: "../data/frozen/pilot-launch-record.json",
    researcher_contact: "fixture@example.invalid",
    institution: "Pipeline Fixture Institution",
    jurisdiction: "Test jurisdiction",
    participant_population: "Synthetic fixture population",
    compensation: "Synthetic fixture compensation",
    recruitment_channel: "Synthetic fixture channel",
    complaints_route: "Synthetic fixture complaints route",
    withdrawal_process: "Synthetic fixture withdrawal process",
    withdrawal_deadline: "Before synthetic aggregation",
    retention_period: "Synthetic fixture retention",
    data_controller: "Synthetic fixture controller",
    storage_location: "Synthetic fixture storage",
    personal_data_procedure: "Synthetic fixture quarantine procedure",
    accessibility_procedure: "Synthetic fixture accessibility procedure",
    distress_procedure: "Synthetic fixture stop procedure",
    artefact_reuse_policy: "Synthetic fixture reuse policy",
    study_b_manifest: "../data/frozen/pilot-study-b-manifest.json",
    expert_manifest: "../data/frozen/pilot-study-b-manifest.json",
    allow_external_requests: false
  };
  await write("config/study-config.json", `${JSON.stringify(config, null, 2)}\n`);

  const approval = {
    schemaVersion: "kfc-approval-record/0.1",
    reviewRoute: config.review_route,
    ethicsStatus: config.ethics_status,
    approvedProtocolId: config.approved_protocol_id,
    approvalDate: config.approval_date,
    protocolVersion: config.protocol_version,
    participantDocumentsVersion: config.participant_documents_version,
    institution: config.institution,
    scopeIncludesCognitivePilot: true,
    scopeIncludesMainStudy: false,
    recordedAt: "2026-08-28T00:00:00.000Z"
  };
  await write("data/frozen/governance/approval-record.json", `${JSON.stringify(approval, null, 2)}\n`);
  for (const filename of ["participant-information-sheet.md", "consent-form.md", "debrief.md", "recruitment-notice.md", "data-management-plan.md"]) {
    await write(`data/frozen/governance/${filename}`, `PIPELINE FIXTURE ONLY — NOT A REAL APPROVED DOCUMENT — ${filename}\n`);
  }

  const artefacts = [];
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const sourceWorkflow of ["flat", "layered"]) artefacts.push({ artefactId: `${briefId}-${sourceWorkflow}`, briefId, sourceWorkflow, technicalStatus: "PASS" });
  }
  const manifest = { schemaVersion: "kfc-study-b-manifest/0.1", manifestId: "PIPELINE-FIXTURE", synthetic: true, artefacts };
  manifest.sha256 = digest(Buffer.from(JSON.stringify(manifest)));
  await write("data/frozen/pilot-study-b-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  await write("data/frozen/pilot-study-a-ids.csv", csvStringify(generateParticipantIds("pilot-study-a", 1, 4)));
  await write("data/frozen/pilot-study-b-ids.csv", csvStringify(generateParticipantIds("pilot-study-b", 1, 8)));
  await write("data/frozen/pilot-expert-ids.csv", csvStringify(generateParticipantIds("pilot-expert", 1, 2)));

  for (const runtimePath of ["web/index.html", "web/app.mjs", "web/ui.mjs", "web/styles.css", "src/experiment-core.mjs", "src/stimuli.mjs"]) {
    await write(runtimePath, `PIPELINE FIXTURE ${runtimePath}\n`);
  }

  const frozenPaths = [
    "config/study-config.json",
    "web/index.html",
    "web/app.mjs",
    "web/ui.mjs",
    "web/styles.css",
    "src/experiment-core.mjs",
    "src/stimuli.mjs",
    "data/frozen/governance/approval-record.json",
    "data/frozen/governance/participant-information-sheet.md",
    "data/frozen/governance/consent-form.md",
    "data/frozen/governance/debrief.md",
    "data/frozen/governance/recruitment-notice.md",
    "data/frozen/governance/data-management-plan.md",
    "data/frozen/pilot-study-b-manifest.json",
    "data/frozen/pilot-study-a-ids.csv",
    "data/frozen/pilot-study-b-ids.csv",
    "data/frozen/pilot-expert-ids.csv"
  ];
  const fileRecords = [];
  for (const relativePath of frozenPaths) {
    const bytes = await fs.readFile(path.join(projectRoot, ...relativePath.split("/")));
    fileRecords.push({ path: relativePath, bytes: bytes.length, sha256: digest(bytes) });
  }
  const freeze = {
    schemaVersion: "kfc-package-freeze/0.2",
    generatedAt: "2026-08-28T00:00:00.000Z",
    stage: "cognitive-pilot",
    packageVersion: config.package_version,
    dataMode: config.data_mode,
    collectionPhase: config.collection_phase,
    ethicsStatus: config.ethics_status,
    manifestPath: "data/frozen/pilot-study-b-manifest.json",
    files: fileRecords
  };
  freeze.bundleSha256 = digest(Buffer.from(JSON.stringify(freeze)));
  await write("data/frozen/pilot-package-freeze.json", `${JSON.stringify(freeze, null, 2)}\n`);

  try {
    const report = await assessHumanLaunchReadiness({ projectRoot, stage: "cognitive-pilot" });
    assert.deepEqual(report.errors, []);
    assert.equal(report.ready, true);
    const launchRecord = await createLaunchRecord(projectRoot, "cognitive-pilot");
    assert.deepEqual(launchRecord.allowedModes, ["study-a", "study-b", "expert"]);
    assert.equal(launchRecord.configSha256, digest(await fs.readFile(path.join(projectRoot, "config", "study-config.json"))));
    assert.ok(launchRecord.runtimeFiles.some((file) => file.path === "data/frozen/pilot-study-b-manifest.json"));
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
