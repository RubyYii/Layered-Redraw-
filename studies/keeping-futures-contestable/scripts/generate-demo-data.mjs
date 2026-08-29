import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PACKAGE_SCHEMA_VERSION,
  assignExpert,
  assignStudyA,
  assignStudyB,
  fnv1a32,
  offTargetChangeCount
} from "../src/experiment-core.mjs";
import { BRIEF_BY_ID, baseStateFor, diffStates, makeCandidate } from "../src/stimuli.mjs";
import { buildStudyBManifest, csvStringify, prepareCodingUnits, sha256Hex, writeJson } from "../src/data-pipeline.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = path.resolve(projectRoot, "data", "demo");
const config = JSON.parse(await fs.readFile(path.join(projectRoot, "config", "study-config.json"), "utf8"));
const expectedSuffix = path.join("data", "demo");
if (!demoRoot.endsWith(expectedSuffix)) throw new Error("Refusing to reset an unexpected demo path");

await fs.rm(demoRoot, { recursive: true, force: true });
await fs.mkdir(path.join(demoRoot, "returns", "study-a"), { recursive: true });
await fs.mkdir(path.join(demoRoot, "returns", "study-b"), { recursive: true });
await fs.mkdir(path.join(demoRoot, "returns", "expert"), { recursive: true });

const generatedAt = "2026-08-27T12:00:00.000Z";
const packageVersion = config.package_version;
const studyARecords = [];

for (let participantIndex = 1; participantIndex <= 12; participantIndex += 1) {
  const participantId = `DEMO-A${String(participantIndex).padStart(2, "0")}`;
  const assignment = assignStudyA(participantId);
  const record = baseRecord("study-a", participantId);
  record.assignment = assignment;
  record.retrospective = {
    workspaceDifference: "合成回答：两个工作区使修改范围以不同方式显现。",
    tradeoff: "合成回答：局部控制减少漂移，但可能限制意外组合。",
    preference: participantIndex % 3 === 0 ? "NO_PREFERENCE" : participantIndex % 2 === 0 ? "BETA" : "ALPHA",
    demandGuess: "合成回答：研究可能比较修改结构与评价方式。"
  };
  record.trials = assignment.tasks.map((task, taskIndex) => {
    const brief = BRIEF_BY_ID.get(task.briefId);
    const baseState = baseStateFor(task.briefId);
    const target = brief.fields[(participantIndex + taskIndex) % brief.fields.length].id;
    const prompt = `合成指令：修改${brief.fields.find((field) => field.id === target).label}，让受影响者能够质疑决定。`;
    const attempt = fnv1a32(`${participantId}:${taskIndex}`) % 3;
    const finalState = makeCandidate({
      briefId: task.briefId,
      currentState: baseState,
      condition: task.condition,
      targetIds: [target],
      attempt
    });
    const startedAt = new Date(Date.parse(generatedAt) + participantIndex * 60_000 + taskIndex * 600_000).toISOString();
    const completedAt = new Date(Date.parse(startedAt) + 480_000).toISOString();
    return {
      ...task,
      phase: "reflect",
      startedAt,
      completedAt,
      pre: {
        purpose: "合成回答：分配公共资源或协调照护关系。",
        assumptions: "合成回答：系统预设某类数据和决策者具有更高权威。",
        lockedAt: new Date(Date.parse(startedAt) + 90_000).toISOString()
      },
      prompt,
      activeTargetIds: [target],
      candidates: [{
        candidateId: `${task.briefId}-${task.condition}-1`,
        generatedAt: new Date(Date.parse(startedAt) + 180_000).toISOString(),
        targetIds: [target],
        prompt,
        state: finalState,
        diff: diffStates(baseState, finalState),
        offTargetChangeCount: offTargetChangeCount(baseState, finalState, [target]),
        decision: "APPLIED",
        decidedAt: new Date(Date.parse(startedAt) + 220_000).toISOString()
      }],
      pendingCandidate: null,
      baseState,
      currentState: finalState,
      finalState,
      history: [baseState, finalState],
      post: {
        changedAssumption: "合成回答：改变了谁能参与决定以及什么证据可以进入复核。",
        newAssumptions: "合成回答：注意到责任归属仍由机构预先规定。",
        unresolved: "合成回答：紧急效率与共同决定之间仍有张力。",
        unintended: task.condition === "flat" ? "合成回答：出现了额外布局或字段变化。" : "无",
        perceivedControl: String(1 + (participantIndex % 5))
      },
      offTargetChangeCount: offTargetChangeCount(baseState, finalState, [target]),
      eventLog: [
        { type: "trial_started", at: startedAt, payload: {} },
        { type: "candidate_generated", at: new Date(Date.parse(startedAt) + 180_000).toISOString(), payload: { targetIds: [target] } },
        { type: "candidate_applied", at: new Date(Date.parse(startedAt) + 220_000).toISOString(), payload: {} },
        { type: "trial_completed", at: completedAt, payload: {} }
      ]
    };
  });
  seal(record, participantIndex * 1000);
  studyARecords.push(record);
  await writeJson(path.join(demoRoot, "returns", "study-a", `${participantId}.json`), record);
}

const manifest = buildStudyBManifest(studyARecords.map((record) => ({ filePath: record.participantId, record })), { generatedAt });
await writeJson(path.join(demoRoot, "study-b-manifest.json"), manifest);

const studyBRecords = [];
for (let participantIndex = 1; participantIndex <= 12; participantIndex += 1) {
  const participantId = `DEMO-B${String(participantIndex).padStart(2, "0")}`;
  const assignment = assignStudyB(participantId, manifest.artefacts);
  const record = baseRecord("study-b", participantId);
  record.protocol = assignment.protocol;
  record.assignmentBlockId = assignment.assignmentBlockId;
  record.workflowPattern = assignment.workflowPattern;
  record.manifestId = manifest.manifestId;
  record.manifestSha256 = manifest.sha256;
  record.selectionSeed = assignment.selectionSeed;
  record.trials = assignment.artefacts.map((artefact, trialIndex) => {
    const brief = BRIEF_BY_ID.get(artefact.briefId);
    const startedAt = new Date(Date.parse(generatedAt) + participantIndex * 70_000 + trialIndex * 210_000).toISOString();
    const completedAt = new Date(Date.parse(startedAt) + 180_000).toISOString();
    const protocolLockedAt = new Date(Date.parse(startedAt) + 90_000).toISOString();
    return {
      trialIndex,
      artefactId: artefact.artefactId,
      blindLabel: `ITEM-${String(trialIndex + 1).padStart(2, "0")}`,
      briefId: artefact.briefId,
      state: artefact.state,
      phase: "common",
      startedAt,
      completedAt,
      protocolLockedAt,
      protocolResponse: assignment.protocol === "closed" ? {
        meetsPurpose: "PARTLY",
        clarity: "3",
        defects: "合成回答：部分规则缺少解释或申诉入口。",
        requirements: "合成回答：用途要求受影响者能理解并质疑分配依据。",
        fix: "合成回答：增加清晰的人工复核入口和决定依据。",
        passFail: trialIndex % 2 === 0 ? "PASS" : "FAIL",
        rationale: "合成回答：判断仅用于验证封闭表单流程。"
      } : {
        readings: "合成回答：既可读作公共支持，也可读作对行为的治理。",
        tension: "合成回答：效率与参与权之间的张力应继续可见。",
        stakeholders: "合成回答：受影响者和执行机构拥有不同发声能力。",
        arrangements: "合成回答：可以引入共同复核或多种接入路径。"
      },
      commonProbe: {
        description: "合成回答：一个未来服务正在分配资源或协调照护。",
        assumptions: "合成回答：系统假定某些数据和机构判断比个人经验可靠。",
        alternative: "合成回答：可以由受影响者共同制定规则并保留申诉。",
        evidence: `合成回答：依据界面中的三个规则字段和指标 ${brief.visual.metric}。`,
        comprehensionResponse: String(brief.comprehension.correctIndex),
        comprehensionCorrect: true,
        perceivedClosure: String(1 + ((participantIndex + trialIndex) % 5))
      },
      eventLog: [
        { type: "trial_started", at: startedAt, payload: {} },
        { type: "protocol_response_locked", at: protocolLockedAt, payload: { protocol: assignment.protocol } },
        { type: "trial_completed", at: completedAt, payload: { comprehensionCorrect: true } }
      ]
    };
  });
  seal(record, 20_000 + participantIndex * 1000);
  studyBRecords.push(record);
  await writeJson(path.join(demoRoot, "returns", "study-b", `${participantId}.json`), record);
}

const expertRecords = [];
for (let reviewerIndex = 1; reviewerIndex <= 3; reviewerIndex += 1) {
  const participantId = `DEMO-E${String(reviewerIndex).padStart(2, "0")}`;
  const assignment = assignExpert(participantId, manifest.artefacts, 12);
  const record = baseRecord("expert", participantId);
  record.manifestId = manifest.manifestId;
  record.manifestSha256 = manifest.sha256;
  record.selectionSeed = assignment.selectionSeed;
  record.assignmentPerCell = assignment.perCell;
  record.trials = assignment.artefacts.map((artefact, trialIndex) => {
    const keepDecision = ["KEEP", "REVISE", "REJECT"][(reviewerIndex + trialIndex) % 3];
    const startedAt = new Date(Date.parse(generatedAt) + reviewerIndex * 100_000 + trialIndex * 120_000).toISOString();
    const completedAt = new Date(Date.parse(startedAt) + 90_000).toISOString();
    return {
      trialIndex,
      artefactId: artefact.artefactId,
      blindLabel: `CUR-${String(trialIndex + 1).padStart(2, "0")}`,
      briefId: artefact.briefId,
      state: artefact.state,
      startedAt,
      completedAt,
      keepDecision,
      purposeFit: String(1 + ((reviewerIndex + trialIndex) % 5)),
      interpretiveOpenness: String(1 + ((reviewerIndex * 2 + trialIndex) % 5)),
      rationale: "合成回答：决定依据 artefact 的规则关系是否支持预定讨论目的。",
      requiredRevision: keepDecision === "REVISE" ? "合成回答：澄清谁能够提出异议。" : "无",
      eventLog: [
        { type: "trial_started", at: startedAt, payload: {} },
        { type: "trial_completed", at: completedAt, payload: { keepDecision } }
      ]
    };
  });
  seal(record, 40_000 + reviewerIndex * 1000);
  expertRecords.push(record);
  await writeJson(path.join(demoRoot, "returns", "expert", `${participantId}.json`), record);
}

const allRecords = [...studyARecords, ...studyBRecords, ...expertRecords];
const prepared = prepareCodingUnits(allRecords.map((record) => ({ filePath: record.participantId, record })));
const codingKeyByUnit = new Map(prepared.key.map((row) => [row.unitId, row]));
const completedCoding = prepared.units.map((unit) => {
  const hash = fnv1a32(unit.unit_id);
  const keyRow = codingKeyByUnit.get(unit.unit_id);
  const trueGuess = keyRow.study === "study-a"
    ? (keyRow.condition === "flat" ? "WHOLE_OUTPUT" : "LOCAL_LAYERED")
    : (keyRow.protocol === "closed" ? "CLOSED_ORIENTED" : "OPEN_ORIENTED");
  const conditionGuess = hash % 5 === 0 ? "UNSURE" : trueGuess;
  const guessConfidence = conditionGuess === "UNSURE" ? "0" : String(1 + ((hash >>> 10) % 2));
  if (unit.study === "study-a") {
    return {
      ...unit,
      contestatory_revision_0_2: String(hash % 3),
      rationale_specificity_0_2: String((hash >>> 2) % 3),
      new_assumption_count: String((hash >>> 4) % 4),
      unresolved_issue_present: (hash >>> 6) % 2 ? "1" : "0",
      condition_guess: conditionGuess,
      guess_confidence_0_2: guessConfidence,
      coder_id: "SYNTHETIC-CODER"
    };
  }
  return {
    ...unit,
    grounded_interpretation_count: String(hash % 4),
    assumption_count: String((hash >>> 2) % 4),
    stakeholder_power_0_2: String((hash >>> 4) % 3),
    alternative_future_count: String((hash >>> 6) % 4),
    confusion_0_2: String((hash >>> 8) % 3),
    condition_guess: conditionGuess,
    guess_confidence_0_2: guessConfidence,
    coder_id: "SYNTHETIC-CODER"
  };
});
await fs.writeFile(path.join(demoRoot, "coding-completed.csv"), csvStringify(completedCoding), "utf8");
await writeJson(path.join(demoRoot, "coding-completed.key.json"), {
  schemaVersion: "kfc-coding-key/0.1",
  synthetic: true,
  warning: "SYNTHETIC CONDITION KEY — NEVER GIVE TO HUMAN CODERS",
  packageVersion,
  rows: prepared.key
});
await writeJson(path.join(demoRoot, "DEMO_ONLY.json"), {
  synthetic: true,
  generatedAt,
  generator: "scripts/generate-demo-data.mjs",
  studyAReturns: studyARecords.length,
  studyBReturns: studyBRecords.length,
  expertReturns: expertRecords.length,
  artefacts: manifest.artefacts.length,
  warning: "Pipeline verification only. Not human evidence and not a paper result."
});

console.log(JSON.stringify({
  ok: true,
  synthetic: true,
  studyAReturns: studyARecords.length,
  studyBReturns: studyBRecords.length,
  expertReturns: expertRecords.length,
  artefacts: manifest.artefacts.length,
  codingUnits: prepared.units.length,
  demoRoot
}, null, 2));

function baseRecord(study, participantId) {
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    packageVersion,
    study,
    participantId,
    synthetic: true,
    consentConfirmed: true,
    consentRecordedAt: generatedAt,
    consentBasis: "DEMO_ACKNOWLEDGEMENT",
    ethicsStatusAtStart: "NOT_APPROVED_FOR_RECRUITMENT",
    approvedProtocolId: null,
    collectionPhaseAtStart: "demo",
    launchRecordStage: "demo",
    packageFreezeBundleSha256: null,
    startedAt: generatedAt,
    completedAt: null,
    exportedAt: null,
    currentTrialIndex: 0,
    trials: [],
    eventLog: [{ type: "session_started", at: generatedAt, payload: { synthetic: true } }]
  };
}

function seal(record, offsetMs) {
  record.currentTrialIndex = record.trials.length;
  record.completedAt = new Date(Date.parse(generatedAt) + offsetMs + 1_000_000).toISOString();
  record.exportedAt = new Date(Date.parse(record.completedAt) + 10_000).toISOString();
  record.eventLog.push({ type: "session_completed", at: record.completedAt, payload: {} });
  record.sessionSha256 = sha256Hex(JSON.stringify(record));
}
