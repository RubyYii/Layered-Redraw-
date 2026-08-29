import test from "node:test";
import assert from "node:assert/strict";

import { PACKAGE_SCHEMA_VERSION, assignStudyA, offTargetChangeCount } from "../src/experiment-core.mjs";
import { baseStateFor, makeCandidate } from "../src/stimuli.mjs";
import { buildStudyBManifest, parseCsv, prepareCodingUnits, csvStringify, sha256Hex, validateCorpus } from "../src/data-pipeline.mjs";

function makeStudyAReturn(participantId = "DEMO-A99") {
  const assignment = assignStudyA(participantId);
  const trials = assignment.tasks.map((task) => {
    const baseState = baseStateFor(task.briefId);
    const finalState = makeCandidate({ briefId: task.briefId, currentState: baseState, condition: task.condition, targetIds: ["access", "consent", "representation"], attempt: 0 });
    return {
      ...task,
      startedAt: "2026-08-27T10:00:00.000Z",
      completedAt: "2026-08-27T10:08:00.000Z",
      pre: { purpose: "synthetic purpose", assumptions: "synthetic assumptions" },
      prompt: "synthetic revision prompt",
      activeTargetIds: Object.keys(finalState.values).slice(0, 1),
      candidates: [{
        candidateId: "C1",
        targetIds: Object.keys(finalState.values).slice(0, 1),
        offTargetChangeCount: offTargetChangeCount(baseState, finalState, Object.keys(finalState.values).slice(0, 1))
      }],
      baseState,
      finalState,
      post: { changedAssumption: "synthetic change", newAssumptions: "synthetic new", unresolved: "synthetic open", perceivedControl: "3" },
      offTargetChangeCount: offTargetChangeCount(baseState, finalState, Object.keys(finalState.values).slice(0, 1)),
      eventLog: [{ type: "trial_completed" }]
    };
  });
  const record = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    packageVersion: "kfc-0.1.0",
    study: "study-a",
    participantId,
    synthetic: true,
    collectionPhaseAtStart: "demo",
    launchRecordStage: "demo",
    packageFreezeBundleSha256: null,
    startedAt: "2026-08-27T10:00:00.000Z",
    completedAt: "2026-08-27T10:20:00.000Z",
    exportedAt: "2026-08-27T10:21:00.000Z",
    trials,
    eventLog: [{ type: "session_completed" }]
  };
  record.consentConfirmed = true;
  record.consentRecordedAt = "2026-08-27T09:59:00.000Z";
  record.sessionSha256 = sha256Hex(JSON.stringify(record));
  return record;
}

test("manifest includes every complete Study A trial without outcome selection", () => {
  const record = makeStudyAReturn();
  const manifest = buildStudyBManifest([{ filePath: "memory", record }], { generatedAt: "2026-08-27T12:00:00.000Z" });
  assert.equal(manifest.sourceReturnCount, 1);
  assert.equal(manifest.artefacts.length, record.trials.length);
  assert.equal(manifest.selectionPolicy, "all complete Study A trials; no outcome-based selection");
  assert.match(manifest.presentationEligibilityPolicy, /technical PASS/);
  assert.ok(manifest.artefacts.every((artefact) => artefact.technicalStatus === "PASS"));
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
});

test("blinded coding material omits making condition labels", () => {
  const record = makeStudyAReturn();
  const prepared = prepareCodingUnits([{ filePath: "memory", record }]);
  assert.equal(prepared.units.length, 2);
  for (const unit of prepared.units) {
    assert.equal(unit.material_json.includes("layered"), false);
    assert.equal(unit.material_json.includes("flat"), false);
  }
  assert.ok(prepared.key.some((row) => ["flat", "layered"].includes(row.condition)));
});

test("CSV roundtrip preserves JSON material and commas", () => {
  const rows = [{ unit_id: "U1", material_json: '{"text":"a,b"}', notes: "line one\nline two" }];
  assert.deepEqual(parseCsv(csvStringify(rows)), rows);
});

test("corpus validation rejects a return changed after export", () => {
  const record = makeStudyAReturn();
  record.trials[0].prompt = "tampered after checksum";
  const result = validateCorpus([{ filePath: "memory", record }]);
  assert.equal(result.ok, false);
  assert.match(result.issues[0].messages.join(" "), /sessionSha256/);
});
