const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const minimumJerk = (value) => {
  const t = clamp01(value);
  return t * t * t * (10 + t * (-15 + 6 * t));
};

export const progressForMotion = (value, motion = null) => {
  if (motion?.easing === "linear") return clamp01(value);
  if (motion?.easing === "smooth") return smoothstep(value);
  return minimumJerk(value);
};

const catmullRomScalar = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
};

const sampleVectorPathRaw = (points, value) => {
  if (!Array.isArray(points) || points.length === 0) return [0, 0, 0];
  if (points.length === 1) return [...points[0]];
  const t = clamp01(value);
  if (points.length === 2) {
    return points[0].map((entry, axis) => entry + (points[1][axis] - entry) * t);
  }
  const segmentCount = points.length - 1;
  const scaled = t * segmentCount;
  const segment = Math.min(segmentCount - 1, Math.floor(scaled));
  const local = segment === segmentCount ? 1 : scaled - segment;
  const p0 = points[Math.max(0, segment - 1)];
  const p1 = points[segment];
  const p2 = points[Math.min(points.length - 1, segment + 1)];
  const p3 = points[Math.min(points.length - 1, segment + 2)];
  return [0, 1, 2].map((axis) => catmullRomScalar(p0[axis], p1[axis], p2[axis], p3[axis], local));
};

const arcLengthCache = new WeakMap();

const arcLengthTableFor = (points) => {
  const cached = arcLengthCache.get(points);
  if (cached) return cached;
  const divisions = Math.max(32, (points.length - 1) * 32);
  const entries = [{ t: 0, length: 0 }];
  let previous = sampleVectorPathRaw(points, 0);
  let total = 0;
  for (let index = 1; index <= divisions; index += 1) {
    const t = index / divisions;
    const point = sampleVectorPathRaw(points, t);
    total += Math.hypot(...point.map((entry, axis) => entry - previous[axis]));
    entries.push({ t, length: total });
    previous = point;
  }
  const table = { entries, total };
  arcLengthCache.set(points, table);
  return table;
};

const parameterForArcProgress = (points, value) => {
  if (points.length <= 2) return clamp01(value);
  const { entries, total } = arcLengthTableFor(points);
  if (total <= 1e-7) return 0;
  const target = total * clamp01(value);
  let low = 0;
  let high = entries.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle].length < target) low = middle;
    else high = middle;
  }
  const before = entries[low];
  const after = entries[high];
  const span = Math.max(1e-7, after.length - before.length);
  return before.t + (after.t - before.t) * ((target - before.length) / span);
};

export const sampleVectorPath = (points, value) => {
  if (!Array.isArray(points) || points.length === 0) return [0, 0, 0];
  if (points.length === 1) return [...points[0]];
  return sampleVectorPathRaw(points, parameterForArcProgress(points, value));
};

export const tangentForVectorPath = (points, value) => {
  const epsilon = 0.0025;
  const before = sampleVectorPath(points, clamp01(value - epsilon));
  const after = sampleVectorPath(points, clamp01(value + epsilon));
  const tangent = after.map((entry, axis) => entry - before[axis]);
  const length = Math.hypot(...tangent);
  return length > 1e-7 ? tangent.map((entry) => entry / length) : [0, 0, -1];
};

export const yawForDirection = (direction) => Math.atan2(-direction[0], -direction[2]) * 180 / Math.PI;

export const shortestAngleDelta = (from, to) => ((to - from + 540) % 360) - 180;

export const lerpAngleDegrees = (from, to, value) => from + shortestAngleDelta(from, to) * clamp01(value);
