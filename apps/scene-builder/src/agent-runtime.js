import cp02IntentFixture from "../projects/window-case-cp02/intent-fixtures.json" with { type: "json" };
import { rotateLocalOffset } from "./interaction-runtime.js";
import { planGroundPath } from "./navigation-runtime.js";
import { hashProject, validateScenePatch } from "./scene-patch-runtime.js";
import { resolveAssetForSlot, validateAssetCatalog, validateSceneSlots } from "./scene-governance.js";

const FORBIDDEN_INTENT_FIELDS = Object.freeze([
  "position",
  "rotation",
  "scale",
  "path",
  "url",
  "code",
  "script",
]);

const round = (value, precision = 3) => Number(value.toFixed(precision));
const normalizeWhitespace = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const findForbiddenIntentField = (value) => {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_INTENT_FIELDS.includes(key)) return key;
    const nested = findForbiddenIntentField(child);
    if (nested) return nested;
  }
  return null;
};

const stateFor = (project, frame, objectId) => {
  const source = project.objects.find((object) => object.id === objectId);
  const runtime = frame?.objects?.[objectId];
  if (!source) return null;
  return {
    source,
    position: runtime?.position ?? source.position,
    rotation: runtime?.rotation ?? source.rotation,
    visible: runtime?.visible ?? source.visible,
    semanticState: runtime?.semanticState ?? source.entity?.state ?? "默认",
  };
};

const anchorPositionFor = (targetState, anchorName) => {
  const anchor = targetState.source.interactionSpec?.anchors?.[anchorName] ?? [0, 0, 0];
  const rotated = rotateLocalOffset(anchor, targetState.rotation);
  return targetState.position.map((value, axis) => value + rotated[axis]);
};

const groundDistance = (from, to) => Math.hypot(to[0] - from[0], to[2] - from[2]);

export const AGENT_INTENT_CONTRACT = Object.freeze({
  version: 1,
  allowedKinds: ["interact"],
  requiredFields: ["kind", "actorId", "targetId", "affordance"],
  forbiddenFields: FORBIDDEN_INTENT_FIELDS,
  principle: "The model chooses a semantic intent; the deterministic scene runtime owns transforms, paths, collision and animation.",
});

export function buildAgentObservation(project, frame, actorId) {
  const actor = stateFor(project, frame, actorId);
  if (!actor || actor.source.entity?.role !== "character") throw new Error(`角色不存在：${actorId}`);

  const perceivedEntities = project.objects
    .filter((object) => object.id !== actorId && Object.keys(object.interactionSpec?.affordances ?? {}).length)
    .map((object) => {
      const target = stateFor(project, frame, object.id);
      const affordances = Object.entries(object.interactionSpec.affordances).map(([name, affordance]) => {
        const anchorPosition = anchorPositionFor(target, affordance.targetAnchor);
        const distance = groundDistance(actor.position, anchorPosition);
        return {
          name,
          action: affordance.action,
          actorNode: affordance.actorNode,
          targetAnchor: affordance.targetAnchor,
          maxDistance: affordance.maxDistance,
          distance: round(distance),
          inRange: distance <= affordance.maxDistance,
          requiresLineOfSight: affordance.requiresLineOfSight,
        };
      });
      return {
        id: object.id,
        name: object.name,
        role: object.entity?.role ?? "prop",
        state: target.semanticState,
        visible: target.visible,
        affordances,
      };
    })
    .filter((object) => object.visible)
    .sort((a, b) => {
      const distanceA = Math.min(...a.affordances.map((item) => item.distance));
      const distanceB = Math.min(...b.affordances.map((item) => item.distance));
      return distanceA - distanceB;
    });

  return {
    schemaVersion: 1,
    sceneTime: round(frame?.time ?? 0),
    actor: {
      id: actor.source.id,
      name: actor.source.name,
      state: actor.semanticState,
    },
    perceivedEntities,
    intentContract: AGENT_INTENT_CONTRACT,
  };
}

export function validateAgentIntent(project, frame, rawIntent) {
  if (!rawIntent || typeof rawIntent !== "object" || Array.isArray(rawIntent)) {
    return { ok: false, code: "invalid_payload", message: "意图必须是对象。" };
  }
  const forbiddenField = FORBIDDEN_INTENT_FIELDS.find((field) => Object.hasOwn(rawIntent, field));
  if (forbiddenField) {
    return {
      ok: false,
      code: "direct_transform_forbidden",
      message: `大模型不能直接写入 ${forbiddenField}；请只返回语义意图。`,
    };
  }
  if (rawIntent.kind !== "interact") {
    return { ok: false, code: "unsupported_kind", message: "当前只允许 interact 语义意图。" };
  }

  const actor = stateFor(project, frame, String(rawIntent.actorId ?? ""));
  const target = stateFor(project, frame, String(rawIntent.targetId ?? ""));
  if (!actor || actor.source.entity?.role !== "character") {
    return { ok: false, code: "invalid_actor", message: "actorId 必须指向角色根节点。" };
  }
  if (!target || !target.visible) {
    return { ok: false, code: "invalid_target", message: "目标不存在或当前不可见。" };
  }

  const affordanceName = String(rawIntent.affordance ?? "");
  const affordance = target.source.interactionSpec?.affordances?.[affordanceName];
  if (!affordance) {
    return { ok: false, code: "unknown_affordance", message: "目标没有声明这个可交互能力。" };
  }
  if (rawIntent.action && rawIntent.action !== affordance.action) {
    return { ok: false, code: "action_mismatch", message: "action 与目标声明的 affordance 不匹配。" };
  }

  const actorHasNode = Boolean(
    actor.source.asset?.nodes?.[affordance.actorNode]
    || actor.source.interactionSpec?.anchors?.[affordance.actorNode],
  );
  if (!actorHasNode) {
    return { ok: false, code: "missing_actor_node", message: `角色模型未绑定 ${affordance.actorNode} 节点。` };
  }

  const targetPosition = anchorPositionFor(target, affordance.targetAnchor);
  const distance = groundDistance(actor.position, targetPosition);
  if (distance > affordance.maxDistance) {
    return {
      ok: false,
      code: "out_of_range",
      recoverable: true,
      message: "角色需要先由导航系统移动到交互范围内。",
      distance: round(distance),
      maxDistance: affordance.maxDistance,
    };
  }

  return {
    ok: true,
    intent: {
      kind: "interact",
      actorId: actor.source.id,
      targetId: target.source.id,
      affordance: affordanceName,
      action: affordance.action,
      actorNode: affordance.actorNode,
      targetAnchor: affordance.targetAnchor,
      resultingState: affordance.resultingState,
      reason: String(rawIntent.reason ?? "").trim().slice(0, 240),
    },
  };
}

export function planAgentIntent(project, frame, rawIntent, navigationOptions = {}) {
  const validation = validateAgentIntent(project, frame, rawIntent);
  if (validation.ok) return { ok: true, requiresNavigation: false, steps: [{ kind: "interact", intent: validation.intent }] };
  if (validation.code !== "out_of_range") return validation;

  const actorId = String(rawIntent.actorId ?? "");
  const targetId = String(rawIntent.targetId ?? "");
  const affordanceName = String(rawIntent.affordance ?? "");
  const actor = stateFor(project, frame, actorId);
  const target = stateFor(project, frame, targetId);
  const affordance = target?.source.interactionSpec?.affordances?.[affordanceName];
  if (!actor || !target || !affordance) return validation;

  const anchor = anchorPositionFor(target, affordance.targetAnchor);
  const dx = actor.position[0] - anchor[0];
  const dz = actor.position[2] - anchor[2];
  const length = Math.max(0.0001, Math.hypot(dx, dz));
  const standOff = Math.max(0.15, affordance.maxDistance * 0.72);
  const approach = [
    anchor[0] + (dx / length) * standOff,
    actor.position[1],
    anchor[2] + (dz / length) * standOff,
  ];
  const navigation = planGroundPath(project, actor.position, approach, {
    ...navigationOptions,
    ignoreIds: [...new Set([...(navigationOptions.ignoreIds ?? []), actorId, targetId])],
  });
  if (!navigation.ok) {
    return { ok: false, code: navigation.code, recoverable: true, message: "导航系统没有找到安全接近目标的路径。" };
  }

  const simulatedFrame = {
    ...frame,
    objects: {
      ...(frame?.objects ?? {}),
      [actorId]: { ...(frame?.objects?.[actorId] ?? {}), position: approach },
    },
  };
  const atGoal = validateAgentIntent(project, simulatedFrame, rawIntent);
  if (!atGoal.ok) return atGoal;
  return {
    ok: true,
    requiresNavigation: true,
    steps: [
      { kind: "navigate", actorId, path: navigation.path, distance: navigation.distance },
      { kind: "interact", intent: atGoal.intent },
    ],
  };
}

export function compileAgentPlan(plan, frameTime = 0, { speed = 1.4, interactionDuration = 1.1 } = {}) {
  if (!plan?.ok || !Array.isArray(plan.steps)) return [];
  let cursor = Math.max(0, Number(frameTime) || 0);
  const clips = [];
  const planKey = plan.steps.map((step) => [
    step.actorId ?? step.intent?.actorId ?? "actor",
    step.intent?.targetId,
    step.intent?.affordance,
  ].filter(Boolean).join("-")).join("-").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 96);
  const timeKey = Math.round(cursor * 1000);
  for (const [index, step] of plan.steps.entries()) {
    if (step.kind === "navigate" && step.path.length >= 2) {
      const duration = Math.max(0.2, step.distance / Math.max(0.2, speed));
      clips.push({
        id: `agent-${planKey}-${timeKey}-${index}-move`, type: "move", track: "character",
        label: "智能体安全接近", start: cursor, duration, targetId: step.actorId,
        from: step.path[0], to: step.path.at(-1), path: step.path,
        motion: { easing: "minimumJerk", orientToPath: true, turnPortion: 0.22 },
      });
      cursor += duration;
    } else if (step.kind === "interact") {
      clips.push({
        id: `agent-${planKey}-${timeKey}-${index}-interaction`, type: "interaction", track: "character",
        label: `智能体交互 · ${step.intent.action}`, start: cursor, duration: interactionDuration,
        targetId: step.intent.targetId, secondaryTargetId: step.intent.actorId,
        action: step.intent.action, actorNode: step.intent.actorNode,
        targetAnchor: step.intent.targetAnchor, resultingState: step.intent.resultingState,
        motion: { easing: "minimumJerk" },
      });
      cursor += interactionDuration;
    }
  }
  return clips;
}

export async function runAgentTurn({
  project,
  frame,
  actorId,
  decide,
  navigationOptions = {},
  motionOptions = {},
}) {
  if (typeof decide !== "function") throw new Error("智能体适配器必须提供 decide(observation) 函数。");
  const observation = buildAgentObservation(project, frame, actorId);
  const rawIntent = await decide(structuredClone(observation));
  const plan = planAgentIntent(project, frame, rawIntent, navigationOptions);
  return {
    observation,
    plan,
    clips: compileAgentPlan(plan, frame?.time ?? 0, motionOptions),
  };
}

export function validateAssetIntent(rawIntent, slots) {
  if (!rawIntent || typeof rawIntent !== "object" || Array.isArray(rawIntent)) {
    return { ok: false, code: "invalid_payload", message: "Asset Intent must be an object." };
  }
  if (rawIntent.kind === "withhold") {
    const allowed = new Set(["kind", "code"]);
    if (Object.keys(rawIntent).some((key) => !allowed.has(key))) {
      return { ok: false, code: "undeclared_field", message: "Withhold intent contains undeclared fields." };
    }
    const code = String(rawIntent.code ?? "provider_withheld").trim().slice(0, 96) || "provider_withheld";
    return { ok: true, intent: { kind: "withhold", code } };
  }

  const forbiddenField = findForbiddenIntentField(rawIntent);
  if (forbiddenField) {
    return {
      ok: false,
      code: "direct_scene_control_forbidden",
      message: `The provider cannot author ${forbiddenField}.`,
    };
  }

  const allowed = new Set(["kind", "caseAction", "requests", "reason"]);
  if (Object.keys(rawIntent).some((key) => !allowed.has(key))) {
    return { ok: false, code: "undeclared_field", message: "Asset Intent contains undeclared fields." };
  }
  if (rawIntent.kind !== "compose" || rawIntent.caseAction !== "Reframe") {
    return { ok: false, code: "unsupported_intent", message: "CP02 permits only a compose/Reframe intent." };
  }

  let normalizedSlots;
  try {
    normalizedSlots = validateSceneSlots(slots);
  } catch (error) {
    return { ok: false, code: "invalid_scene_slots", message: error.message };
  }
  if (!Array.isArray(rawIntent.requests) || rawIntent.requests.length === 0 || rawIntent.requests.length > 8) {
    return { ok: false, code: "invalid_requests", message: "Asset Intent requires 1 to 8 requests." };
  }

  const seenSlots = new Set();
  const requests = [];
  for (const [index, request] of rawIntent.requests.entries()) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      return { ok: false, code: "invalid_request", message: `Request ${index} must be an object.` };
    }
    const requestFields = new Set(["operation", "semanticClass", "slotId"]);
    if (Object.keys(request).some((key) => !requestFields.has(key))) {
      return { ok: false, code: "undeclared_field", message: `Request ${index} contains undeclared fields.` };
    }
    if (request.operation !== "add") {
      return { ok: false, code: "unsupported_operation", message: "The CP02 fixture permits only add requests." };
    }
    const slot = normalizedSlots.find((candidate) => candidate.id === request.slotId);
    if (!slot) return { ok: false, code: "unknown_slot", message: `Unknown authored slot: ${request.slotId}` };
    if (slot.semanticClass !== request.semanticClass) {
      return { ok: false, code: "semantic_slot_mismatch", message: `Request ${index} mismatches its slot.` };
    }
    if (seenSlots.has(slot.id)) return { ok: false, code: "duplicate_slot", message: `Duplicate slot: ${slot.id}` };
    seenSlots.add(slot.id);
    requests.push({ operation: "add", semanticClass: slot.semanticClass, slotId: slot.id });
  }

  return {
    ok: true,
    intent: {
      kind: "compose",
      caseAction: "Reframe",
      requests,
      reason: String(rawIntent.reason ?? "").trim().slice(0, 500),
    },
  };
}

export async function decideCp02ReframeIntent(observation) {
  const utterance = normalizeWhitespace(observation?.participantText);
  const fixtures = [
    { utterances: cp02IntentFixture.utterances, intent: cp02IntentFixture.intent },
    ...(cp02IntentFixture.followUps ?? []),
  ];
  for (const fixture of fixtures) {
    if (fixture.utterances.map(normalizeWhitespace).includes(utterance)) {
      return structuredClone(fixture.intent);
    }
  }
  return { kind: "withhold", code: "unsupported_fixture_utterance" };
}

export async function runSceneCompositionTurn({ project, text, decide, catalog, slots }) {
  if (typeof decide !== "function") throw new Error("Scene composition provider must implement decide(observation).");
  if (!project?.cp02?.sourcePhotoSha256) throw new Error("Scene composition requires validated CP02 source metadata.");
  const normalizedCatalog = validateAssetCatalog(catalog);
  const normalizedSlots = validateSceneSlots(slots);
  const availableSemanticClasses = [...new Set(normalizedCatalog
    .filter((asset) => asset.status === "PROJECT_AUTHORED_PROXY")
    .map((asset) => asset.semanticClass))];
  const observation = {
    schemaVersion: 1,
    participantText: normalizeWhitespace(text),
    sourceStatus: {
      sourcePhotoState: "SOURCE_LOCKED",
      sourcePhotoSha256: project.cp02.sourcePhotoSha256,
      evidenceState: "EVIDENCE_LOCKED",
      mutableProposalState: "PROPOSED",
    },
    availableSemanticClasses,
    authoredSlots: normalizedSlots.map((slot) => ({ id: slot.id, semanticClass: slot.semanticClass })),
    actionRules: {
      caseAction: "Reframe",
      allowedOperations: ["add"],
      directSceneControl: "forbidden",
      guardianRequired: true,
      undoRequired: true,
    },
  };
  const rawIntent = await decide(structuredClone(observation));
  const validation = validateAssetIntent(rawIntent, normalizedSlots);
  if (!validation.ok) {
    const intent = { kind: "withhold", code: validation.code };
    return {
      observation,
      intent,
      patchPreview: {
        outcome: "WITHHELD",
        provider: cp02IntentFixture.provider,
        code: validation.code,
        reason: validation.message,
      },
    };
  }
  if (validation.intent.kind === "withhold") {
    return {
      observation,
      intent: validation.intent,
      patchPreview: {
        outcome: "WITHHELD",
        provider: cp02IntentFixture.provider,
        code: validation.intent.code,
      },
    };
  }

  const operations = [];
  const expectedChangedObjectIds = [];
  for (const request of validation.intent.requests) {
    const asset = normalizedCatalog.find((candidate) => (
      candidate.status === "PROJECT_AUTHORED_PROXY"
      && candidate.semanticClass === request.semanticClass
    ));
    if (!asset) throw new Error(`No engineering proxy is registered for ${request.semanticClass}`);
    const resolved = resolveAssetForSlot(
      normalizedCatalog,
      normalizedSlots,
      asset.assetId,
      request.slotId,
      "engineering-evidence",
    );
    operations.push({ kind: "add", assetId: resolved.asset.assetId, slotId: resolved.slot.id });
    expectedChangedObjectIds.push(
      resolved.asset.objectId,
      ...resolved.asset.bundle.children.map((child) => child.id),
    );
  }
  const forbiddenChangedObjectIds = project.objects
    .filter((object) => ["SOURCE_LOCKED", "EVIDENCE_LOCKED", "STAGE_LOCKED"].includes(object.governance?.state))
    .map((object) => object.id)
    .sort();
  const patchPreview = {
    schemaVersion: 1,
    patchId: validation.intent.requests.length === 1
      && validation.intent.requests[0].semanticClass === "thermos"
      ? "CP02-REFRAME-THERMOS-001"
      : "CP02-REFRAME-INITIAL-001",
    caseAction: validation.intent.caseAction,
    provider: cp02IntentFixture.provider,
    reason: validation.intent.reason,
    preconditionHash: await hashProject(project),
    expectedChangedObjectIds,
    forbiddenChangedObjectIds,
    operations,
  };
  await validateScenePatch({
    project,
    catalog: normalizedCatalog,
    slots: normalizedSlots,
    patch: patchPreview,
    mode: "engineering-evidence",
  });
  return { observation, intent: validation.intent, patchPreview };
}
