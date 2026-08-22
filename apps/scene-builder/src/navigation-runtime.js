const distance2d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const keyFor = (x, z) => `${x}:${z}`;

const binaryHeap = () => {
  const values = [];
  const push = (entry) => {
    values.push(entry);
    let index = values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (values[parent].score <= entry.score) break;
      values[index] = values[parent];
      index = parent;
    }
    values[index] = entry;
  };
  const pop = () => {
    if (!values.length) return null;
    const first = values[0];
    const last = values.pop();
    if (values.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= values.length) break;
        const child = right < values.length && values[right].score < values[left].score ? right : left;
        if (values[child].score >= last.score) break;
        values[index] = values[child];
        index = child;
      }
      values[index] = last;
    }
    return first;
  };
  return { push, pop, get size() { return values.length; } };
};

const obstacleBounds = (project, radius, ignoreIds) => project.objects
  .filter((object) => (
    object.visible
    && !ignoreIds.has(object.id)
    && object.type !== "plane"
    && object.entity?.physics?.bodyType === "static"
    && object.dimensions?.[1] * object.scale?.[1] >= 0.3
  ))
  .map((object) => {
    const halfX = Math.abs(object.dimensions[0] * object.scale[0]) / 2 + radius;
    const halfZ = Math.abs(object.dimensions[2] * object.scale[2]) / 2 + radius;
    return {
      minX: object.position[0] - halfX,
      maxX: object.position[0] + halfX,
      minZ: object.position[2] - halfZ,
      maxZ: object.position[2] + halfZ,
    };
  });

const simplifyPath = (path) => {
  if (path.length < 3) return path;
  const result = [path[0]];
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = result.at(-1);
    const current = path[index];
    const next = path[index + 1];
    const a = [Math.sign(current[0] - previous[0]), Math.sign(current[2] - previous[2])];
    const b = [Math.sign(next[0] - current[0]), Math.sign(next[2] - current[2])];
    if (a[0] !== b[0] || a[1] !== b[1]) result.push(current);
  }
  result.push(path.at(-1));
  return result;
};

export function planGroundPath(project, start, goal, {
  cellSize = 0.5,
  actorRadius = 0.35,
  margin = 2,
  maxVisited = 20_000,
  ignoreIds = [],
} = {}) {
  const safeCell = Math.min(2, Math.max(0.15, Number(cellSize) || 0.5));
  const ignored = new Set(ignoreIds);
  const obstacles = obstacleBounds(project, Math.max(0, actorRadius), ignored);
  const extents = obstacles.flatMap((item) => [[item.minX, item.minZ], [item.maxX, item.maxZ]]);
  const minX = Math.min(start[0], goal[0], ...extents.map((item) => item[0])) - margin;
  const maxX = Math.max(start[0], goal[0], ...extents.map((item) => item[0])) + margin;
  const minZ = Math.min(start[2], goal[2], ...extents.map((item) => item[1])) - margin;
  const maxZ = Math.max(start[2], goal[2], ...extents.map((item) => item[1])) + margin;
  const width = Math.ceil((maxX - minX) / safeCell) + 1;
  const depth = Math.ceil((maxZ - minZ) / safeCell) + 1;
  if (width * depth > 250_000) return { ok: false, code: "navigation_area_too_large", path: [] };

  const toGrid = (point) => [
    Math.max(0, Math.min(width - 1, Math.round((point[0] - minX) / safeCell))),
    Math.max(0, Math.min(depth - 1, Math.round((point[2] - minZ) / safeCell))),
  ];
  const toWorld = ([x, z], y = start[1]) => [minX + x * safeCell, y, minZ + z * safeCell];
  const startCell = toGrid(start);
  const goalCell = toGrid(goal);
  const startKey = keyFor(...startCell);
  const goalKey = keyFor(...goalCell);
  const blocked = new Set();
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const [worldX, , worldZ] = toWorld([x, z]);
      if (obstacles.some((item) => worldX >= item.minX && worldX <= item.maxX && worldZ >= item.minZ && worldZ <= item.maxZ)) {
        blocked.add(keyFor(x, z));
      }
    }
  }
  blocked.delete(startKey);
  blocked.delete(goalKey);

  const open = binaryHeap();
  const cameFrom = new Map();
  const costs = new Map([[startKey, 0]]);
  open.push({ cell: startCell, key: startKey, score: distance2d(start, goal) });
  const directions = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  let visited = 0;

  while (open.size && visited < maxVisited) {
    const current = open.pop();
    visited += 1;
    if (current.key === goalKey) {
      const cells = [goalCell];
      let cursor = goalKey;
      while (cursor !== startKey) {
        const previous = cameFrom.get(cursor);
        if (!previous) break;
        cells.push(previous.cell);
        cursor = previous.key;
      }
      cells.reverse();
      const path = simplifyPath(cells.map((cell) => toWorld(cell, start[1])));
      path[0] = [...start];
      path[path.length - 1] = [...goal];
      return { ok: true, path, visited, distance: path.slice(1).reduce((sum, point, index) => sum + distance2d(path[index], point), 0) };
    }

    const [x, z] = current.cell;
    for (const [dx, dz, stepCost] of directions) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= depth) continue;
      const nextKey = keyFor(nx, nz);
      if (blocked.has(nextKey)) continue;
      if (dx && dz && (blocked.has(keyFor(x + dx, z)) || blocked.has(keyFor(x, z + dz)))) continue;
      const nextCost = costs.get(current.key) + stepCost * safeCell;
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, nextCost);
      cameFrom.set(nextKey, { key: current.key, cell: current.cell });
      const world = toWorld([nx, nz]);
      open.push({ cell: [nx, nz], key: nextKey, score: nextCost + distance2d(world, goal) });
    }
  }
  return { ok: false, code: "navigation_blocked", path: [], visited };
}
