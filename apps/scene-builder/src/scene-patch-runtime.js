import { createSceneObject, normalizeProject, serializeProject } from "./model.js";
import { resolveAssetForSlot, validateAssetCatalog, validateSceneSlots } from "./scene-governance.js";

const LOCKED_STATES = new Set(["SOURCE_LOCKED", "EVIDENCE_LOCKED", "STAGE_LOCKED"]);
const MUTABLE_STATES = new Set(["PROPOSED", "AUTHORISED"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const SHA_256 = /^[0-9a-f]{64}$/;
const FORBIDDEN_CONTROL_FIELDS = new Set(["position", "rotation", "scale", "path", "url", "code", "script"]);
const PATCH_FIELDS = new Set([
  "schemaVersion",
  "patchId",
  "caseAction",
  "provider",
  "reason",
  "preconditionHash",
  "expectedChangedObjectIds",
  "forbiddenChangedObjectIds",
  "operations",
]);

export const SCENE_PATCH_KINDS = Object.freeze([
  "add",
  "replace",
  "move_between_slots",
  "remove",
]);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};

async function sha256Text(value) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, "0")).join("");
}

export async function hashProject(project) {
  return sha256Text(serializeProject(project));
}

export async function hashGovernedObjects(project, objectIds) {
  const ids = [...new Set(objectIds)].sort();
  const objectsById = new Map(project.objects.map((object) => [object.id, object]));
  const objects = ids.map((id) => {
    const object = objectsById.get(id);
    if (!object) throw new Error(`Cannot hash missing governed object: ${id}`);
    return object;
  });
  return sha256Text(JSON.stringify(canonicalize(objects)));
}

function requireIdentifier(value, label) {
  const result = String(value ?? "").trim();
  if (!IDENTIFIER.test(result)) throw new Error(`${label} must be a stable identifier`);
  return result;
}

function requireIdSet(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const result = value.map((id) => requireIdentifier(id, label));
  if (new Set(result).size !== result.length) throw new Error(`${label} must contain unique IDs`);
  return result.sort();
}

function assertExactSet(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    throw new Error(`${label} must exactly match the resolved object set`);
  }
}

function assertNoDirectSceneControl(value, path = "patch") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_CONTROL_FIELDS.has(key)) {
      throw new Error(`Direct scene control is forbidden at ${path}.${key}`);
    }
    assertNoDirectSceneControl(child, `${path}.${key}`);
  }
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains undeclared field: ${key}`);
  }
}

function descendantsOf(project, rootId) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of project.objects) {
      if (!result.has(object.id) && result.has(object.parentId)) {
        result.add(object.id);
        changed = true;
      }
    }
  }
  return [...result];
}

function requireMutableRoot(project, objectId) {
  const object = project.objects.find((candidate) => candidate.id === objectId);
  if (!object) throw new Error(`Unknown mutable object: ${objectId}`);
  const state = object.governance?.state ?? "WITHHELD";
  if (!MUTABLE_STATES.has(state)) throw new Error(`${state} object cannot be changed by ScenePatch: ${objectId}`);
  if (object.parentId) throw new Error(`ScenePatch target must be a bundle root: ${objectId}`);
  const affectedIds = descendantsOf(project, objectId);
  for (const id of affectedIds) {
    const candidate = project.objects.find((objectEntry) => objectEntry.id === id);
    const candidateState = candidate?.governance?.state ?? "WITHHELD";
    if (!MUTABLE_STATES.has(candidateState)) {
      throw new Error(`${candidateState} descendant cannot be changed by ScenePatch: ${id}`);
    }
  }
  return { object, affectedIds };
}

function ensureSlotAvailable(project, slotId, excludedRootId = null) {
  const occupant = project.objects.find((object) => (
    !object.parentId
    && object.id !== excludedRootId
    && MUTABLE_STATES.has(object.governance?.state)
    && object.governance?.slotId === slotId
  ));
  if (occupant) throw new Error(`Scene slot is already occupied: ${slotId}`);
}

function bundleObjectIds(asset) {
  return [asset.objectId, ...asset.bundle.children.map((child) => child.id)];
}

function resolveOperation({ project, catalog, slots, operation, mode }) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error("ScenePatch operation must be an object");
  }
  if (!SCENE_PATCH_KINDS.includes(operation.kind)) throw new Error(`Unsupported ScenePatch kind: ${operation.kind}`);

  if (operation.kind === "add") {
    assertAllowedKeys(operation, new Set(["kind", "assetId", "slotId"]), "add operation");
    const resolved = resolveAssetForSlot(catalog, slots, operation.assetId, operation.slotId, mode);
    ensureSlotAvailable(project, resolved.slot.id);
    for (const id of bundleObjectIds(resolved.asset)) {
      if (project.objects.some((object) => object.id === id)) throw new Error(`ScenePatch add ID already exists: ${id}`);
    }
    return { kind: operation.kind, ...resolved };
  }

  const objectId = requireIdentifier(operation.objectId, `${operation.kind} objectId`);
  const { object, affectedIds } = requireMutableRoot(project, objectId);

  if (operation.kind === "replace") {
    assertAllowedKeys(operation, new Set(["kind", "objectId", "assetId", "slotId"]), "replace operation");
    const slotId = operation.slotId ?? object.governance?.slotId;
    const resolved = resolveAssetForSlot(catalog, slots, operation.assetId, slotId, mode);
    ensureSlotAvailable(project, resolved.slot.id, objectId);
    const removed = new Set(affectedIds);
    for (const id of bundleObjectIds(resolved.asset)) {
      if (!removed.has(id) && project.objects.some((entry) => entry.id === id)) {
        throw new Error(`ScenePatch replacement ID already exists: ${id}`);
      }
    }
    return { kind: operation.kind, objectId, affectedIds, ...resolved };
  }

  if (operation.kind === "move_between_slots") {
    assertAllowedKeys(operation, new Set(["kind", "objectId", "fromSlotId", "slotId"]), "move operation");
    if (operation.fromSlotId !== undefined && operation.fromSlotId !== object.governance?.slotId) {
      throw new Error("move_between_slots source slot is stale");
    }
    const assetId = requireIdentifier(object.governance?.assetId, "mutable object assetId");
    const resolved = resolveAssetForSlot(catalog, slots, assetId, operation.slotId, mode);
    ensureSlotAvailable(project, resolved.slot.id, objectId);
    return {
      kind: operation.kind,
      objectId,
      affectedIds,
      fromSlotId: object.governance.slotId,
      asset: resolved.asset,
      slot: resolved.slot,
    };
  }

  assertAllowedKeys(operation, new Set(["kind", "objectId"]), "remove operation");
  return { kind: operation.kind, objectId, affectedIds };
}

function createBundleObjects(asset, slot) {
  const governance = {
    state: "AUTHORISED",
    sourceId: "CP02-PROXY-AUTHORED",
    slotId: slot.id,
    assetId: asset.assetId,
  };
  const root = createSceneObject("group", {
    id: asset.objectId,
    name: `AUTHORISED · ${asset.semanticClass}`,
    position: slot.position,
    rotation: slot.rotation,
    locked: true,
    governance,
  });
  const children = asset.bundle.children.map((template) => createSceneObject(template.type, {
    ...template,
    parentId: root.id,
    locked: true,
    governance,
  }));
  return [root, ...children];
}

function applyResolvedOperation(project, operation) {
  if (operation.kind === "add") {
    project.objects.push(...createBundleObjects(operation.asset, operation.slot));
  } else if (operation.kind === "replace") {
    const removed = new Set(operation.affectedIds);
    project.objects = project.objects.filter((object) => !removed.has(object.id));
    project.objects.push(...createBundleObjects(operation.asset, operation.slot));
  } else if (operation.kind === "move_between_slots") {
    const object = project.objects.find((candidate) => candidate.id === operation.objectId);
    object.position = [...operation.slot.position];
    object.rotation = [...operation.slot.rotation];
    const affected = new Set(operation.affectedIds);
    for (const candidate of project.objects) {
      if (affected.has(candidate.id)) {
        candidate.governance = { ...candidate.governance, slotId: operation.slot.id };
      }
    }
  } else {
    const removed = new Set(operation.affectedIds);
    project.objects = project.objects.filter((object) => !removed.has(object.id));
  }
  project.director.timeline.compiledScript = "";
}

function changedObjectIds(before, after) {
  const beforeById = new Map(before.objects.map((object) => [object.id, object]));
  const afterById = new Map(after.objects.map((object) => [object.id, object]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  return [...ids].filter((id) => (
    JSON.stringify(canonicalize(beforeById.get(id))) !== JSON.stringify(canonicalize(afterById.get(id)))
  )).sort();
}

function publicOperation(operation) {
  if (operation.kind === "add") {
    return { kind: operation.kind, assetId: operation.asset.assetId, slotId: operation.slot.id };
  }
  if (operation.kind === "replace") {
    return {
      kind: operation.kind,
      objectId: operation.objectId,
      assetId: operation.asset.assetId,
      slotId: operation.slot.id,
    };
  }
  if (operation.kind === "move_between_slots") {
    return {
      kind: operation.kind,
      objectId: operation.objectId,
      fromSlotId: operation.fromSlotId,
      slotId: operation.slot.id,
    };
  }
  return { kind: operation.kind, objectId: operation.objectId };
}

export async function validateScenePatch({ project, catalog, slots, patch, mode }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("ScenePatch must be an object");
  assertAllowedKeys(patch, PATCH_FIELDS, "ScenePatch");
  assertNoDirectSceneControl(patch);
  if (patch.schemaVersion !== 1) throw new Error("Unsupported ScenePatch schema version");
  const patchId = requireIdentifier(patch.patchId, "ScenePatch patchId");
  if (patch.caseAction !== "Reframe") throw new Error("CP02 ScenePatch must use the Reframe case action");
  const provider = requireIdentifier(patch.provider, "ScenePatch provider");
  const preconditionHash = String(patch.preconditionHash ?? "").toLowerCase();
  if (!SHA_256.test(preconditionHash)) throw new Error("ScenePatch precondition hash must be SHA-256");

  const normalizedProject = normalizeProject(project);
  const actualPreconditionHash = await hashProject(normalizedProject);
  if (preconditionHash !== actualPreconditionHash) throw new Error("ScenePatch precondition hash is stale");
  const expectedChangedObjectIds = requireIdSet(patch.expectedChangedObjectIds, "expectedChangedObjectIds");
  const forbiddenChangedObjectIds = requireIdSet(patch.forbiddenChangedObjectIds, "forbiddenChangedObjectIds");
  const protectedObjectIds = normalizedProject.objects
    .filter((object) => LOCKED_STATES.has(object.governance?.state))
    .map((object) => object.id)
    .sort();
  assertExactSet(forbiddenChangedObjectIds, protectedObjectIds, "forbiddenChangedObjectIds");
  if (!Array.isArray(patch.operations) || patch.operations.length === 0 || patch.operations.length > 16) {
    throw new Error("ScenePatch must contain 1 to 16 operations");
  }

  const normalizedCatalog = validateAssetCatalog(catalog);
  const normalizedSlots = validateSceneSlots(slots);
  const simulation = structuredClone(normalizedProject);
  const operations = [];
  for (const operation of patch.operations) {
    const resolved = resolveOperation({
      project: simulation,
      catalog: normalizedCatalog,
      slots: normalizedSlots,
      operation,
      mode,
    });
    applyResolvedOperation(simulation, resolved);
    operations.push(resolved);
  }
  const normalizedResult = normalizeProject(simulation);
  const actualChangedObjectIds = changedObjectIds(normalizedProject, normalizedResult);
  assertExactSet(expectedChangedObjectIds, actualChangedObjectIds, "expectedChangedObjectIds");
  const protectedPreconditionHash = await hashGovernedObjects(normalizedProject, protectedObjectIds);
  const protectedResultHash = await hashGovernedObjects(normalizedResult, protectedObjectIds);
  if (protectedPreconditionHash !== protectedResultHash) {
    throw new Error("ScenePatch changed a protected governed object");
  }

  return {
    schemaVersion: 1,
    patchId,
    caseAction: "Reframe",
    provider,
    reason: String(patch.reason ?? "").trim().slice(0, 500),
    mode,
    preconditionHash,
    expectedChangedObjectIds,
    forbiddenChangedObjectIds,
    protectedObjectIds,
    protectedPreconditionHash,
    operations,
    publicOperations: operations.map(publicOperation),
  };
}

async function withheldReceipt(project, patch, guardianDecision, reasonCode, reason) {
  const projectHash = await hashProject(project);
  const rawPatchId = String(patch?.patchId ?? "CP02-WITHHELD").trim();
  const patchId = IDENTIFIER.test(rawPatchId) ? rawPatchId : "CP02-WITHHELD";
  return {
    schemaVersion: 1,
    receiptId: `${patchId}:WITHHELD`,
    patchId,
    caseAction: "Reframe",
    guardianDecision: String(guardianDecision ?? "REJECT"),
    outcome: "WITHHELD",
    reasonCode,
    reason: String(reason ?? "").slice(0, 500),
    preconditionHash: projectHash,
    resultHash: projectHash,
    expectedChangedObjectIds: [],
    createdAt: new Date().toISOString(),
  };
}

export async function applyScenePatch({
  store,
  catalog,
  slots,
  patch,
  guardianDecision,
  mode,
}) {
  const before = store.getState().project;
  if (guardianDecision !== "ALLOW") {
    return withheldReceipt(before, patch, guardianDecision, "GUARDIAN_WITHHELD", "Guardian did not authorise this patch.");
  }

  let validated;
  try {
    validated = await validateScenePatch({ project: before, catalog, slots, patch, mode });
  } catch (error) {
    return withheldReceipt(before, patch, guardianDecision, "SCENE_PATCH_REJECTED", error.message);
  }

  const historyBefore = store.historyIndex;
  const committed = store.mutate((draft) => {
    for (const operation of validated.operations) applyResolvedOperation(draft, operation);
  });
  if (!committed || store.historyIndex !== historyBefore + 1) {
    throw new Error("ScenePatch did not create exactly one history checkpoint");
  }

  const result = store.getState().project;
  const actualChangedObjectIds = changedObjectIds(before, result);
  const protectedResultHash = await hashGovernedObjects(result, validated.protectedObjectIds);
  try {
    assertExactSet(actualChangedObjectIds, validated.expectedChangedObjectIds, "post-apply changed objects");
    if (protectedResultHash !== validated.protectedPreconditionHash) {
      throw new Error("Post-apply protected object hash mismatch");
    }
  } catch (error) {
    store.undo();
    throw error;
  }

  const resultHash = await hashProject(result);
  return {
    schemaVersion: 1,
    receiptId: `${validated.patchId}:APPLIED:${resultHash.slice(0, 12)}`,
    patchId: validated.patchId,
    caseAction: validated.caseAction,
    provider: validated.provider,
    mode: validated.mode,
    guardianDecision: "ALLOW",
    outcome: "APPLIED",
    reason: validated.reason,
    preconditionHash: validated.preconditionHash,
    resultHash,
    expectedChangedObjectIds: [...validated.expectedChangedObjectIds],
    forbiddenChangedObjectIds: [...validated.forbiddenChangedObjectIds],
    protectedPreconditionHash: validated.protectedPreconditionHash,
    protectedResultHash,
    operations: structuredClone(validated.publicOperations),
    undoToken: `${validated.patchId}:${resultHash}`,
    historyIndexBefore: historyBefore,
    historyIndexAfter: store.historyIndex,
    createdAt: new Date().toISOString(),
  };
}

export async function undoScenePatch({ store, receipt }) {
  if (!receipt || receipt.outcome !== "APPLIED") throw new Error("Only an APPLIED ScenePatch receipt can be undone");
  const currentHash = await hashProject(store.getState().project);
  if (currentHash !== receipt.resultHash) throw new Error("Current project does not match the ScenePatch result hash");
  if (store.historyIndex !== receipt.historyIndexAfter) throw new Error("ScenePatch history position is stale");
  if (!store.undo()) throw new Error("ScenePatch undo history is unavailable");

  const restoredHash = await hashProject(store.getState().project);
  if (restoredHash !== receipt.preconditionHash) {
    store.redo();
    throw new Error("ScenePatch undo did not restore the precondition hash");
  }
  return {
    schemaVersion: 1,
    receiptId: `${receipt.patchId}:UNDONE:${restoredHash.slice(0, 12)}`,
    patchId: receipt.patchId,
    caseAction: receipt.caseAction,
    guardianDecision: receipt.guardianDecision,
    outcome: "UNDONE",
    undoOf: receipt.receiptId,
    preconditionHash: receipt.resultHash,
    resultHash: restoredHash,
    expectedChangedObjectIds: [...receipt.expectedChangedObjectIds],
    protectedPreconditionHash: receipt.protectedResultHash,
    protectedResultHash: receipt.protectedPreconditionHash,
    createdAt: new Date().toISOString(),
  };
}
