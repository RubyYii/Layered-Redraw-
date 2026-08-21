import { loadGlbBytes } from "./asset-runtime.js";

const APPROVED_STATUSES = Object.freeze({
  sourceStatus: "SOURCE_CLEARED",
  technicalStatus: "TECHNICALLY_VALIDATED",
  artisticStatus: "ARTISTICALLY_APPROVED",
  artisticDecision: "KEEP",
});

const CP02_APPROVED_CATALOG = Object.freeze({
  "PH-TABLE-WOODEN-001": Object.freeze({
    sourceAssetId: "WoodenTable_01",
    filename: "WoodenTable_01.glb",
    placement: Object.freeze({
      mode: "REPLACE_PROXY",
      semanticClass: "table",
      slotId: "memory-table-bedside",
      slotStatus: "EXISTING_AUTHORED_SLOT",
      replacesAssetId: "CP02-TABLE-PROXY-001",
    }),
  }),
  "PH-CHAIR-SCHOOL-001": Object.freeze({
    sourceAssetId: "SchoolChair_01",
    filename: "SchoolChair_01.glb",
    placement: Object.freeze({
      mode: "REPLACE_PROXY",
      semanticClass: "chair",
      slotId: "memory-chair-near",
      slotStatus: "EXISTING_AUTHORED_SLOT",
      replacesAssetId: "CP02-CHAIR-PROXY-001",
    }),
  }),
  "PH-MUG-MATERIAL-001": Object.freeze({
    sourceAssetId: "modified_thermos",
    filename: "modified_thermos.glb",
    placement: Object.freeze({
      mode: "ADDITIVE_ONLY",
      semanticClass: "thermos",
      slotId: "memory-thermos-on-table",
      slotStatus: "PENDING_AUTHORED_SLOT",
      replacesAssetId: null,
      prohibitedReplacementAssetId: "CP02-CUP-PROXY-001",
    }),
  }),
});

const requireText = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Case Pack ${label} 缺少有效文本。`);
  return value;
};

const validateAssetPath = (asset) => {
  const filename = requireText(asset.filename, "asset filename");
  const assetPath = requireText(asset.path, "asset path");
  if (
    !/^[^/\\]+\.glb$/i.test(filename)
    || !/^assets\/[^/\\]+\.glb$/i.test(assetPath)
    || assetPath !== `assets/${filename}`
    || assetPath.includes("%")
    || assetPath.includes("?")
    || assetPath.includes("#")
  ) {
    throw new Error(`Case Pack 路径不安全或不是登记的 assets/<file>.glb：${assetPath}`);
  }
};

const validatePlacement = (placement, assetId) => {
  if (!placement || typeof placement !== "object" || Array.isArray(placement)) {
    throw new Error(`Case Pack asset ${assetId} 缺少 placement。`);
  }
  requireText(placement.semanticClass, `${assetId} semanticClass`);
  requireText(placement.slotId, `${assetId} slotId`);
  requireText(placement.slotStatus, `${assetId} slotStatus`);
  if (placement.mode === "REPLACE_PROXY") {
    requireText(placement.replacesAssetId, `${assetId} replacesAssetId`);
    return;
  }
  if (placement.mode === "ADDITIVE_ONLY") {
    if (placement.replacesAssetId !== null) {
      throw new Error(`Case Pack asset ${assetId} 是 additive-only 新增物件，不能替换已有物件。`);
    }
    if (placement.prohibitedReplacementAssetId != null) {
      requireText(placement.prohibitedReplacementAssetId, `${assetId} prohibitedReplacementAssetId`);
    }
    return;
  }
  throw new Error(`Case Pack asset ${assetId} placement mode 未批准。`);
};

export function validateCasePackManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Case Pack manifest 缺失或格式无效。");
  }
  if (input.schemaVersion !== 1) throw new Error("Case Pack manifest schemaVersion 未批准。");
  if (requireText(input.casePackId, "casePackId") !== "pact-cp02-v1") {
    throw new Error(`Case Pack ID 不在 CP02 批准 catalog：${input.casePackId}`);
  }
  if (input.publicReleaseAuthorized !== false) {
    throw new Error("本地 Case Pack 不得自行声明公开发布批准状态。");
  }
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw new Error("Case Pack manifest 没有已批准资产。 ");
  }

  const assetIds = new Set();
  const assetPaths = new Set();
  const assets = input.assets.map((rawAsset) => {
    if (!rawAsset || typeof rawAsset !== "object" || Array.isArray(rawAsset)) {
      throw new Error("Case Pack asset record 格式无效。");
    }
    const assetId = requireText(rawAsset.assetId, "assetId");
    const approved = CP02_APPROVED_CATALOG[assetId];
    if (!approved) throw new Error(`Case Pack asset 不在 CP02 批准 catalog：${assetId}`);
    if (requireText(rawAsset.sourceAssetId, `${assetId} sourceAssetId`) !== approved.sourceAssetId) {
      throw new Error(`Case Pack asset ${assetId} sourceAssetId 与批准 catalog 不一致。`);
    }
    validateAssetPath(rawAsset);
    if (rawAsset.filename !== approved.filename) {
      throw new Error(`Case Pack asset ${assetId} filename 与批准 catalog 不一致。`);
    }
    if (assetIds.has(assetId)) throw new Error(`Case Pack assetId 重复：${assetId}`);
    if (assetPaths.has(rawAsset.path)) throw new Error(`Case Pack asset path 重复：${rawAsset.path}`);
    assetIds.add(assetId);
    assetPaths.add(rawAsset.path);

    if (!Number.isSafeInteger(rawAsset.bytes) || rawAsset.bytes <= 0 || rawAsset.bytes > 80_000_000) {
      throw new Error(`Case Pack asset ${assetId} bytes 大小无效。`);
    }
    if (typeof rawAsset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(rawAsset.sha256)) {
      throw new Error(`Case Pack asset ${assetId} SHA-256 无效。`);
    }
    for (const [field, expected] of Object.entries(APPROVED_STATUSES)) {
      if (rawAsset[field] !== expected) {
        throw new Error(`Case Pack asset ${assetId} ${field} status 未批准。`);
      }
    }
    if (rawAsset.publicDisplay !== false) {
      throw new Error(`Case Pack asset ${assetId} 未获公开展示批准。`);
    }
    validatePlacement(rawAsset.placement, assetId);
    for (const [field, expected] of Object.entries(approved.placement)) {
      if (rawAsset.placement[field] !== expected) {
        throw new Error(`Case Pack asset ${assetId} placement ${field} 与批准 catalog 不一致。`);
      }
    }

    return {
      ...rawAsset,
      binding: rawAsset.binding && typeof rawAsset.binding === "object" && !Array.isArray(rawAsset.binding)
        ? { ...rawAsset.binding }
        : {},
      placement: { ...rawAsset.placement },
    };
  });

  return { ...input, assets };
}

export function assertLocalOrSameOrigin(rootUrl, locationHref = globalThis.location?.href) {
  const pageHref = requireText(locationHref, "page URL");
  const page = new URL(pageHref);
  if (!new Set(["http:", "https:"]).has(page.protocol)) {
    throw new Error(`页面协议不受支持：${page.protocol}`);
  }

  let resolved;
  try {
    resolved = new URL(requireText(rootUrl, "root URL"), page);
  } catch {
    throw new Error("Case Pack root URL 无效。");
  }
  if (!new Set(["http:", "https:"]).has(resolved.protocol)) {
    throw new Error(`Case Pack root 协议不受支持：${resolved.protocol}`);
  }
  if (resolved.origin !== page.origin) throw new Error("Case Pack root 必须与页面 same-origin 同源。");
  if (resolved.username || resolved.password || resolved.search || resolved.hash) {
    throw new Error("Case Pack root URL 不能包含凭据、查询参数或片段。");
  }
  if (!resolved.pathname.endsWith("/")) resolved.pathname = `${resolved.pathname}/`;
  return resolved;
}

const exactBytes = (input) => {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error("Case Pack 响应不是有效的二进制字节。");
};

const sha256Hex = async (bytes) => {
  if (!globalThis.crypto?.subtle) throw new Error("当前运行时不支持 SHA-256 验证。");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

export async function loadCasePack(rootUrl, manifestInput, options = {}) {
  const manifest = validateCasePackManifest(manifestInput);
  const root = assertLocalOrSameOrigin(rootUrl, options.locationHref);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const loadGlbBytesImpl = options.loadGlbBytesImpl ?? loadGlbBytes;
  if (typeof fetchImpl !== "function") throw new Error("当前运行时没有可用的同源 fetch。 ");
  if (typeof loadGlbBytesImpl !== "function") throw new Error("当前运行时没有可用的 GLB loader。 ");
  const byId = new Map(manifest.assets.map((asset) => [asset.assetId, asset]));

  return {
    casePackId: manifest.casePackId,
    manifest,
    async asset(assetId) {
      const record = byId.get(assetId);
      if (!record) throw new Error(`Unknown or unapproved Case Pack asset：${assetId}`);
      const assetUrl = new URL(record.path, root);
      if (assetUrl.origin !== root.origin || !assetUrl.pathname.startsWith(root.pathname)) {
        throw new Error(`Case Pack asset 路径越出批准根目录：${record.path}`);
      }
      const response = await fetchImpl(assetUrl.href, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response?.ok || typeof response.arrayBuffer !== "function") {
        throw new Error(`Case Pack asset 获取失败：${record.assetId}`);
      }
      const bytes = exactBytes(await response.arrayBuffer());
      if (bytes.byteLength !== record.bytes) {
        throw new Error(`Case Pack asset ${record.assetId} size/bytes 大小不匹配。`);
      }
      const digest = await sha256Hex(bytes);
      if (digest !== record.sha256) throw new Error(`Case Pack asset ${record.assetId} SHA-256 不匹配。`);
      return loadGlbBytesImpl(bytes, record.filename, record.binding);
    },
  };
}
