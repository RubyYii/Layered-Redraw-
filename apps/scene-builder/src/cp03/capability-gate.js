import {
  CP03_RUNTIME_SCHEMA_VERSION,
  sha256Canonical,
  validateAgentActionDraft,
  validateApprovalRecord,
} from "@layered-redraw/pact-cp03-contracts";

import { compileAgentPlan, planAgentIntent } from "../agent-runtime.js";
import { normalizeProject } from "../model.js";
import { hashProject } from "../scene-patch-runtime.js";

const REGISTERED_CAPABILITY = "performRegisteredInteraction";

const fail = (code, message) => {
  throw new Error(`${code}: ${message}`);
};

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const sortedUnique = (values) => [...new Set(values)].sort();

const assertExactSet = (actual, expected, code, label) => {
  const left = sortedUnique(actual);
  const right = sortedUnique(expected);
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    fail(code, `${label} must exactly match the deterministic runtime effect set`);
  }
};

const assertSceneReferences = (project, ids, code, label) => {
  const known = new Set(project.objects.map((object) => object.id));
  const missing = ids.find((id) => !known.has(id));
  if (missing) fail(code, `${label} references unknown scene object: ${missing}`);
};

const affectedIdsFor = (call) => sortedUnique([
  call.arguments.actorId,
  call.arguments.targetId,
  call.arguments.recipientId,
  call.arguments.placementTargetId,
].filter(Boolean));

const approvalIdentityMatches = (draft, approval) => {
  if (approval.caseSessionId !== draft.identity.caseSessionId) {
    fail("CP03_GATE_CASE_MISMATCH", "approval case identity does not match the draft");
  }
  if (approval.turnId !== draft.identity.turnId) {
    fail("CP03_GATE_TURN_MISMATCH", "approval turn identity does not match the draft");
  }
  if (approval.parentSceneHash !== draft.identity.parentSceneHash) {
    fail("CP03_GATE_SCENE_HASH_MISMATCH", "approval scene hash does not match the draft");
  }
};

export async function compileGuardedInteractionPlan({
  draft,
  approval,
  project,
  frame,
  now = new Date().toISOString(),
}) {
  if (approval === undefined || approval === null) {
    fail("CP03_GATE_APPROVAL_REQUIRED", "viewer approval required before planning");
  }
  const validatedDraft = validateAgentActionDraft(draft);
  const validatedApproval = validateApprovalRecord(approval);
  if (validatedApproval.decision !== "APPROVE") {
    fail("CP03_GATE_VIEWER_REJECTED", "the viewer rejected this proposal");
  }

  const draftHash = await sha256Canonical(validatedDraft);
  if (draftHash !== validatedApproval.draftHash) {
    fail("CP03_GATE_DRAFT_HASH_MISMATCH", "approval draft hash does not match the submitted draft");
  }
  approvalIdentityMatches(validatedDraft, validatedApproval);

  const currentProjectHash = await hashProject(project);
  if (validatedDraft.identity.parentSceneHash !== currentProjectHash) {
    fail("CP03_GATE_STALE_SCENE_HASH", "draft scene hash is stale");
  }
  if (validatedDraft.identity.schemaVersion !== CP03_RUNTIME_SCHEMA_VERSION
    || validatedDraft.decision.status !== "PROPOSED"
    || validatedDraft.execution.executionMode !== "EXECUTABLE_PROPOSAL") {
    fail("CP03_GATE_NON_EXECUTABLE_DRAFT", "draft is not an executable proposal");
  }

  const calls = validatedDraft.execution.semanticCapabilityCalls;
  if (calls.length !== 1) {
    fail(
      "CP03_GATE_LOCAL_SLICE_SINGLE_CALL_REQUIRED",
      "this local integration slice accepts exactly one capability call",
    );
  }
  const [call] = calls;
  if (call.capability !== REGISTERED_CAPABILITY) {
    fail("CP03_GATE_UNKNOWN_CAPABILITY", `unregistered capability: ${call.capability}`);
  }

  const affectedObjectIds = affectedIdsFor(call);
  const forbiddenObjectIds = sortedUnique(validatedDraft.execution.forbiddenChanges);
  assertSceneReferences(project, affectedObjectIds, "CP03_GATE_UNKNOWN_EFFECT_OBJECT", "expected changes");
  assertSceneReferences(project, forbiddenObjectIds, "CP03_GATE_UNKNOWN_FORBIDDEN_OBJECT", "forbidden changes");
  assertExactSet(
    validatedDraft.execution.expectedChanges,
    affectedObjectIds,
    "CP03_GATE_EXPECTED_CHANGE_MISMATCH",
    "expected changes",
  );
  const forbiddenAffected = affectedObjectIds.find((id) => forbiddenObjectIds.includes(id));
  if (forbiddenAffected) {
    fail("CP03_GATE_FORBIDDEN_EFFECT", `capability would affect forbidden object: ${forbiddenAffected}`);
  }

  const semanticIntent = {
    kind: "interact",
    actorId: call.arguments.actorId,
    targetId: call.arguments.targetId,
    affordance: call.arguments.affordance,
    ...(call.arguments.recipientId === undefined ? {} : { recipientId: call.arguments.recipientId }),
    ...(call.arguments.placementTargetId === undefined
      ? {}
      : { placementTargetId: call.arguments.placementTargetId }),
  };
  const runtimePlan = planAgentIntent(project, frame, semanticIntent);
  if (!runtimePlan.ok) {
    fail(
      `CP03_GATE_${String(runtimePlan.code ?? "INVALID_INTENT").toUpperCase()}`,
      `${runtimePlan.code ?? "invalid_intent"}: ${runtimePlan.message ?? "runtime rejected the intent"}`,
    );
  }
  const clips = compileAgentPlan(runtimePlan, frame?.time ?? 0);
  if (clips.length === 0 || !clips.some((clip) => clip.type === "interaction")) {
    fail("CP03_GATE_EMPTY_RUNTIME_PLAN", "semantic intent produced no interaction clip");
  }
  const existingClipIds = new Set(project.director?.timeline?.clips?.map((clip) => clip.id) ?? []);
  const duplicateClipId = clips.find((clip) => existingClipIds.has(clip.id))?.id;
  if (duplicateClipId) fail("CP03_GATE_CLIP_ID_COLLISION", `generated clip already exists: ${duplicateClipId}`);

  return deepFreeze({
    schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
    planId: `plan_${draftHash.slice(0, 20)}`,
    caseSessionId: validatedDraft.identity.caseSessionId,
    turnId: validatedDraft.identity.turnId,
    draftHash,
    approvalId: validatedApproval.approvalId,
    preconditionHash: currentProjectHash,
    actionSequence: [...validatedDraft.decision.actionSequence],
    capability: REGISTERED_CAPABILITY,
    capabilityArguments: structuredClone(call.arguments),
    affectedObjectIds,
    forbiddenObjectIds,
    rollbackRequirements: [...validatedDraft.execution.rollbackRequirements],
    clips: structuredClone(clips),
    compiledAt: String(now),
  });
}

export async function applyGuardedInteractionPlan({
  project,
  plan,
  now = new Date().toISOString(),
}) {
  if (!plan || plan.schemaVersion !== CP03_RUNTIME_SCHEMA_VERSION) {
    fail("CP03_GATE_INVALID_PLAN", "a compiled CP03 runtime plan is required");
  }
  const currentProjectHash = await hashProject(project);
  if (currentProjectHash !== plan.preconditionHash) {
    fail("CP03_GATE_STALE_PRECONDITION", "project changed after the plan was approved");
  }

  const overlaySource = normalizeProject(project);
  const existingClipIds = new Set(overlaySource.director.timeline.clips.map((clip) => clip.id));
  for (const clip of plan.clips) {
    if (existingClipIds.has(clip.id)) {
      fail("CP03_GATE_CLIP_ID_COLLISION", `generated clip already exists: ${clip.id}`);
    }
    overlaySource.director.timeline.clips.push(structuredClone(clip));
    existingClipIds.add(clip.id);
  }
  overlaySource.director.timeline.duration = overlaySource.director.timeline.clips.reduce(
    (maximum, clip) => Math.max(maximum, clip.start + clip.duration),
    0,
  );
  overlaySource.director.timeline.compiledScript = "";
  overlaySource.director.timeline.compiledAt = `cp03-gate:${plan.draftHash.slice(0, 16)}`;
  const overlayProject = normalizeProject(overlaySource);
  const resultSceneHash = await hashProject(overlayProject);
  const changedClipIds = plan.clips.map((clip) => clip.id);

  const receipt = deepFreeze({
    schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
    receiptId: `receipt_${plan.draftHash.slice(0, 20)}`,
    caseSessionId: plan.caseSessionId,
    turnId: plan.turnId,
    draftHash: plan.draftHash,
    approvalId: plan.approvalId,
    preconditionHash: plan.preconditionHash,
    resultSceneHash,
    capability: plan.capability,
    changedClipIds: [...changedClipIds],
    changedObjectIds: [...plan.affectedObjectIds],
    forbiddenObjectIds: [...plan.forbiddenObjectIds],
    rollbackRequirements: [...plan.rollbackRequirements],
    appliedAt: String(now),
    rollback: {
      kind: "DISCARD_TRANSIENT_DIRECTOR_OVERLAY",
      sourceProjectHash: plan.preconditionHash,
    },
  });

  return { project: overlayProject, receipt };
}
