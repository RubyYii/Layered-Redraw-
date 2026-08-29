import test from "node:test";
import assert from "node:assert/strict";

import {
  STUDY_A_SEQUENCES,
  STUDY_B_BLOCK,
  assignExpert,
  assignStudyA,
  assignStudyB,
  ethicsGateAllows,
  humanResearchConfigErrors,
  offTargetChangeCount,
  technicalAuditArtefact
} from "../src/experiment-core.mjs";
import { baseStateFor, diffStates, makeCandidate } from "../src/stimuli.mjs";
import { generateParticipantIds } from "../scripts/generate-participant-ids.mjs";

test("Study A sequences balance brief, condition, and position", () => {
  assert.equal(STUDY_A_SEQUENCES.length, 6);
  const counts = new Map();
  for (const sequence of STUDY_A_SEQUENCES) {
    assert.equal(sequence.length, 2);
    sequence.forEach(([briefId, condition], position) => {
      const key = `${briefId}/${condition}/position-${position + 1}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  }
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const condition of ["flat", "layered"]) {
      assert.equal(counts.get(`${briefId}/${condition}/position-1`), 1);
      assert.equal(counts.get(`${briefId}/${condition}/position-2`), 1);
    }
  }
});

test("participant assignment is deterministic and contains both making conditions", () => {
  const first = assignStudyA("DEMO-A17");
  const second = assignStudyA("demo-a17");
  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.tasks.map((task) => task.condition)), new Set(["flat", "layered"]));
});

test("six consecutively numbered Study A IDs fill one balanced block", () => {
  const sequenceIds = Array.from({ length: 6 }, (_, index) => assignStudyA(`A-${index + 1}`).sequenceId);
  assert.deepEqual(sequenceIds, ["A-1", "A-2", "A-3", "A-4", "A-5", "A-6"]);
});

test("ethics gate allows only demo IDs while demo lock is active", () => {
  const demoConfig = { data_mode: "demo_only", ethics_status: "NOT_APPROVED_FOR_RECRUITMENT", recruitment_open: false };
  assert.equal(ethicsGateAllows(demoConfig, "DEMO-A01"), true);
  assert.equal(ethicsGateAllows(demoConfig, "P001"), false);
  const humanConfig = {
    data_mode: "human_research",
    collection_phase: "main",
    ethics_status: "APPROVED",
    review_route: "approval",
    recruitment_open: true,
    approved_protocol_id: "REC-2026-001",
    approval_date: "2026-08-27",
    protocol_version: "0.1",
    participant_documents_version: "1.0",
    launch_record: "../data/frozen/study-a-launch-record.json",
    researcher_contact: "researcher@example.edu",
    institution: "Example University",
    jurisdiction: "United Kingdom",
    participant_population: "Adult design practitioners and intended audiences",
    compensation: "Institutionally approved rate",
    recruitment_channel: "Approved participant pool",
    complaints_route: "Independent ethics office",
    withdrawal_process: "Contact the research team using the study ID",
    withdrawal_deadline: "Before anonymised aggregation",
    retention_period: "Five years",
    data_controller: "Example University",
    storage_location: "Institution-managed encrypted storage",
    personal_data_procedure: "Quarantine and remove accidental identifiers under the approved protocol",
    accessibility_procedure: "Provide approved accessible materials and record accommodations separately",
    distress_procedure: "Stop immediately and provide the approved support route",
    artefact_reuse_policy: "Only separately consented de-identified artefacts may be reproduced"
  };
  assert.equal(ethicsGateAllows(humanConfig, "P001"), true);
  assert.deepEqual(humanResearchConfigErrors(humanConfig), []);
  assert.equal(ethicsGateAllows({ ...humanConfig, approved_protocol_id: null }, "P001"), false);
  assert.equal(ethicsGateAllows(humanConfig, "PARTICIPANT-WITHOUT-NUMBER"), false);
  assert.equal(ethicsGateAllows({ ...humanConfig, collection_phase: "cognitive_pilot" }, "P001"), false);
  assert.equal(ethicsGateAllows({ ...humanConfig, collection_phase: "cognitive_pilot" }, "PILOT-A-001"), true);
  assert.equal(ethicsGateAllows(humanConfig, "PILOT-A-001"), false);
  assert.equal(ethicsGateAllows(humanConfig, "DEMO-A001"), false);
});

test("layered candidates preserve every unselected semantic and visual field", () => {
  const base = baseStateFor("cooling-credit-2035");
  const candidate = makeCandidate({
    briefId: base.briefId,
    currentState: base,
    condition: "layered",
    targetIds: ["access"],
    attempt: 0
  });
  assert.deepEqual(diffStates(base, candidate), { semantic: ["access"], visual: [] });
  assert.equal(offTargetChangeCount(base, candidate, ["access"]), 0);
});

test("flat candidates create mild but measurable collateral change across attempts", () => {
  const base = baseStateFor("cooling-credit-2035");
  const diffs = [0, 1, 2].map((attempt) => {
    const candidate = makeCandidate({
      briefId: base.briefId,
      currentState: base,
      condition: "flat",
      targetIds: ["access"],
      attempt
    });
    assert.equal(offTargetChangeCount(base, candidate, ["access"]), 1);
    return diffStates(base, candidate);
  });
  assert.ok(diffs.every((diff) => diff.semantic.includes("access")));
  assert.ok(diffs.some((diff) => diff.semantic.some((field) => field !== "access")));
  assert.ok(diffs.some((diff) => diff.visual.length >= 1));
});

test("flat and layered candidates share the same intended semantic alternative at every attempt", () => {
  const base = baseStateFor("carelink-home-2032");
  for (const attempt of [0, 1, 2]) {
    const layered = makeCandidate({ briefId: base.briefId, currentState: base, condition: "layered", targetIds: ["consent"], attempt });
    const flat = makeCandidate({ briefId: base.briefId, currentState: base, condition: "flat", targetIds: ["consent"], attempt });
    assert.equal(flat.values.consent, layered.values.consent);
    assert.ok(offTargetChangeCount(base, flat, ["consent"]) >= 1);
    assert.equal(offTargetChangeCount(base, layered, ["consent"]), 0);
  }
});

test("Study B excludes technically failed artefacts before cell sampling", () => {
  const artefacts = [];
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      artefacts.push({ artefactId: `${briefId}-${sourceWorkflow}-pass`, briefId, sourceWorkflow, technicalStatus: "PASS" });
      artefacts.push({ artefactId: `${briefId}-${sourceWorkflow}-fail`, briefId, sourceWorkflow, technicalStatus: "FAIL" });
    }
  }
  const assignment = assignStudyB("DEMO-B02", artefacts);
  assert.ok(assignment.artefacts.every((artefact) => artefact.technicalStatus === "PASS"));
});

test("Study B refuses to open when any technically eligible cell is empty", () => {
  const artefacts = [];
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      artefacts.push({
        artefactId: `${briefId}-${sourceWorkflow}`,
        briefId,
        sourceWorkflow,
        technicalStatus: briefId === "common-ground-2040" && sourceWorkflow === "layered" ? "FAIL" : "PASS"
      });
    }
  }
  assert.throws(() => assignStudyB("DEMO-B01", artefacts), /missing Study B cell common-ground-2040\/layered/);
});

test("Study B uses a balanced incomplete block with one artefact per brief", () => {
  const artefacts = [];
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      artefacts.push({ artefactId: `${briefId}-${sourceWorkflow}`, briefId, sourceWorkflow });
    }
  }
  const assignment = assignStudyB("DEMO-B01", artefacts);
  assert.equal(assignment.artefacts.length, 3);
  assert.equal(new Set(assignment.artefacts.map((item) => item.briefId)).size, 3);
  assert.deepEqual(assignment, assignStudyB("DEMO-B01", artefacts));
});

test("four consecutively numbered Study B IDs balance protocol and workflow within every brief", () => {
  assert.equal(STUDY_B_BLOCK.length, 4);
  const artefacts = [];
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      artefacts.push({ artefactId: `${briefId}-${sourceWorkflow}`, briefId, sourceWorkflow });
    }
  }
  const assignments = Array.from({ length: 4 }, (_, index) => assignStudyB(`B-${index + 1}`, artefacts));
  assert.equal(assignments.filter((assignment) => assignment.protocol === "closed").length, 2);
  assert.equal(assignments.filter((assignment) => assignment.protocol === "open").length, 2);
  for (const protocol of ["closed", "open"]) {
    const subset = assignments.filter((assignment) => assignment.protocol === protocol);
    for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
      const workflows = subset.flatMap((assignment) => assignment.artefacts)
        .filter((artefact) => artefact.briefId === briefId)
        .map((artefact) => artefact.sourceWorkflow)
        .sort();
      assert.deepEqual(workflows, ["flat", "layered"]);
    }
  }
});

test("Study B cycles every artefact through both protocols without protocol-item confounding", () => {
  const artefacts = [];
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      for (let item = 1; item <= 6; item += 1) {
        artefacts.push({ artefactId: `${briefId}-${sourceWorkflow}-${item}`, briefId, sourceWorkflow });
      }
    }
  }
  const counts = new Map();
  for (let ordinal = 1; ordinal <= 24; ordinal += 1) {
    const assignment = assignStudyB(`B-${ordinal}`, artefacts);
    for (const artefact of assignment.artefacts) {
      const key = `${artefact.artefactId}/${assignment.protocol}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  for (const artefact of artefacts) {
    assert.equal(counts.get(`${artefact.artefactId}/closed`), 1);
    assert.equal(counts.get(`${artefact.artefactId}/open`), 1);
  }
});

test("six expert IDs provide two blinded reviews per artefact in a 36-item manifest", () => {
  const artefacts = [];
  for (const briefId of ["cooling-credit-2035", "carelink-home-2032", "common-ground-2040"]) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      for (let item = 1; item <= 6; item += 1) {
        artefacts.push({
          artefactId: `${briefId}-${sourceWorkflow}-${item}`,
          briefId,
          sourceWorkflow,
          technicalStatus: "PASS"
        });
      }
    }
  }
  const counts = new Map();
  for (let ordinal = 1; ordinal <= 6; ordinal += 1) {
    const assignment = assignExpert(`E-${ordinal}`, artefacts);
    assert.equal(assignment.artefacts.length, 12);
    for (const artefact of assignment.artefacts) counts.set(artefact.artefactId, (counts.get(artefact.artefactId) || 0) + 1);
  }
  assert.ok(artefacts.every((artefact) => counts.get(artefact.artefactId) === 2));
});

test("coordinator ID generation refuses incomplete allocation blocks", () => {
  assert.equal(generateParticipantIds("study-a", 1, 18).length, 18);
  assert.equal(generateParticipantIds("study-b", 1, 144).length, 144);
  assert.throws(() => generateParticipantIds("study-a", 1, 13), /blocks of six/);
  assert.throws(() => generateParticipantIds("study-b", 1, 6), /blocks of four/);
  assert.throws(() => generateParticipantIds("study-a", 2, 12), /start must align/);
  assert.throws(() => generateParticipantIds("study-b", 2, 144), /start must align/);
  assert.equal(generateParticipantIds("pilot-study-a", 1, 4)[0].participant_id, "PILOT-A-001");
  assert.equal(generateParticipantIds("pilot-study-b", 1, 8).length, 8);
  assert.equal(generateParticipantIds("pilot-expert", 1, 2)[1].participant_id, "PILOT-E-002");
  assert.throws(() => generateParticipantIds("pilot-study-b", 1, 10), /8 or 12/);
  assert.throws(() => generateParticipantIds("pilot-expert", 2, 2), /start at 1/);
});

test("technical audit does not convert a valid structure into artistic acceptance", () => {
  const state = baseStateFor("carelink-home-2032");
  const audit = technicalAuditArtefact({
    artefactId: "ART-TEST",
    sourceParticipantId: "DEMO-A01",
    sourceWorkflow: "layered",
    state,
    eventLog: [{ type: "trial_completed" }]
  });
  assert.deepEqual(audit, { status: "PASS", errors: [] });
  assert.equal("keepDecision" in audit, false);
});
