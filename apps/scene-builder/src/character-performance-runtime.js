export const CHARACTER_PERFORMANCE_EXPRESSION_SLOTS = Object.freeze([
  "smile",
  "frown",
  "blinkLeft",
  "blinkRight",
  "mouthOpen",
  "surprise",
]);

const PROFILE_BY_STATE = Object.freeze({
  idle: { footLock: true, gazeWeight: 0, gazeMaxDegrees: 30, handWeight: 0 },
  approach: { footLock: false, gazeWeight: 0.45, gazeMaxDegrees: 35, handWeight: 0 },
  look: { footLock: true, gazeWeight: 1, gazeMaxDegrees: 55, handWeight: 0 },
  reach: { footLock: true, gazeWeight: 0.82, gazeMaxDegrees: 50, handWeight: 0.65 },
  grasp: { footLock: true, gazeWeight: 0.88, gazeMaxDegrees: 46, handWeight: 1 },
  carry: { footLock: true, gazeWeight: 0.55, gazeMaxDegrees: 40, handWeight: 1 },
  transfer: { footLock: true, gazeWeight: 0.92, gazeMaxDegrees: 48, handWeight: 1 },
  release: { footLock: true, gazeWeight: 0.78, gazeMaxDegrees: 45, handWeight: 1 },
  speak: { footLock: true, gazeWeight: 0.68, gazeMaxDegrees: 44, handWeight: 0 },
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const clamp01 = (value) => clamp(Number(value) || 0, 0, 1);
const finiteVector = (value) => Array.isArray(value)
  && value.length >= 3
  && value.slice(0, 3).every(Number.isFinite);
const smoothstep = (value) => {
  const safe = clamp01(value);
  return safe * safe * (3 - 2 * safe);
};

export function speechMouthEnvelope({ utterance = "", progress = 0.5 } = {}) {
  const text = String(utterance).trim();
  if (!text) return 0;
  const safeProgress = clamp01(progress);
  const visibleCharacters = [...text].filter((character) => !/\s/u.test(character)).length;
  const pulseCount = clamp(Math.ceil(visibleCharacters / 4), 2, 14);
  const attack = smoothstep(safeProgress / 0.08);
  const release = smoothstep((1 - safeProgress) / 0.1);
  const articulation = 0.32 + Math.abs(Math.sin(safeProgress * Math.PI * pulseCount)) * 0.58;
  return clamp01(attack * release * articulation);
}

export function characterPerformanceProfile(state = "idle", context = {}) {
  const safeState = Object.hasOwn(PROFILE_BY_STATE, state) ? state : "idle";
  const base = PROFILE_BY_STATE[safeState];
  const phaseProgress = clamp01(context.phaseProgress ?? context.interactionProgress ?? 0);
  const explicitContactWeight = Number(context.contactWeight);
  const contactWeight = Number.isFinite(explicitContactWeight)
    ? clamp01(explicitContactWeight)
    : base.handWeight;
  const hand = ["auto", "left", "right", "both"].includes(context.hand)
    ? context.hand
    : "auto";
  const expressions = Object.fromEntries(
    CHARACTER_PERFORMANCE_EXPRESSION_SLOTS.map((slot) => [slot, 0]),
  );

  if (safeState === "look") expressions.surprise = 0.04;
  else if (safeState === "grasp") expressions.mouthOpen = 0.04;
  else if (safeState === "transfer") expressions.smile = 0.08;
  else if (safeState === "release") expressions.smile = 0.05;
  else if (safeState === "speak") {
    expressions.mouthOpen = speechMouthEnvelope({
      utterance: context.utterance,
      progress: context.phaseProgress ?? 0.5,
    });
    const blinkDistance = Math.abs(phaseProgress - 0.22);
    const blinkWeight = blinkDistance < 0.035
      ? smoothstep(1 - blinkDistance / 0.035) * 0.72
      : 0;
    expressions.blinkLeft = blinkWeight;
    expressions.blinkRight = blinkWeight;
  }

  return Object.freeze({
    state: safeState,
    phase: typeof context.phase === "string" ? context.phase : null,
    phaseProgress,
    footLock: base.footLock,
    gazeWeight: base.gazeWeight,
    gazeMaxDegrees: base.gazeMaxDegrees,
    hand,
    handWeight: ["reach", "grasp", "carry", "transfer", "release"].includes(safeState)
      ? contactWeight
      : 0,
    expressions: Object.freeze(expressions),
  });
}

export function planTwoHandContactTargets({
  center,
  rightAxis = [1, 0, 0],
  targetWidth = 0,
  minimumSpan = 0.14,
  maximumSpan = 0.5,
  widthRatio = 0.72,
} = {}) {
  if (!finiteVector(center) || !finiteVector(rightAxis)) {
    return { valid: false, reason: "non_finite_contact_frame" };
  }
  const axisLength = Math.hypot(...rightAxis.slice(0, 3));
  if (axisLength <= 1e-6) return { valid: false, reason: "degenerate_right_axis" };
  const safeMinimum = Math.max(0.02, Number(minimumSpan) || 0.14);
  const safeMaximum = Math.max(safeMinimum, Number(maximumSpan) || 0.5);
  const requestedSpan = Math.max(0, Number(targetWidth) || 0) * clamp(Number(widthRatio) || 0.72, 0.1, 1);
  const span = clamp(requestedSpan, safeMinimum, safeMaximum);
  const direction = rightAxis.slice(0, 3).map((value) => value / axisLength);
  const halfSpan = span / 2;
  const leftHand = center.slice(0, 3).map((value, axis) => value - direction[axis] * halfSpan);
  const rightHand = center.slice(0, 3).map((value, axis) => value + direction[axis] * halfSpan);
  return {
    valid: true,
    reason: null,
    leftHand,
    rightHand,
    span,
    requestedSpan,
    clamped: Math.abs(span - requestedSpan) > 1e-9,
  };
}
