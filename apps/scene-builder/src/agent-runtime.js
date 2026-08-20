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

const stateFor = (project, frame, objectId) => {
  const source = project.objects.find((object) => object.id === objectId);
  const runtime = frame?.objects?.[objectId];
  if (!source) return null;
  return {
    source,
    position: runtime?.position ?? source.position,
    visible: runtime?.visible ?? source.visible,
    semanticState: runtime?.semanticState ?? source.entity?.state ?? "默认",
  };
};

const anchorPositionFor = (targetState, anchorName) => {
  const anchor = targetState.source.interactionSpec?.anchors?.[anchorName] ?? [0, 0, 0];
  return targetState.position.map((value, axis) => value + anchor[axis]);
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
