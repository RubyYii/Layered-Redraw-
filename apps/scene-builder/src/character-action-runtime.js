export const CHARACTER_ACTION_STATES = Object.freeze([
  "idle",
  "approach",
  "look",
  "reach",
  "grasp",
  "carry",
  "transfer",
  "release",
  "speak",
]);

const TRANSITIONS = Object.freeze({
  idle: new Set(["idle", "approach", "look", "reach", "speak"]),
  approach: new Set(["approach", "idle", "look", "reach", "speak"]),
  look: new Set(["look", "idle", "approach", "reach", "speak"]),
  reach: new Set(["reach", "idle", "grasp", "carry", "transfer", "release"]),
  grasp: new Set(["grasp", "carry", "idle"]),
  carry: new Set(["carry", "idle", "approach", "look", "reach", "transfer", "release", "speak"]),
  transfer: new Set(["transfer", "idle", "carry"]),
  release: new Set(["release", "idle"]),
  speak: new Set(["speak", "idle", "approach", "look", "reach", "carry"]),
});

const CONTEXT_FIELDS = new Set([
  "targetId",
  "recipientId",
  "placementTargetId",
  "hand",
  "utterance",
  "clipId",
  "source",
]);

const cleanContext = (value = {}) => Object.fromEntries(Object.entries(value)
  .filter(([key, entry]) => (
    CONTEXT_FIELDS.has(key)
    && ["string", "number"].includes(typeof entry)
    && String(entry).trim()
  ))
  .map(([key, entry]) => {
    const text = String(entry).trim();
    if (key === "hand") return [key, ["auto", "left", "right", "both"].includes(text) ? text : "auto"];
    return [key, text.slice(0, key === "utterance" ? 500 : 160)];
  }));

export const animationSlotForCharacterAction = (state) => ({
  approach: "move",
  reach: "interact",
  grasp: "interact",
  transfer: "interact",
  release: "interact",
  look: "react",
  speak: "react",
}[state] ?? "idle");

export const characterActionUsesFootLock = (state) => state !== "approach";

export function validateCharacterActionContext(state, context = {}) {
  if (!CHARACTER_ACTION_STATES.includes(state)) {
    return { ok: false, code: "unknown_state", message: `未知角色动作状态：${state}` };
  }
  const safeContext = cleanContext(context);
  if (["approach", "look", "reach", "grasp"].includes(state) && !safeContext.targetId) {
    return { ok: false, code: "missing_target", message: `${state} 需要 targetId。` };
  }
  if (state === "transfer" && (!safeContext.targetId || !safeContext.recipientId)) {
    return { ok: false, code: "missing_transfer_target", message: "transfer 需要 targetId 与 recipientId。" };
  }
  if (state === "release" && (!safeContext.targetId || !safeContext.placementTargetId)) {
    return { ok: false, code: "missing_release_target", message: "release 需要 targetId 与 placementTargetId。" };
  }
  if (state === "speak" && !safeContext.utterance) {
    return { ok: false, code: "missing_utterance", message: "speak 需要非空 utterance。" };
  }
  return { ok: true };
}

export function createCharacterActionStateMachine({ initialState = "idle", historyLimit = 32 } = {}) {
  if (!CHARACTER_ACTION_STATES.includes(initialState)) throw new Error(`未知角色动作状态：${initialState}`);
  let state = initialState;
  let context = {};
  let sequence = 0;
  const history = [];

  const commit = (nextState, nextContext, source, synchronized) => {
    const previous = state;
    state = nextState;
    context = cleanContext(nextContext);
    sequence += 1;
    history.push(Object.freeze({ sequence, previous, state, source, synchronized, context: { ...context } }));
    if (history.length > historyLimit) history.splice(0, history.length - historyLimit);
    return { ok: true, changed: previous !== state, previous, state, context: { ...context }, sequence };
  };

  return Object.freeze({
    transition(nextState, nextContext = {}, { source = "runtime" } = {}) {
      const validation = validateCharacterActionContext(nextState, nextContext);
      if (!validation.ok) return validation;
      if (!TRANSITIONS[state]?.has(nextState)) {
        return { ok: false, code: "invalid_transition", message: `${state} 不能直接切换到 ${nextState}。`, state };
      }
      if (nextState === state && JSON.stringify(cleanContext(nextContext)) === JSON.stringify(context)) {
        return { ok: true, changed: false, previous: state, state, context: { ...context }, sequence };
      }
      return commit(nextState, nextContext, source, false);
    },
    synchronize(nextState, nextContext = {}, { source = "timeline-seek" } = {}) {
      const validation = validateCharacterActionContext(nextState, nextContext);
      if (!validation.ok) return validation;
      if (nextState === state && JSON.stringify(cleanContext(nextContext)) === JSON.stringify(context)) {
        return { ok: true, changed: false, previous: state, state, context: { ...context }, sequence };
      }
      return commit(nextState, nextContext, source, true);
    },
    reset() {
      return commit("idle", {}, "reset", true);
    },
    snapshot() {
      return { state, context: { ...context }, sequence, history: history.map((entry) => ({ ...entry, context: { ...entry.context } })) };
    },
  });
}
