import fs from "node:fs/promises";
import path from "node:path";

import { csvStringify, parseCsv, readReturnDirectory, sha256Hex, validateCorpus, writeJson } from "../src/data-pipeline.mjs";

const args = parseArgs(process.argv.slice(2));
for (const required of ["returns", "coding", "key", "manifest", "out"]) {
  if (!args[required]) throw new Error(`Missing --${required}`);
}

const entries = await readReturnDirectory(path.resolve(args.returns));
const corpus = validateCorpus(entries);
if (!corpus.ok) throw new Error(corpus.issues.map((issue) => `${issue.filePath}: ${issue.messages.join("; ")}`).join("\n"));
const codingRows = parseCsv(await fs.readFile(path.resolve(args.coding), "utf8"));
const codingKey = JSON.parse(await fs.readFile(path.resolve(args.key), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.resolve(args.manifest), "utf8"));
if (codingKey.synthetic !== corpus.synthetic || manifest.synthetic !== corpus.synthetic) {
  throw new Error("Synthetic/human status differs across returns, coding key, or manifest");
}
if (codingKey.packageVersion && codingKey.packageVersion !== corpus.packageVersion) throw new Error("Coding key package version differs from returns");
if (manifest.packageVersion !== corpus.packageVersion) throw new Error("Manifest package version differs from returns");
const manifestChecksumMaterial = structuredClone(manifest);
delete manifestChecksumMaterial.sha256;
if (!manifest.sha256 || manifest.sha256 !== sha256Hex(JSON.stringify(manifestChecksumMaterial))) {
  throw new Error("Manifest SHA-256 does not match manifest content");
}
for (const { record } of entries.filter(({ record }) => ["study-b", "expert"].includes(record.study))) {
  if (record.manifestId !== manifest.manifestId || record.manifestSha256 !== manifest.sha256) {
    throw new Error(`${record.study}:${record.participantId} references a different manifest`);
  }
}

const returnMap = new Map(entries.map(({ record }) => [`${record.study}:${record.participantId}`, record]));
const codingMap = new Map();
for (const row of codingRows) {
  if (codingMap.has(row.unit_id)) throw new Error(`Duplicate adjudicated coding row ${row.unit_id}`);
  codingMap.set(row.unit_id, row);
}
const artefactMap = new Map(manifest.artefacts.map((artefact) => [artefact.artefactId, artefact]));
if (artefactMap.size !== manifest.artefacts.length) throw new Error("Manifest contains duplicate artefact IDs");
const studyAReturnMap = new Map(entries.filter(({ record }) => record.study === "study-a").map(({ record }) => [record.participantId, record]));
for (const artefact of manifest.artefacts) {
  const source = studyAReturnMap.get(artefact.sourceParticipantId);
  if (!source || source.sessionSha256 !== artefact.sourceSessionSha256) {
    throw new Error(`Artefact ${artefact.artefactId} is not traceable to its Study A return checksum`);
  }
}
const studyARows = [];
const studyBRows = [];

for (const keyRow of codingKey.rows) {
  const record = returnMap.get(`${keyRow.study}:${keyRow.participantId}`);
  if (!record) throw new Error(`Coding key references missing return ${keyRow.study}:${keyRow.participantId}`);
  const trial = record.trials[keyRow.trialIndex];
  const code = codingMap.get(keyRow.unitId);
  if (!code) throw new Error(`Missing adjudicated coding row ${keyRow.unitId}`);
  if (keyRow.study === "study-a") {
    requireInteger(code.contestatory_revision_0_2, 0, 2, `${keyRow.unitId}: contestatory_revision_0_2`);
    studyARows.push({
      synthetic: record.synthetic,
      participant_id: record.participantId,
      unit_id: keyRow.unitId,
      brief_id: trial.briefId,
      condition: trial.condition,
      task_order: trial.taskIndex + 1,
      contestatory_revision_0_2: Number(code.contestatory_revision_0_2),
      rationale_specificity_0_2: nullableNumber(code.rationale_specificity_0_2),
      new_assumption_count: nullableNumber(code.new_assumption_count),
      unresolved_issue_present: nullableNumber(code.unresolved_issue_present),
      candidate_off_target_exposure_count: Number(trial.offTargetChangeCount),
      candidate_count: trial.candidates.length,
      undo_count: trial.eventLog.filter((event) => event.type === "revision_undone").length,
      duration_seconds: durationSeconds(trial.startedAt, trial.completedAt),
      perceived_control_1_5: Number(trial.post.perceivedControl)
    });
  } else if (keyRow.study === "study-b") {
    requireInteger(code.grounded_interpretation_count, 0, Infinity, `${keyRow.unitId}: grounded_interpretation_count`);
    const artefact = artefactMap.get(trial.artefactId);
    if (!artefact) throw new Error(`Study B trial references missing artefact ${trial.artefactId}`);
    if (artefact.technicalStatus !== "PASS") throw new Error(`Study B trial presents technical FAIL artefact ${trial.artefactId}`);
    const responseLength = [trial.commonProbe.description, trial.commonProbe.assumptions, trial.commonProbe.alternative, trial.commonProbe.evidence]
      .join("").replace(/\s/g, "").length;
    studyBRows.push({
      synthetic: record.synthetic,
      participant_id: record.participantId,
      unit_id: keyRow.unitId,
      artefact_id: trial.artefactId,
      brief_id: trial.briefId,
      protocol: record.protocol,
      source_workflow: artefact.sourceWorkflow,
      presentation_order: trial.trialIndex + 1,
      grounded_interpretation_count: Number(code.grounded_interpretation_count),
      assumption_count: nullableNumber(code.assumption_count),
      stakeholder_power_0_2: nullableNumber(code.stakeholder_power_0_2),
      alternative_future_count: nullableNumber(code.alternative_future_count),
      confusion_0_2: nullableNumber(code.confusion_0_2),
      comprehension_correct: trial.commonProbe.comprehensionCorrect ? 1 : 0,
      perceived_closure_1_5: Number(trial.commonProbe.perceivedClosure),
      response_length_chars: responseLength,
      protocol_duration_seconds: durationSeconds(trial.startedAt, trial.protocolLockedAt),
      common_probe_duration_seconds: durationSeconds(trial.commonProbeStartedAt || trial.protocolLockedAt, trial.completedAt),
      duration_seconds: durationSeconds(trial.startedAt, trial.completedAt)
    });
  }
}

const expertRows = [];
for (const { record } of entries.filter(({ record }) => record.study === "expert")) {
  for (const trial of record.trials) {
    const artefact = artefactMap.get(trial.artefactId);
    if (!artefact) throw new Error(`Expert trial references missing artefact ${trial.artefactId}`);
    expertRows.push({
      synthetic: record.synthetic,
      reviewer_id: record.participantId,
      artefact_id: trial.artefactId,
      brief_id: trial.briefId,
      technical_status: artefact.technicalStatus,
      source_workflow: artefact.sourceWorkflow,
      keep_decision: trial.keepDecision,
      purpose_fit_1_5: Number(trial.purposeFit),
      interpretive_openness_1_5: Number(trial.interpretiveOpenness),
      rationale: trial.rationale,
      required_revision: trial.requiredRevision,
      duration_seconds: durationSeconds(trial.startedAt, trial.completedAt)
    });
  }
}

const summary = {
  schemaVersion: "kfc-descriptive-analysis/0.1",
  generatedAt: new Date().toISOString(),
  synthetic: corpus.synthetic,
  evidenceStatus: corpus.synthetic ? "SYNTHETIC_PIPELINE_CHECK_NOT_EVIDENCE" : "DESCRIPTIVE_UNFROZEN_NOT_CONFIRMATORY",
  packageVersion: corpus.packageVersion,
  counts: {
    returns: entries.length,
    studyAParticipants: unique(studyARows.map((row) => row.participant_id)).length,
    studyATrials: studyARows.length,
    studyBParticipants: unique(studyBRows.map((row) => row.participant_id)).length,
    studyBTrials: studyBRows.length,
    expertReviewers: unique(expertRows.map((row) => row.reviewer_id)).length,
    expertTrials: expertRows.length
  },
  studyAByCondition: summariseGroups(studyARows, "condition", ["contestatory_revision_0_2", "candidate_off_target_exposure_count", "duration_seconds", "perceived_control_1_5"]),
  studyBByProtocol: summariseGroups(studyBRows, "protocol", ["grounded_interpretation_count", "assumption_count", "alternative_future_count", "comprehension_correct", "response_length_chars", "protocol_duration_seconds", "common_probe_duration_seconds"]),
  technicalByKeep: contingency(expertRows, "technical_status", "keep_decision"),
  studyBArtefactCoverage: coverageSummary(manifest.artefacts.filter((artefact) => artefact.technicalStatus === "PASS"), studyBRows, "artefact_id"),
  expertArtefactCoverage: coverageSummary(manifest.artefacts.filter((artefact) => artefact.technicalStatus === "PASS"), expertRows, "artefact_id")
};

const out = path.resolve(args.out);
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, "study-a-analysis-ready.csv"), csvStringify(studyARows), "utf8");
await fs.writeFile(path.join(out, "study-b-analysis-ready.csv"), csvStringify(studyBRows), "utf8");
await fs.writeFile(path.join(out, "expert-audit-ready.csv"), csvStringify(expertRows), "utf8");
await writeJson(path.join(out, "descriptive-summary.json"), summary);
await fs.writeFile(path.join(out, "REPORT.md"), reportMarkdown(summary), "utf8");

console.log(JSON.stringify({ ok: true, out, evidenceStatus: summary.evidenceStatus, counts: summary.counts }, null, 2));

function parseArgs(tokens) {
  const result = {};
  for (let index = 0; index < tokens.length; index += 1) {
    if (!tokens[index].startsWith("--")) continue;
    result[tokens[index].slice(2)] = tokens[index + 1];
    index += 1;
  }
  return result;
}

function nullableNumber(value) {
  return value === "" || value == null ? "" : Number(value);
}

function requireInteger(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${label} is invalid`);
}

function durationSeconds(start, end) {
  const value = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(value) && value >= 0 ? value : "";
}

function unique(values) { return [...new Set(values)]; }

function summariseGroups(rows, groupKey, measures) {
  const result = {};
  for (const group of unique(rows.map((row) => row[groupKey]))) {
    const subset = rows.filter((row) => row[groupKey] === group);
    result[group] = { n: subset.length };
    for (const measure of measures) {
      const values = subset.map((row) => Number(row[measure])).filter(Number.isFinite);
      result[group][measure] = {
        n: values.length,
        mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null
      };
    }
  }
  return result;
}

function contingency(rows, rowKey, columnKey) {
  const table = {};
  for (const row of rows) {
    table[row[rowKey]] ||= {};
    table[row[rowKey]][row[columnKey]] = (table[row[rowKey]][row[columnKey]] || 0) + 1;
  }
  return table;
}

function coverageSummary(eligibleArtefacts, rows, rowArtefactKey) {
  const counts = new Map(eligibleArtefacts.map((artefact) => [artefact.artefactId, 0]));
  for (const row of rows) {
    if (counts.has(row[rowArtefactKey])) counts.set(row[rowArtefactKey], counts.get(row[rowArtefactKey]) + 1);
  }
  const values = [...counts.values()];
  return {
    eligibleArtefacts: values.length,
    zeroCoverage: values.filter((value) => value === 0).length,
    belowTwo: values.filter((value) => value < 2).length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  };
}

function reportMarkdown(summary) {
  const title = summary.synthetic ? "# SYNTHETIC PIPELINE CHECK — NOT A RESULT" : "# Descriptive quality-control report — not yet confirmatory";
  return `${title}\n\n` +
    `Evidence status: \`${summary.evidenceStatus}\`\n\n` +
    `This report verifies ingestion, blinding joins, coding joins, and separate warrant tables. It does not license a paper claim.\n\n` +
    `## Counts\n\n\`\`\`json\n${JSON.stringify(summary.counts, null, 2)}\n\`\`\`\n\n` +
    `## Study A descriptive groups\n\n\`\`\`json\n${JSON.stringify(summary.studyAByCondition, null, 2)}\n\`\`\`\n\n` +
    `## Study B descriptive groups\n\n\`\`\`json\n${JSON.stringify(summary.studyBByProtocol, null, 2)}\n\`\`\`\n\n` +
    `## Technical × curatorial table\n\n\`\`\`json\n${JSON.stringify(summary.technicalByKeep, null, 2)}\n\`\`\`\n\n` +
    `## Artefact coverage\n\nStudy B:\n\n\`\`\`json\n${JSON.stringify(summary.studyBArtefactCoverage, null, 2)}\n\`\`\`\n\nExpert audit:\n\n\`\`\`json\n${JSON.stringify(summary.expertArtefactCoverage, null, 2)}\n\`\`\`\n\n` +
    `Do not collapse these cells into a composite quality score.\n`;
}
