export const IK_MIN_ITERATIONS = 1;
export const IK_MAX_ITERATIONS = 8;

const finiteVector = (value) => Array.isArray(value)
  && value.length >= 3
  && value.slice(0, 3).every(Number.isFinite);

const vectorLength = (value) => Math.hypot(value[0], value[1], value[2]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function constrainLimbTarget({
  origin,
  target,
  currentEffector,
  segmentLengths,
  singularityMargin = 0.015,
  epsilon = 1e-5,
} = {}) {
  const lengths = Array.isArray(segmentLengths)
    ? segmentLengths.slice(0, 32).map(Number)
    : [];
  if (!finiteVector(origin) || !finiteVector(target) || !finiteVector(currentEffector)) {
    return { valid: false, reason: "non_finite_target", effectiveTarget: null };
  }
  if (!lengths.length || lengths.some((length) => !Number.isFinite(length) || length <= epsilon)) {
    return { valid: false, reason: "degenerate_chain", effectiveTarget: null };
  }

  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const longestSegment = Math.max(...lengths);
  const safeMargin = clamp(Number(singularityMargin) || 0, 0, 0.1);
  const maxReach = Math.max(epsilon, totalLength * (1 - safeMargin));
  const minReach = Math.min(
    maxReach,
    Math.max(epsilon, Math.max(0, longestSegment - (totalLength - longestSegment)) + totalLength * safeMargin),
  );
  const requestedOffset = target.slice(0, 3).map((value, axis) => value - origin[axis]);
  const requestedDistance = vectorLength(requestedOffset);
  let direction = requestedOffset;
  if (requestedDistance <= epsilon) {
    direction = currentEffector.slice(0, 3).map((value, axis) => value - origin[axis]);
  }
  let directionLength = vectorLength(direction);
  if (directionLength <= epsilon) {
    direction = [0, 0, 1];
    directionLength = 1;
  }
  const effectiveDistance = clamp(requestedDistance, minReach, maxReach);
  const unitDirection = direction.map((value) => value / directionLength);
  const effectiveTarget = origin.map((value, axis) => value + unitDirection[axis] * effectiveDistance);
  const reason = requestedDistance > maxReach
    ? "outside_max_reach"
    : requestedDistance < minReach
      ? "inside_min_reach"
      : null;
  return {
    valid: true,
    clamped: Boolean(reason),
    reason,
    effectiveTarget,
    requestedDistance,
    effectiveDistance,
    minReach,
    maxReach,
    segmentLengths: lengths,
  };
}

export function selectIkSolvePolicy({
  distance = 0,
  visible = true,
  selected = false,
  fullQuality = false,
} = {}) {
  const safeDistance = Math.max(0, Number(distance) || 0);
  if (fullQuality) return { tier: "export-full", iterations: IK_MAX_ITERATIONS };
  if (selected) return { tier: "selected-full", iterations: IK_MAX_ITERATIONS };
  if (!visible) return { tier: "offscreen", iterations: IK_MIN_ITERATIONS };
  if (safeDistance <= 18) return { tier: "near", iterations: IK_MAX_ITERATIONS };
  if (safeDistance <= 40) return { tier: "mid", iterations: 5 };
  if (safeDistance <= 80) return { tier: "far", iterations: 3 };
  return { tier: "distant", iterations: IK_MIN_ITERATIONS };
}

export function stepIkIterationBudget(current, target, step = 1) {
  const safeCurrent = clamp(Math.round(Number(current) || IK_MIN_ITERATIONS), IK_MIN_ITERATIONS, IK_MAX_ITERATIONS);
  const safeTarget = clamp(Math.round(Number(target) || IK_MIN_ITERATIONS), IK_MIN_ITERATIONS, IK_MAX_ITERATIONS);
  const safeStep = Math.max(1, Math.round(Number(step) || 1));
  if (safeCurrent === safeTarget) return safeCurrent;
  return safeCurrent < safeTarget
    ? Math.min(safeTarget, safeCurrent + safeStep)
    : Math.max(safeTarget, safeCurrent - safeStep);
}
