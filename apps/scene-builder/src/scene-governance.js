const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const OBJECT_TYPES = new Set(["box", "sphere", "cylinder", "cone", "plane", "group"]);

export const GOVERNANCE_STATES = Object.freeze([
  "SOURCE_LOCKED",
  "EVIDENCE_LOCKED",
  "STAGE_LOCKED",
  "PROPOSED",
  "AUTHORISED",
  "WITHHELD",
]);

export const SEMANTIC_CLASSES = Object.freeze(["table", "chair", "cup", "thermos"]);

export const ASSET_STATUSES = Object.freeze([
  "DISCOVERED_CANDIDATE",
  "PROJECT_AUTHORED_PROXY",
  "TECHNICALLY_VALIDATED",
  "ARTISTICALLY_APPROVED",
  "PUBLICLY_CLEARED",
  "REFERENCE_ONLY",
  "REJECTED",
]);

const cleanNullableIdentifier = (value) => {
  const result = String(value ?? "").trim().slice(0, 96);
  return result && IDENTIFIER.test(result) ? result : null;
};

const requireIdentifier = (value, label) => {
  const result = cleanNullableIdentifier(value);
  if (!result) throw new Error(`${label} must be a stable identifier`);
  return result;
};

const requireVector = (value, label, { positive = false } = {}) => {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain three numbers`);
  const result = value.map(Number);
  if (!result.every(Number.isFinite)) throw new Error(`${label} must contain finite numbers`);
  if (positive && result.some((entry) => entry <= 0)) throw new Error(`${label} must be positive`);
  return result;
};

export function normalizeGovernance(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    state: GOVERNANCE_STATES.includes(source.state) ? source.state : "WITHHELD",
    sourceId: cleanNullableIdentifier(source.sourceId),
    slotId: cleanNullableIdentifier(source.slotId),
    assetId: cleanNullableIdentifier(source.assetId),
  };
}

export function normalizeCp02Metadata(value, objectIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CP02 metadata must be an object");
  }
  const sourceRuntimeCommit = String(value.sourceRuntimeCommit ?? "").toLowerCase();
  const sourceProjectSha256 = String(value.sourceProjectSha256 ?? "").toLowerCase();
  const sourcePhotoSha256 = String(value.sourcePhotoSha256 ?? "").toLowerCase();
  if (!HEX_40.test(sourceRuntimeCommit)) throw new Error("CP02 source runtime commit must be 40 hex characters");
  if (!HEX_64.test(sourceProjectSha256)) throw new Error("CP02 source project SHA-256 must be 64 hex characters");
  if (!HEX_64.test(sourcePhotoSha256)) throw new Error("CP02 source photo SHA-256 must be 64 hex characters");
  if (!Array.isArray(value.evidenceObjectIds)) throw new Error("CP02 evidence object IDs must be an array");

  const evidenceObjectIds = value.evidenceObjectIds.map((id) => requireIdentifier(id, "evidence object ID"));
  if (new Set(evidenceObjectIds).size !== evidenceObjectIds.length) {
    throw new Error("CP02 evidence object IDs must be unique");
  }
  for (const id of evidenceObjectIds) {
    if (!objectIds.has(id)) throw new Error(`CP02 evidence object does not exist: ${id}`);
  }
  return { sourceRuntimeCommit, sourceProjectSha256, sourcePhotoSha256, evidenceObjectIds };
}

export function validateSceneSlots(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Scene slots must be a non-empty array");
  const ids = new Set();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Scene slot ${index} is invalid`);
    const id = requireIdentifier(raw.id, `scene slot ${index} id`);
    if (ids.has(id)) throw new Error(`Duplicate scene slot: ${id}`);
    ids.add(id);
    if (!SEMANTIC_CLASSES.includes(raw.semanticClass)) {
      throw new Error(`Scene slot ${id} has an invalid semantic class`);
    }
    return {
      id,
      semanticClass: raw.semanticClass,
      position: requireVector(raw.position, `scene slot ${id} position`),
      rotation: requireVector(raw.rotation, `scene slot ${id} rotation`),
    };
  });
}

function validateTemplate(raw, assetId, objectIds) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Asset ${assetId} has an invalid child template`);
  }
  const id = requireIdentifier(raw.id, `asset ${assetId} child id`);
  if (objectIds.has(id)) throw new Error(`Duplicate catalog object ID: ${id}`);
  objectIds.add(id);
  if (!OBJECT_TYPES.has(raw.type) || raw.type === "group") {
    throw new Error(`Asset ${assetId} child ${id} has an invalid primitive type`);
  }
  const color = String(raw.color ?? "").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error(`Asset ${assetId} child ${id} has an invalid color`);
  return {
    id,
    type: raw.type,
    name: String(raw.name ?? id).trim().slice(0, 48) || id,
    position: requireVector(raw.position, `asset ${assetId} child ${id} position`),
    rotation: raw.rotation === undefined
      ? [0, 0, 0]
      : requireVector(raw.rotation, `asset ${assetId} child ${id} rotation`),
    dimensions: requireVector(raw.dimensions, `asset ${assetId} child ${id} dimensions`, { positive: true }),
    color,
    render: raw.render && typeof raw.render === "object" && !Array.isArray(raw.render)
      ? structuredClone(raw.render)
      : {},
  };
}

export function validateAssetCatalog(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Asset catalog must be a non-empty array");
  const assetIds = new Set();
  const objectIds = new Set();

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Asset record ${index} is invalid`);
    const assetId = requireIdentifier(raw.assetId, `asset record ${index} id`);
    if (assetIds.has(assetId)) throw new Error(`Duplicate asset ID: ${assetId}`);
    assetIds.add(assetId);
    if (!SEMANTIC_CLASSES.includes(raw.semanticClass)) {
      throw new Error(`Asset ${assetId} has an invalid semantic class`);
    }
    if (!ASSET_STATUSES.includes(raw.status)) throw new Error(`Asset ${assetId} has an invalid status`);

    const record = {
      assetId,
      semanticClass: raw.semanticClass,
      status: raw.status,
      publicDisplay: raw.publicDisplay === true,
    };

    if (raw.status === "PROJECT_AUTHORED_PROXY") {
      record.objectId = requireIdentifier(raw.objectId, `asset ${assetId} root object ID`);
      record.carrierDimensions = raw.carrierDimensions === undefined
        ? [1, 1, 1]
        : requireVector(raw.carrierDimensions, `asset ${assetId} carrier dimensions`, { positive: true });
      if (objectIds.has(record.objectId)) throw new Error(`Duplicate catalog object ID: ${record.objectId}`);
      objectIds.add(record.objectId);
      if (!raw.bundle || !Array.isArray(raw.bundle.children) || raw.bundle.children.length === 0) {
        throw new Error(`Asset ${assetId} requires child templates`);
      }
      record.bundle = {
        children: raw.bundle.children.map((child) => validateTemplate(child, assetId, objectIds)),
      };
    } else {
      record.sourceAssetId = requireIdentifier(raw.sourceAssetId, `asset ${assetId} source asset ID`);
      record.filesHash = String(raw.filesHash ?? "").toLowerCase();
      if (!HEX_40.test(record.filesHash)) throw new Error(`Asset ${assetId} files hash must be 40 hex characters`);
    }
    return record;
  });
}

export function resolveAssetForSlot(
  catalog,
  slots,
  assetId,
  slotId,
  executionMode = "engineering-evidence",
) {
  const asset = catalog.find((record) => record.assetId === assetId);
  if (!asset) throw new Error(`Unknown asset ID: ${assetId}`);
  const slot = slots.find((record) => record.id === slotId);
  if (!slot) throw new Error(`Unknown scene slot: ${slotId}`);
  if (asset.semanticClass !== slot.semanticClass) {
    throw new Error(`Asset and slot semantic class mismatch: ${asset.semanticClass} != ${slot.semanticClass}`);
  }

  if (executionMode === "engineering-evidence") {
    if (asset.status !== "PROJECT_AUTHORED_PROXY") {
      throw new Error(`Asset ${assetId} is not eligible for engineering-evidence`);
    }
  } else if (executionMode === "curated-public") {
    if (asset.status !== "PUBLICLY_CLEARED" || asset.publicDisplay !== true) {
      throw new Error(`Asset ${assetId} is not eligible for curated-public display`);
    }
  } else {
    throw new Error(`Unsupported execution mode: ${executionMode}`);
  }

  return structuredClone({ asset, slot });
}
