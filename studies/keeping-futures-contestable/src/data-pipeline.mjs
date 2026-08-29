import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { technicalAuditArtefact, validateReturn } from "./experiment-core.mjs";
import { diffStates } from "./stimuli.mjs";

export async function listJsonFiles(directory) {
  const root = path.resolve(directory);
  const output = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) output.push(fullPath);
    }
  }
  await walk(root);
  return output.sort();
}

export async function readReturnDirectory(directory) {
  const records = [];
  for (const filePath of await listJsonFiles(directory)) {
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (record?.schemaVersion?.startsWith("kfc-return/")) records.push({ filePath, record });
  }
  return records;
}

export function validateCorpus(entries) {
  const issues = [];
  const seen = new Set();
  const syntheticStates = new Set();
  const versions = new Set();
  for (const { filePath, record } of entries) {
    const errors = validateReturn(record);
    if (!record.sessionSha256) {
      errors.push("sessionSha256 is missing");
    } else {
      const checksumMaterial = structuredClone(record);
      delete checksumMaterial.sessionSha256;
      const expectedChecksum = sha256Hex(JSON.stringify(checksumMaterial));
      if (record.sessionSha256 !== expectedChecksum) errors.push("sessionSha256 does not match return content");
    }
    if (errors.length) issues.push({ severity: "ERROR", filePath, messages: errors });
    const key = `${record.study}:${record.participantId}`;
    if (seen.has(key)) issues.push({ severity: "ERROR", filePath, messages: [`duplicate return ${key}`] });
    seen.add(key);
    syntheticStates.add(record.synthetic);
    versions.add(record.packageVersion);
  }
  if (syntheticStates.size > 1) issues.push({ severity: "ERROR", filePath: "CORPUS", messages: ["synthetic and human returns are mixed"] });
  if (versions.size > 1) issues.push({ severity: "ERROR", filePath: "CORPUS", messages: ["multiple package versions are mixed"] });
  if (!entries.length) issues.push({ severity: "ERROR", filePath: "CORPUS", messages: ["no KFC return files found"] });
  return {
    ok: !issues.some((issue) => issue.severity === "ERROR"),
    issues,
    recordCount: entries.length,
    synthetic: syntheticStates.size === 1 ? [...syntheticStates][0] : null,
    packageVersion: versions.size === 1 ? [...versions][0] : null
  };
}

export function buildStudyBManifest(entries, { generatedAt = new Date().toISOString() } = {}) {
  const studyA = entries.filter(({ record }) => record.study === "study-a");
  const corpus = validateCorpus(studyA);
  if (!corpus.ok) throw new Error(formatIssues(corpus.issues));
  const artefacts = [];
  for (const { record } of studyA) {
    for (const trial of record.trials) {
      const identity = `${record.packageVersion}|${record.participantId}|${trial.taskIndex}|${trial.briefId}|${trial.condition}`;
      const artefactId = `ART-${sha256Hex(identity).slice(0, 16).toUpperCase()}`;
      const candidate = {
        artefactId,
        briefId: trial.briefId,
        sourceParticipantId: record.participantId,
        sourceWorkflow: trial.condition,
        sourceTaskIndex: trial.taskIndex,
        sourceSessionSha256: record.sessionSha256 || "UNAVAILABLE",
        state: trial.finalState,
        baseDiff: diffStates(trial.baseState, trial.finalState),
        eventLog: trial.eventLog,
        synthetic: record.synthetic,
        technicalStatus: "PENDING",
        technicalErrors: []
      };
      const audit = technicalAuditArtefact(candidate);
      candidate.technicalStatus = audit.status;
      candidate.technicalErrors = audit.errors;
      artefacts.push(candidate);
    }
  }
  const manifest = {
    schemaVersion: "kfc-study-b-manifest/0.1",
    manifestId: `MANIFEST-${generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    packageVersion: corpus.packageVersion,
    generatedAt,
    synthetic: corpus.synthetic,
    sourceReturnCount: studyA.length,
    sourceTrialCount: artefacts.length,
    selectionPolicy: "all complete Study A trials; no outcome-based selection",
    presentationEligibilityPolicy: "Study B samples only technical PASS artefacts; every brief-by-workflow cell must remain populated",
    artefacts
  };
  manifest.sha256 = sha256Hex(JSON.stringify(manifest));
  return manifest;
}

export function prepareCodingUnits(entries) {
  const corpus = validateCorpus(entries);
  if (!corpus.ok) throw new Error(formatIssues(corpus.issues));
  const units = [];
  const key = [];
  for (const { record } of entries) {
    if (!['study-a', 'study-b'].includes(record.study)) continue;
    for (const [trialIndex, trial] of record.trials.entries()) {
      const rawIdentity = `${record.study}|${record.participantId}|${trialIndex}|${trial.briefId}|${trial.artefactId || "maker"}`;
      const unitId = `UNIT-${sha256Hex(rawIdentity).slice(0, 18).toUpperCase()}`;
      if (record.study === "study-a") {
        units.push({
          unit_id: unitId,
          study: "study-a",
          brief_id: trial.briefId,
          artefact_blind_id: "",
          material_json: JSON.stringify({
            pre_assumptions: trial.pre?.assumptions || "",
            base_values: trial.baseState?.values || {},
            final_values: trial.finalState?.values || {},
            candidate_decisions: (trial.candidates || []).map((candidate) => ({
              target_ids: candidate.targetIds || [],
              decision: candidate.decision || "",
              semantic_diff: candidate.diff?.semantic || [],
              visual_diff: candidate.diff?.visual || []
            })),
            changed_assumption: trial.post?.changedAssumption || "",
            newly_noticed: trial.post?.newAssumptions || "",
            unresolved: trial.post?.unresolved || "",
            rationale_prompt: trial.prompt || ""
          }),
          contestatory_revision_0_2: "",
          rationale_specificity_0_2: "",
          new_assumption_count: "",
          unresolved_issue_present: "",
          grounded_interpretation_count: "",
          assumption_count: "",
          stakeholder_power_0_2: "",
          alternative_future_count: "",
          confusion_0_2: "",
          condition_guess: "",
          guess_confidence_0_2: "",
          coder_id: "",
          codebook_version: "0.1",
          notes: ""
        });
      } else {
        units.push({
          unit_id: unitId,
          study: "study-b",
          brief_id: trial.briefId,
          artefact_blind_id: trial.artefactId,
          material_json: JSON.stringify({
            artefact_state: trial.state || {},
            description: trial.commonProbe?.description || "",
            assumptions: trial.commonProbe?.assumptions || "",
            alternative: trial.commonProbe?.alternative || "",
            evidence: trial.commonProbe?.evidence || "",
            comprehension_correct: trial.commonProbe?.comprehensionCorrect ?? null
          }),
          contestatory_revision_0_2: "",
          rationale_specificity_0_2: "",
          new_assumption_count: "",
          unresolved_issue_present: "",
          grounded_interpretation_count: "",
          assumption_count: "",
          stakeholder_power_0_2: "",
          alternative_future_count: "",
          confusion_0_2: "",
          condition_guess: "",
          guess_confidence_0_2: "",
          coder_id: "",
          codebook_version: "0.1",
          notes: ""
        });
      }
      key.push({
        unitId,
        study: record.study,
        participantId: record.participantId,
        trialIndex,
        briefId: trial.briefId,
        condition: record.study === "study-a" ? trial.condition : null,
        protocol: record.study === "study-b" ? record.protocol : null,
        artefactId: trial.artefactId || null,
        synthetic: record.synthetic
      });
    }
  }
  return { units, key, synthetic: corpus.synthetic, packageVersion: corpus.packageVersion };
}

export function csvStringify(rows, columns = null) {
  if (!rows.length && !columns) return "";
  const headers = columns || Object.keys(rows[0]);
  const quote = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${headers.map(quote).join(",")}\n${rows.map((row) => headers.map((header) => quote(row[header])).join(",")).join("\n")}\n`;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ""; }
    else if (character === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...data] = rows.filter((entry) => entry.some((cell) => cell !== ""));
  if (!headers) return [];
  return data.map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] ?? ""])));
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function formatIssues(issues) {
  return issues.map((issue) => `${issue.filePath}: ${issue.messages.join("; ")}`).join("\n");
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
