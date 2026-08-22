const DEFAULT_POSITION = Object.freeze([8, 5, 8]);
const DEFAULT_LOOK_AT = Object.freeze([0, 1, 0]);

const cloneVector = (value, fallback) => (
  Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((entry, index) => {
      const number = Number(entry);
      return Number.isFinite(number) ? number : fallback[index];
    })
    : [...fallback]
);

export const cameraClipsFor = (timeline) => (timeline?.clips ?? [])
  .filter((clip) => clip.type === "camera")
  .sort((left, right) => left.start - right.start || left.line - right.line);

export function nearestCameraClip(timeline, rawTime = 0) {
  const clips = cameraClipsFor(timeline);
  if (!clips.length) return null;
  const time = Math.max(0, Number(rawTime) || 0);
  const active = clips.filter((clip) => time >= clip.start && time <= clip.start + clip.duration);
  if (active.length) return active.at(-1);
  return clips.reduce((nearest, clip) => (
    Math.abs(clip.start - time) < Math.abs(nearest.start - time) ? clip : nearest
  ));
}

export function cameraPoseForEndpoint(clip, endpoint = "from") {
  const isStart = endpoint !== "to";
  const positionPath = Array.isArray(clip?.positionPath) ? clip.positionPath : [];
  const lookAtPath = Array.isArray(clip?.lookAtPath) ? clip.lookAtPath : [];
  const positionFromPath = positionPath.length >= 3
    ? positionPath[isStart ? 0 : positionPath.length - 1]
    : null;
  const lookAtFromPath = lookAtPath.length >= 3
    ? lookAtPath[isStart ? 0 : lookAtPath.length - 1]
    : null;
  const ownPosition = isStart ? clip?.fromPosition : clip?.toPosition;
  const otherPosition = isStart ? clip?.toPosition : clip?.fromPosition;
  const ownLookAt = isStart ? clip?.fromLookAt : clip?.toLookAt;
  const otherLookAt = isStart ? clip?.toLookAt : clip?.fromLookAt;

  return {
    position: cloneVector(positionFromPath ?? ownPosition ?? otherPosition, DEFAULT_POSITION),
    lookAt: cloneVector(lookAtFromPath ?? ownLookAt ?? otherLookAt, DEFAULT_LOOK_AT),
    fov: Number(isStart ? clip?.fromFov : clip?.toFov) || 42,
  };
}

export function parseCameraPath(value, label = "相机路径") {
  const source = String(value ?? "").trim();
  if (!source) return [];
  const points = source.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    const values = line
      .trim()
      .replace(/^[\[(（]\s*/, "")
      .replace(/\s*[\])）]$/, "")
      .split(/[,，、;\s]+/)
      .filter(Boolean)
      .map(Number);
    if (values.length !== 3 || values.some((entry) => !Number.isFinite(entry))) {
      throw new Error(`${label}第 ${index + 1} 行必须是三个数字，例如 1.2, 2, -3`);
    }
    return values;
  });
  if (points.length > 0 && points.length < 3) {
    throw new Error(`${label}需要至少 3 个控制点；留空则使用直线运镜`);
  }
  if (points.length > 16) throw new Error(`${label}最多支持 16 个控制点`);
  return points;
}

export const formatCameraPath = (path) => (Array.isArray(path)
  ? path.map((point) => cloneVector(point, [0, 0, 0]).map((value) => Number(value.toFixed(4))).join(", ")).join("\n")
  : "");

export function synchronizePathEndpoints(path, from, to) {
  if (!Array.isArray(path) || path.length < 3) return [];
  const synchronized = path.map((point) => cloneVector(point, [0, 0, 0]));
  synchronized[0] = cloneVector(from, synchronized[0]);
  synchronized[synchronized.length - 1] = cloneVector(to, synchronized.at(-1));
  return synchronized;
}

export function createThreePointPath(from, to) {
  const start = cloneVector(from, DEFAULT_POSITION);
  const end = cloneVector(to, start);
  return [
    start,
    start.map((value, index) => (value + end[index]) / 2),
    end,
  ];
}
