import { rotateLocalOffset } from "./interaction-runtime.js";

export const COLLISION_BACKEND = "collision-proxy-v1";

const EPSILON = 1e-7;
const MAX_ITERATIONS = 6;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const maximum = (values) => values.length ? Math.max(...values) : 0;

const shapeForObject = (source) => {
  if (source.type === "sphere") return "sphere";
  if (source.type === "cylinder" || source.type === "cone") return "cylinder";
  return "box";
};

const dimensionsFor = (source, state, declared) => {
  const dimensions = Array.isArray(declared) ? declared : source.dimensions;
  const scale = Array.isArray(state.scale) ? state.scale : source.scale;
  return [0, 1, 2].map((axis) => Math.max(
    0.001,
    Math.abs(finite(dimensions?.[axis], 1) * finite(scale?.[axis], 1)),
  ));
};

const rotatedBoxHalfExtents = (dimensions, rotation) => {
  const yaw = finite(rotation?.[1]) * Math.PI / 180;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const halfWidth = dimensions[0] / 2;
  const halfDepth = dimensions[2] / 2;
  return [
    halfWidth * cos + halfDepth * sin,
    dimensions[1] / 2,
    halfWidth * sin + halfDepth * cos,
  ];
};

export function collisionProxyFor(source, state) {
  if (!source || !state || source.parentId || state.visible === false) return null;
  const declared = source.interactionSpec?.collisionProxy ?? null;
  if (declared?.enabled === false) return null;
  if (!declared && (source.type === "group" || source.type === "plane")) return null;

  const shape = declared?.shape ?? shapeForObject(source);
  const dimensions = dimensionsFor(source, state, declared?.dimensions);
  const localOffset = declared?.offset ?? [0, 0, 0];
  const rotatedOffset = rotateLocalOffset(localOffset, state.rotation);
  const center = state.position.map((value, axis) => finite(value) + rotatedOffset[axis]);
  const halfExtents = shape === "box"
    ? rotatedBoxHalfExtents(dimensions, state.rotation)
    : [Math.max(dimensions[0], dimensions[2]) / 2, dimensions[1] / 2, Math.max(dimensions[0], dimensions[2]) / 2];

  return {
    id: source.id,
    role: source.entity?.role ?? "prop",
    bodyType: source.entity?.physics?.bodyType ?? "kinematic",
    shape,
    center,
    dimensions,
    halfExtents,
    radius: Math.max(dimensions[0], dimensions[2]) / 2 + finite(declared?.margin, 0),
    margin: finite(declared?.margin, 0),
    support: declared?.support === true || Boolean(source.interactionSpec?.anchors?.surface),
    minY: center[1] - dimensions[1] / 2,
    maxY: center[1] + dimensions[1] / 2,
    minX: center[0] - halfExtents[0] - finite(declared?.margin, 0),
    maxX: center[0] + halfExtents[0] + finite(declared?.margin, 0),
    minZ: center[2] - halfExtents[2] - finite(declared?.margin, 0),
    maxZ: center[2] + halfExtents[2] + finite(declared?.margin, 0),
  };
}

const verticalOverlap = (left, right) => Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY);

const circleBoxPenetration = (circle, box) => {
  if (verticalOverlap(circle, box) <= EPSILON) return null;
  const closestX = clamp(circle.center[0], box.minX, box.maxX);
  const closestZ = clamp(circle.center[2], box.minZ, box.maxZ);
  const dx = circle.center[0] - closestX;
  const dz = circle.center[2] - closestZ;
  const distance = Math.hypot(dx, dz);

  if (distance > EPSILON) {
    const penetration = circle.radius - distance;
    if (penetration <= EPSILON) return null;
    return {
      penetration,
      correction: [dx / distance * penetration, 0, dz / distance * penetration],
    };
  }

  const candidates = [
    [box.minX - circle.radius - circle.center[0], 0, 0],
    [box.maxX + circle.radius - circle.center[0], 0, 0],
    [0, 0, box.minZ - circle.radius - circle.center[2]],
    [0, 0, box.maxZ + circle.radius - circle.center[2]],
  ];
  const correction = candidates.reduce((best, candidate) => (
    Math.hypot(candidate[0], candidate[2]) < Math.hypot(best[0], best[2]) ? candidate : best
  ));
  return { penetration: Math.hypot(correction[0], correction[2]), correction };
};

const circleCirclePenetration = (left, right) => {
  if (verticalOverlap(left, right) <= EPSILON) return null;
  const dx = left.center[0] - right.center[0];
  const dz = left.center[2] - right.center[2];
  const distance = Math.hypot(dx, dz);
  const penetration = left.radius + right.radius - distance;
  if (penetration <= EPSILON) return null;
  const direction = distance > EPSILON
    ? [dx / distance, dz / distance]
    : String(left.id).localeCompare(String(right.id)) <= 0 ? [-1, 0] : [1, 0];
  return { penetration, direction };
};

const propBoxPenetration = (prop, box) => {
  const overlapX = Math.min(prop.maxX, box.maxX) - Math.max(prop.minX, box.minX);
  const overlapY = verticalOverlap(prop, box);
  const overlapZ = Math.min(prop.maxZ, box.maxZ) - Math.max(prop.minZ, box.minZ);
  if (overlapX <= EPSILON || overlapY <= EPSILON || overlapZ <= EPSILON) return null;

  if (box.support && prop.center[1] >= box.center[1] && prop.minY >= box.center[1] - EPSILON) {
    return { penetration: overlapY, correction: [0, overlapY, 0], mode: "support" };
  }

  if (overlapX <= overlapZ) {
    const direction = prop.center[0] < box.center[0] ? -1 : 1;
    return { penetration: overlapX, correction: [direction * overlapX, 0, 0], mode: "side" };
  }
  const direction = prop.center[2] < box.center[2] ? -1 : 1;
  return { penetration: overlapZ, correction: [0, 0, direction * overlapZ], mode: "side" };
};

const sourcesFor = (project, objects, predicate) => project.objects
  .filter((source) => predicate(source, objects[source.id]))
  .map((source) => ({ source, state: objects[source.id], proxy: collisionProxyFor(source, objects[source.id]) }))
  .filter((entry) => entry.proxy);

const characterEntries = (project, objects) => sourcesFor(project, objects, (source, state) => (
  Boolean(state)
  && !source.parentId
  && source.entity?.role === "character"
  && source.entity?.physics?.bodyType !== "static"
));

const propEntries = (project, objects) => sourcesFor(project, objects, (source, state) => (
  Boolean(state)
  && !source.parentId
  && source.entity?.role === "prop"
  && source.entity?.physics?.bodyType !== "static"
));

const staticEntries = (project, objects) => sourcesFor(project, objects, (source, state) => (
  Boolean(state)
  && !source.parentId
  && source.type !== "plane"
  && source.entity?.physics?.bodyType === "static"
));

const collisionKey = (kind, leftId, rightId) => `${kind}:${leftId}:${rightId}`;

const measureCharacterPenetrations = (project, objects) => {
  const characters = characterEntries(project, objects);
  const obstacles = staticEntries(project, objects);
  const hits = [];
  for (const character of characters) {
    for (const obstacle of obstacles) {
      const hit = circleBoxPenetration(character.proxy, obstacle.proxy);
      if (hit) hits.push({
        kind: "character-static",
        leftId: character.source.id,
        rightId: obstacle.source.id,
        ...hit,
      });
    }
  }
  for (let leftIndex = 0; leftIndex < characters.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < characters.length; rightIndex += 1) {
      const left = characters[leftIndex];
      const right = characters[rightIndex];
      const hit = circleCirclePenetration(left.proxy, right.proxy);
      if (hit) hits.push({
        kind: "character-character",
        leftId: left.source.id,
        rightId: right.source.id,
        ...hit,
      });
    }
  }
  return hits;
};

const measurePropPenetrations = (project, objects) => {
  const props = propEntries(project, objects);
  const obstacles = staticEntries(project, objects);
  const hits = [];
  for (const prop of props) {
    for (const obstacle of obstacles) {
      const hit = propBoxPenetration(prop.proxy, obstacle.proxy);
      if (hit) hits.push({
        kind: "prop-static",
        leftId: prop.source.id,
        rightId: obstacle.source.id,
        ...hit,
      });
    }
  }
  return hits;
};

const reportFor = (scope, initial, residual, contacts, iterations) => ({
  backend: COLLISION_BACKEND,
  scope,
  safe: maximum(residual.map((hit) => hit.penetration)) <= EPSILON,
  resolvedCount: contacts.size,
  maxPenetration: maximum(initial.map((hit) => hit.penetration)),
  residualPenetration: maximum(residual.map((hit) => hit.penetration)),
  iterations,
  contacts: [...contacts.values()],
});

export function resolveCharacterCollisions(project, objects) {
  const initial = measureCharacterPenetrations(project, objects);
  const contacts = new Map();
  let iterations = 0;

  for (; iterations < MAX_ITERATIONS; iterations += 1) {
    let corrected = false;
    const characters = characterEntries(project, objects);
    const obstacles = staticEntries(project, objects);
    for (const character of characters) {
      for (const obstacle of obstacles) {
        const hit = circleBoxPenetration(character.proxy, obstacle.proxy);
        if (!hit) continue;
        const state = objects[character.source.id];
        state.position = state.position.map((value, axis) => value + hit.correction[axis]);
        contacts.set(collisionKey("character-static", character.source.id, obstacle.source.id), {
          kind: "character-static",
          leftId: character.source.id,
          rightId: obstacle.source.id,
          penetration: hit.penetration,
        });
        character.proxy = collisionProxyFor(character.source, state);
        corrected = true;
      }
    }

    for (let leftIndex = 0; leftIndex < characters.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < characters.length; rightIndex += 1) {
        const left = characters[leftIndex];
        const right = characters[rightIndex];
        const hit = circleCirclePenetration(left.proxy, right.proxy);
        if (!hit) continue;
        const half = hit.penetration / 2;
        const leftState = objects[left.source.id];
        const rightState = objects[right.source.id];
        leftState.position[0] += hit.direction[0] * half;
        leftState.position[2] += hit.direction[1] * half;
        rightState.position[0] -= hit.direction[0] * half;
        rightState.position[2] -= hit.direction[1] * half;
        contacts.set(collisionKey("character-character", left.source.id, right.source.id), {
          kind: "character-character",
          leftId: left.source.id,
          rightId: right.source.id,
          penetration: hit.penetration,
        });
        left.proxy = collisionProxyFor(left.source, leftState);
        right.proxy = collisionProxyFor(right.source, rightState);
        corrected = true;
      }
    }
    if (!corrected) break;
  }

  return reportFor("characters", initial, measureCharacterPenetrations(project, objects), contacts, iterations);
}

export function resolvePropCollisions(project, objects) {
  const initial = measurePropPenetrations(project, objects);
  const contacts = new Map();
  let iterations = 0;

  for (; iterations < MAX_ITERATIONS; iterations += 1) {
    let corrected = false;
    const props = propEntries(project, objects);
    const obstacles = staticEntries(project, objects);
    for (const prop of props) {
      for (const obstacle of obstacles) {
        const hit = propBoxPenetration(prop.proxy, obstacle.proxy);
        if (!hit) continue;
        const state = objects[prop.source.id];
        state.position = state.position.map((value, axis) => value + hit.correction[axis]);
        contacts.set(collisionKey("prop-static", prop.source.id, obstacle.source.id), {
          kind: "prop-static",
          leftId: prop.source.id,
          rightId: obstacle.source.id,
          penetration: hit.penetration,
          mode: hit.mode,
        });
        prop.proxy = collisionProxyFor(prop.source, state);
        corrected = true;
      }
    }
    if (!corrected) break;
  }

  return reportFor("props", initial, measurePropPenetrations(project, objects), contacts, iterations);
}

export function mergeCollisionReports(...reports) {
  const valid = reports.filter(Boolean);
  return {
    backend: COLLISION_BACKEND,
    safe: valid.every((report) => report.safe),
    resolvedCount: valid.reduce((sum, report) => sum + report.resolvedCount, 0),
    maxPenetration: maximum(valid.map((report) => report.maxPenetration)),
    residualPenetration: maximum(valid.map((report) => report.residualPenetration)),
    iterations: valid.reduce((sum, report) => sum + report.iterations, 0),
    contacts: valid.flatMap((report) => report.contacts),
  };
}
