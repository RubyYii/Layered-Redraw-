const distance2d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const cellKey = (x, z) => `${x}:${z}`;
const vertexKey = ([x, , z]) => `${x.toFixed(6)}:${z.toFixed(6)}`;
const edgeKey = (left, right) => [vertexKey(left), vertexKey(right)].sort().join("|");

const binaryHeap = () => {
  const entries = [];
  const push = (entry) => {
    entries.push(entry);
    let index = entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (entries[parent].score <= entry.score) break;
      entries[index] = entries[parent];
      index = parent;
    }
    entries[index] = entry;
  };
  const pop = () => {
    if (!entries.length) return null;
    const first = entries[0];
    const last = entries.pop();
    if (entries.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= entries.length) break;
        const child = right < entries.length && entries[right].score < entries[left].score ? right : left;
        if (entries[child].score >= last.score) break;
        entries[index] = entries[child];
        index = child;
      }
      entries[index] = last;
    }
    return first;
  };
  return { push, pop, get size() { return entries.length; } };
};

const collectObstacleBounds = (project, radius, ignoreIds) => (project?.objects ?? [])
  .filter((object) => (
    object.visible
    && !ignoreIds.has(object.id)
    && object.type !== "plane"
    && object.entity?.physics?.bodyType === "static"
    && Math.abs(object.dimensions?.[1] * object.scale?.[1]) >= 0.3
  ))
  .map((object) => {
    const halfX = Math.abs(object.dimensions[0] * object.scale[0]) / 2 + radius;
    const halfZ = Math.abs(object.dimensions[2] * object.scale[2]) / 2 + radius;
    return {
      id: object.id,
      minX: object.position[0] - halfX,
      maxX: object.position[0] + halfX,
      minZ: object.position[2] - halfZ,
      maxZ: object.position[2] + halfZ,
    };
  });

const cellTouchesObstacle = (x, z, originX, originZ, cellSize, obstacles) => {
  const minX = originX + x * cellSize;
  const minZ = originZ + z * cellSize;
  const maxX = minX + cellSize;
  const maxZ = minZ + cellSize;
  return obstacles.some((obstacle) => (
    maxX >= obstacle.minX && minX <= obstacle.maxX
    && maxZ >= obstacle.minZ && minZ <= obstacle.maxZ
  ));
};

const triangleCentroid = (vertices) => [
  vertices.reduce((sum, point) => sum + point[0], 0) / 3,
  vertices.reduce((sum, point) => sum + point[1], 0) / 3,
  vertices.reduce((sum, point) => sum + point[2], 0) / 3,
];

export function buildNavigationMesh(project, start, goal, {
  cellSize = 0.5,
  actorRadius = 0.35,
  margin = 2,
  maxCells = 120_000,
  ignoreIds = [],
} = {}) {
  const safeCell = Math.min(2, Math.max(0.15, Number(cellSize) || 0.5));
  const ignored = new Set(ignoreIds);
  const obstacles = collectObstacleBounds(project, Math.max(0, Number(actorRadius) || 0), ignored);
  const extents = obstacles.flatMap((item) => [[item.minX, item.minZ], [item.maxX, item.maxZ]]);
  const originX = Math.min(start[0], goal[0], ...extents.map((item) => item[0])) - margin;
  const originZ = Math.min(start[2], goal[2], ...extents.map((item) => item[1])) - margin;
  const maxX = Math.max(start[0], goal[0], ...extents.map((item) => item[0])) + margin;
  const maxZ = Math.max(start[2], goal[2], ...extents.map((item) => item[1])) + margin;
  const width = Math.max(1, Math.ceil((maxX - originX) / safeCell));
  const depth = Math.max(1, Math.ceil((maxZ - originZ) / safeCell));
  if (width * depth > maxCells) {
    return { ok: false, code: "navigation_mesh_too_large", triangles: [], portals: [], obstacles };
  }

  const pointToCell = (point) => [
    Math.max(0, Math.min(width - 1, Math.floor((point[0] - originX) / safeCell))),
    Math.max(0, Math.min(depth - 1, Math.floor((point[2] - originZ) / safeCell))),
  ];
  const startCell = pointToCell(start);
  const goalCell = pointToCell(goal);
  const forcedWalkable = new Set([cellKey(...startCell), cellKey(...goalCell)]);
  const triangles = [];
  const byId = new Map();
  const edgeOwners = new Map();
  const y = Number(start[1]) || 0;

  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!forcedWalkable.has(cellKey(x, z))
        && cellTouchesObstacle(x, z, originX, originZ, safeCell, obstacles)) continue;
      const x0 = originX + x * safeCell;
      const z0 = originZ + z * safeCell;
      const x1 = x0 + safeCell;
      const z1 = z0 + safeCell;
      const v00 = [x0, y, z0];
      const v10 = [x1, y, z0];
      const v11 = [x1, y, z1];
      const v01 = [x0, y, z1];
      for (const [side, vertices] of [[0, [v00, v10, v11]], [1, [v00, v11, v01]]]) {
        const id = `${x}:${z}:${side}`;
        const triangle = { id, cell: [x, z], vertices, centroid: triangleCentroid(vertices), neighbours: [] };
        triangles.push(triangle);
        byId.set(id, triangle);
        for (let edge = 0; edge < 3; edge += 1) {
          const points = [vertices[edge], vertices[(edge + 1) % 3]];
          const key = edgeKey(...points);
          const owners = edgeOwners.get(key) ?? [];
          owners.push({ id, points });
          edgeOwners.set(key, owners);
        }
      }
    }
  }

  const portals = [];
  for (const [key, owners] of edgeOwners) {
    if (owners.length !== 2) continue;
    const [left, right] = owners;
    byId.get(left.id).neighbours.push(right.id);
    byId.get(right.id).neighbours.push(left.id);
    portals.push({ id: key, triangles: [left.id, right.id], points: left.points });
  }
  const localX = (start[0] - (originX + startCell[0] * safeCell)) / safeCell;
  const localZ = (start[2] - (originZ + startCell[1] * safeCell)) / safeCell;
  const goalLocalX = (goal[0] - (originX + goalCell[0] * safeCell)) / safeCell;
  const goalLocalZ = (goal[2] - (originZ + goalCell[1] * safeCell)) / safeCell;
  const startTriangleId = `${startCell[0]}:${startCell[1]}:${localX >= localZ ? 0 : 1}`;
  const goalTriangleId = `${goalCell[0]}:${goalCell[1]}:${goalLocalX >= goalLocalZ ? 0 : 1}`;
  return {
    ok: true,
    backend: "triangulated-raster-navmesh",
    cellSize: safeCell,
    bounds: { originX, originZ, width, depth },
    obstacles,
    triangles,
    portals,
    startTriangleId,
    goalTriangleId,
  };
}

const segmentHitsObstacle = (from, to, obstacle) => {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  let lower = 0;
  let upper = 1;
  for (const [origin, delta, min, max] of [
    [from[0], dx, obstacle.minX, obstacle.maxX],
    [from[2], dz, obstacle.minZ, obstacle.maxZ],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin >= min && origin <= max) return true;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    lower = Math.max(lower, Math.min(first, second));
    upper = Math.min(upper, Math.max(first, second));
    if (lower > upper) return false;
  }
  return upper >= 0 && lower <= 1;
};

const simplifyByVisibility = (path, obstacles) => {
  if (path.length <= 2) return path;
  const simplified = [path[0]];
  let cursor = 0;
  while (cursor < path.length - 1) {
    let next = path.length - 1;
    while (next > cursor + 1 && obstacles.some((obstacle) => segmentHitsObstacle(path[cursor], path[next], obstacle))) {
      next -= 1;
    }
    simplified.push(path[next]);
    cursor = next;
  }
  return simplified;
};

export function planNavmeshPath(project, start, goal, options = {}) {
  const mesh = buildNavigationMesh(project, start, goal, options);
  if (!mesh.ok) return { ...mesh, path: [] };
  const byId = new Map(mesh.triangles.map((triangle) => [triangle.id, triangle]));
  const portalByPair = new Map();
  for (const portal of mesh.portals) {
    const [left, right] = portal.triangles;
    portalByPair.set([left, right].sort().join("|"), portal);
  }
  const startTriangle = byId.get(mesh.startTriangleId);
  const goalTriangle = byId.get(mesh.goalTriangleId);
  if (!startTriangle || !goalTriangle) return { ok: false, code: "navigation_mesh_endpoint_missing", path: [], backend: mesh.backend };
  if (!mesh.obstacles.some((obstacle) => segmentHitsObstacle(start, goal, obstacle))) {
    return { ok: true, backend: mesh.backend, path: [[...start], [...goal]], distance: distance2d(start, goal), visited: 1, triangleCount: mesh.triangles.length };
  }

  const open = binaryHeap();
  const costs = new Map([[startTriangle.id, 0]]);
  const cameFrom = new Map();
  open.push({ id: startTriangle.id, score: distance2d(startTriangle.centroid, goal) });
  let visited = 0;
  const maxVisited = Math.max(1, Number(options.maxVisited) || 40_000);
  while (open.size && visited < maxVisited) {
    const current = open.pop();
    visited += 1;
    if (current.id === goalTriangle.id) {
      const corridor = [goalTriangle.id];
      let cursor = goalTriangle.id;
      while (cursor !== startTriangle.id) {
        cursor = cameFrom.get(cursor);
        if (!cursor) break;
        corridor.push(cursor);
      }
      corridor.reverse();
      const points = [[...start]];
      for (let index = 1; index < corridor.length; index += 1) {
        const portal = portalByPair.get([corridor[index - 1], corridor[index]].sort().join("|"));
        if (!portal) continue;
        points.push([
          (portal.points[0][0] + portal.points[1][0]) / 2,
          start[1],
          (portal.points[0][2] + portal.points[1][2]) / 2,
        ]);
      }
      points.push([...goal]);
      const path = simplifyByVisibility(points, mesh.obstacles);
      const distance = path.slice(1).reduce((sum, point, index) => sum + distance2d(path[index], point), 0);
      return { ok: true, backend: mesh.backend, path, distance, visited, triangleCount: mesh.triangles.length, corridor };
    }
    const triangle = byId.get(current.id);
    for (const neighbourId of triangle.neighbours) {
      const neighbour = byId.get(neighbourId);
      const cost = costs.get(current.id) + distance2d(triangle.centroid, neighbour.centroid);
      if (cost >= (costs.get(neighbourId) ?? Infinity)) continue;
      costs.set(neighbourId, cost);
      cameFrom.set(neighbourId, current.id);
      open.push({ id: neighbourId, score: cost + distance2d(neighbour.centroid, goal) });
    }
  }
  return { ok: false, code: "navigation_blocked", path: [], visited, backend: mesh.backend, triangleCount: mesh.triangles.length };
}
