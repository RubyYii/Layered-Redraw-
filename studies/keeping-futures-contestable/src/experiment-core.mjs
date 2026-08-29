import { BRIEFS, baseStateFor, diffStates, validateArtifactState } from "./stimuli.mjs";

export const PACKAGE_SCHEMA_VERSION = "kfc-return/0.1";

export const STUDY_A_SEQUENCES = [
  [["cooling-credit-2035", "flat"], ["carelink-home-2032", "layered"]],
  [["cooling-credit-2035", "layered"], ["carelink-home-2032", "flat"]],
  [["carelink-home-2032", "flat"], ["common-ground-2040", "layered"]],
  [["carelink-home-2032", "layered"], ["common-ground-2040", "flat"]],
  [["common-ground-2040", "flat"], ["cooling-credit-2035", "layered"]],
  [["common-ground-2040", "layered"], ["cooling-credit-2035", "flat"]]
];

export const STUDY_B_BLOCK = [
  { protocol: "closed", workflowPattern: ["flat", "layered", "flat"] },
  { protocol: "open", workflowPattern: ["flat", "layered", "flat"] },
  { protocol: "closed", workflowPattern: ["layered", "flat", "layered"] },
  { protocol: "open", workflowPattern: ["layered", "flat", "layered"] }
];

export function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seededShuffle(items, seedText) {
  const result = [...items];
  let state = fnv1a32(seedText) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function normaliseParticipantId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

export function participantOrdinal(value) {
  const match = normaliseParticipantId(value).match(/(\d+)$/);
  if (!match) return null;
  const ordinal = Number(match[1]);
  return Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

export function humanResearchConfigErrors(config) {
  const errors = [];
  const completed = (value) => typeof value === "string" && value.trim() && !value.includes("TO_BE_COMPLETED");
  if (config?.data_mode !== "human_research") errors.push("data_mode must be human_research");
  if (!["APPROVED", "EXEMPTION_CONFIRMED"].includes(config?.ethics_status)) errors.push("ethics_status must be APPROVED or EXEMPTION_CONFIRMED");
  if (!["approval", "exemption"].includes(config?.review_route)) errors.push("review_route must be approval or exemption");
  if (config?.review_route === "approval" && config?.ethics_status !== "APPROVED") errors.push("approval route requires ethics_status APPROVED");
  if (config?.review_route === "exemption" && config?.ethics_status !== "EXEMPTION_CONFIRMED") errors.push("exemption route requires ethics_status EXEMPTION_CONFIRMED");
  if (!["cognitive_pilot", "main"].includes(config?.collection_phase)) errors.push("collection_phase must be cognitive_pilot or main");
  if (config?.recruitment_open !== true) errors.push("recruitment_open must be true");
  if (!completed(config?.approved_protocol_id)) errors.push("approved_protocol_id is incomplete");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(config?.approval_date || ""))) errors.push("approval_date is incomplete");
  for (const field of [
    "protocol_version",
    "participant_documents_version",
    "launch_record",
    "researcher_contact",
    "institution",
    "jurisdiction",
    "participant_population",
    "compensation",
    "recruitment_channel",
    "complaints_route",
    "withdrawal_process",
    "withdrawal_deadline",
    "retention_period",
    "data_controller",
    "storage_location",
    "personal_data_procedure",
    "accessibility_procedure",
    "distress_procedure",
    "artefact_reuse_policy"
  ]) {
    if (!completed(config?.[field])) errors.push(`${field} is incomplete`);
  }
  return errors;
}

export function ethicsGateAllows(config, participantId) {
  const id = normaliseParticipantId(participantId);
  if (config?.data_mode === "demo_only") return id.startsWith("DEMO-");
  if (humanResearchConfigErrors(config).length || id.length < 3 || participantOrdinal(id) === null) return false;
  if (config.collection_phase === "cognitive_pilot") return id.startsWith("PILOT-");
  return !id.startsWith("DEMO-") && !id.startsWith("PILOT-");
}

export function assignStudyA(participantId) {
  const id = normaliseParticipantId(participantId);
  if (!id) throw new Error("participantId is required");
  const ordinal = participantOrdinal(id);
  const sequenceIndex = ordinal === null
    ? fnv1a32(`study-a:${id}`) % STUDY_A_SEQUENCES.length
    : (ordinal - 1) % STUDY_A_SEQUENCES.length;
  return {
    sequenceId: `A-${sequenceIndex + 1}`,
    tasks: STUDY_A_SEQUENCES[sequenceIndex].map(([briefId, condition], index) => ({
      taskIndex: index,
      briefId,
      condition
    }))
  };
}

export function assignStudyB(participantId, artefacts) {
  const id = normaliseParticipantId(participantId);
  if (!id) throw new Error("participantId is required");
  if (!Array.isArray(artefacts) || !artefacts.length) throw new Error("artefact manifest is empty");
  const ordinal = participantOrdinal(id);
  const blockIndex = ordinal === null
    ? fnv1a32(`study-b-block:${id}`) % STUDY_B_BLOCK.length
    : (ordinal - 1) % STUDY_B_BLOCK.length;
  const block = STUDY_B_BLOCK[blockIndex];
  const hasTechnicalStatuses = artefacts.some((artefact) => "technicalStatus" in artefact);
  const eligibleArtefacts = hasTechnicalStatuses
    ? artefacts.filter((artefact) => artefact.technicalStatus === "PASS")
    : artefacts;
  for (const brief of BRIEFS) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      if (!eligibleArtefacts.some((artefact) => artefact.briefId === brief.id && artefact.sourceWorkflow === sourceWorkflow)) {
        throw new Error(`missing Study B cell ${brief.id}/${sourceWorkflow}`);
      }
    }
  }
  const selected = [];
  for (const [briefIndex, brief] of BRIEFS.entries()) {
    const sourceWorkflow = block.workflowPattern[briefIndex];
    const cell = eligibleArtefacts.filter(
      (artefact) => artefact.briefId === brief.id && artefact.sourceWorkflow === sourceWorkflow
    );
    const orderedCell = seededShuffle(cell, `study-b-cell:${brief.id}:${sourceWorkflow}`);
    const cycleIndex = ordinal === null
      ? fnv1a32(`study-b-cell-fallback:${id}:${brief.id}:${sourceWorkflow}`)
      : Math.floor((ordinal - 1) / STUDY_B_BLOCK.length);
    selected.push(orderedCell[cycleIndex % orderedCell.length]);
  }
  return {
    protocol: block.protocol,
    assignmentBlockId: `B-${blockIndex + 1}`,
    workflowPattern: [...block.workflowPattern],
    artefacts: seededShuffle(selected, `study-b-order:${id}`),
    selectionSeed: fnv1a32(`study-b-selection:${id}`)
  };
}

export function assignExpert(participantId, artefacts, maxItems = 12) {
  const id = normaliseParticipantId(participantId);
  if (!id) throw new Error("reviewerId is required");
  const eligible = artefacts.filter((artefact) => artefact.technicalStatus === "PASS");
  const cellCount = BRIEFS.length * 2;
  const perCell = Math.floor(maxItems / cellCount);
  if (perCell < 1) throw new Error(`expert maxItems must be at least ${cellCount}`);
  const ordinal = participantOrdinal(id);
  const reviewerIndex = ordinal === null ? fnv1a32(`expert-fallback:${id}`) : ordinal - 1;
  const selected = [];
  for (const brief of BRIEFS) {
    for (const sourceWorkflow of ["flat", "layered"]) {
      const cell = eligible.filter(
        (artefact) => artefact.briefId === brief.id && artefact.sourceWorkflow === sourceWorkflow
      );
      if (cell.length < perCell) throw new Error(`expert cell ${brief.id}/${sourceWorkflow} has fewer than ${perCell} eligible artefacts`);
      const orderedCell = seededShuffle(cell, `expert-cell:${brief.id}:${sourceWorkflow}`);
      const start = (reviewerIndex * perCell) % orderedCell.length;
      for (let offset = 0; offset < perCell; offset += 1) {
        selected.push(orderedCell[(start + offset) % orderedCell.length]);
      }
    }
  }
  return {
    artefacts: seededShuffle(selected, `expert-order:${id}`),
    perCell,
    selectionSeed: fnv1a32(`expert-selection:${id}`)
  };
}

export function offTargetChangeCount(baseState, finalState, candidateTargetIds) {
  const targets = new Set(candidateTargetIds || []);
  const diff = diffStates(baseState, finalState);
  return diff.semantic.filter((field) => !targets.has(field)).length + diff.visual.length;
}

export function validateReturn(record) {
  const errors = [];
  if (!record || typeof record !== "object") return ["return must be an object"];
  if (record.schemaVersion !== PACKAGE_SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  if (!normaliseParticipantId(record.participantId)) errors.push("participantId is missing or invalid");
  if (!["study-a", "study-b", "expert"].includes(record.study)) errors.push("unknown study");
  if (typeof record.synthetic !== "boolean") errors.push("synthetic flag must be explicit");
  if (!["demo", "cognitive_pilot", "main"].includes(record.collectionPhaseAtStart)) errors.push("collectionPhaseAtStart is missing or invalid");
  if (record.synthetic === true && record.collectionPhaseAtStart !== "demo") errors.push("synthetic return must use collection phase demo");
  if (record.synthetic === false && record.collectionPhaseAtStart === "demo") errors.push("human return cannot use collection phase demo");
  if (record.collectionPhaseAtStart === "cognitive_pilot" && !normaliseParticipantId(record.participantId).startsWith("PILOT-")) errors.push("cognitive pilot return must use a PILOT-* ID");
  if (record.collectionPhaseAtStart === "main" && /^(DEMO|PILOT)-/.test(normaliseParticipantId(record.participantId))) errors.push("main return cannot use a DEMO-* or PILOT-* ID");
  if (record.synthetic === true && record.launchRecordStage !== "demo") errors.push("synthetic return must use launchRecordStage demo");
  if (record.synthetic === false) {
    const expectedStage = record.collectionPhaseAtStart === "cognitive_pilot" ? "cognitive-pilot" : record.study;
    if (record.launchRecordStage !== expectedStage) errors.push(`human return launchRecordStage must be ${expectedStage}`);
    if (!/^[a-f0-9]{64}$/.test(String(record.packageFreezeBundleSha256 || ""))) errors.push("human return packageFreezeBundleSha256 is missing or invalid");
  }
  if (!record.packageVersion) errors.push("packageVersion is missing");
  if (record.consentConfirmed !== true) errors.push("consent confirmation is missing");
  if (!record.consentRecordedAt) errors.push("consent timestamp is missing");
  if (!record.startedAt || !record.exportedAt) errors.push("timestamps are incomplete");
  if (!Array.isArray(record.trials)) errors.push("trials must be an array");
  if (record.study === "study-a" && record.trials?.length !== 2) errors.push("Study A must contain exactly two trials");
  if (record.study === "study-b" && record.trials?.length !== 3) errors.push("Study B must contain exactly three trials");
  if (record.study === "expert" && record.trials?.length !== 12) errors.push("Expert audit must contain exactly twelve trials");

  for (const [index, trial] of (record.trials || []).entries()) {
    if (!trial.briefId) errors.push(`trial ${index} missing briefId`);
    if (!trial.completedAt) errors.push(`trial ${index} is incomplete`);
    if (record.study === "study-a") {
      if (!["flat", "layered"].includes(trial.condition)) errors.push(`trial ${index} has invalid condition`);
      errors.push(...validateArtifactState(trial.baseState).map((error) => `trial ${index} base: ${error}`));
      errors.push(...validateArtifactState(trial.finalState).map((error) => `trial ${index} final: ${error}`));
      if (!Array.isArray(trial.activeTargetIds)) errors.push(`trial ${index} missing activeTargetIds`);
      if (!Array.isArray(trial.candidates) || !trial.candidates.length) errors.push(`trial ${index} missing candidates`);
      for (const [candidateIndex, candidate] of (trial.candidates || []).entries()) {
        if (!Array.isArray(candidate.targetIds) || !candidate.targetIds.length) errors.push(`trial ${index} candidate ${candidateIndex} missing targetIds`);
        if (!Number.isFinite(Number(candidate.offTargetChangeCount))) errors.push(`trial ${index} candidate ${candidateIndex} missing offTargetChangeCount`);
      }
      if (!Number.isFinite(Number(trial.offTargetChangeCount))) errors.push(`trial ${index} missing offTargetChangeCount`);
      if (!trial.pre || !trial.post) errors.push(`trial ${index} missing pre/post material`);
    }
    if (record.study === "study-b") {
      if (!["closed", "open"].includes(record.protocol)) errors.push("Study B protocol is invalid");
      if (!trial.artefactId) errors.push(`trial ${index} missing artefactId`);
      if (!trial.protocolResponse || !trial.commonProbe) errors.push(`trial ${index} missing protocol/common response`);
    }
    if (record.study === "expert" && !["KEEP", "REVISE", "REJECT"].includes(trial.keepDecision)) {
      errors.push(`trial ${index} has invalid keepDecision`);
    }
    if (record.study === "expert") {
      if (!["1", "2", "3", "4", "5"].includes(String(trial.purposeFit))) errors.push(`trial ${index} has invalid purposeFit`);
      if (!["1", "2", "3", "4", "5"].includes(String(trial.interpretiveOpenness))) errors.push(`trial ${index} has invalid interpretiveOpenness`);
      if (typeof trial.rationale !== "string" || trial.rationale.trim().length < 10) errors.push(`trial ${index} has insufficient rationale`);
      if (typeof trial.requiredRevision !== "string" || !trial.requiredRevision.trim()) errors.push(`trial ${index} missing requiredRevision`);
    }
  }
  return [...new Set(errors)];
}

export function technicalAuditArtefact(artefact) {
  const errors = [];
  if (!artefact?.artefactId) errors.push("artefactId missing");
  if (!artefact?.sourceParticipantId) errors.push("sourceParticipantId missing");
  if (!["flat", "layered"].includes(artefact?.sourceWorkflow)) errors.push("sourceWorkflow invalid");
  errors.push(...validateArtifactState(artefact?.state));
  if (!Array.isArray(artefact?.eventLog) || !artefact.eventLog.length) errors.push("eventLog missing");
  return { status: errors.length ? "FAIL" : "PASS", errors };
}

export function createDemoBaseTrials() {
  return BRIEFS.flatMap((brief) => ["flat", "layered"].map((condition) => ({
    briefId: brief.id,
    condition,
    baseState: baseStateFor(brief.id)
  })));
}
