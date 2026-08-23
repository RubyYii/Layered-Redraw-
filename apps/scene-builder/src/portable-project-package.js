const PACKAGE_TYPE = "blockout-studio-portable-project";
const PACKAGE_SCHEMA_VERSION = 1;
const MANIFEST_PATH = "portable-project.json";
const PROJECT_PATH = "project.json";
const MAX_PACKAGE_BYTES = 360_000_000;
const MAX_PROJECT_BYTES = 96_000_000;
const MAX_ASSET_BYTES = 160_000_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const asUint8Array = (input) => input instanceof Uint8Array
  ? input
  : input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : null;

export async function sha256Hex(input) {
  const bytes = asUint8Array(input);
  if (!bytes) throw new Error("无法计算非二进制输入的 SHA-256。");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

const basename = (value) => String(value ?? "")
  .replaceAll("\\", "/")
  .split("/")
  .at(-1)
  ?.replace(/[\u0000-\u001f<>:"|?*]+/g, "-")
  .trim()
  .slice(0, 160) || "asset.bin";

const extensionFor = (filename) => {
  const match = basename(filename).toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match ? `.${match[1]}` : ".bin";
};

const packagePathFor = (entry) => `assets/${entry.sha256}${extensionFor(entry.filename)}`;

const fileLike = (blob, filename, mimeType) => {
  if (typeof File === "function") return new File([blob], filename, { type: mimeType });
  const clone = blob.slice(0, blob.size, mimeType);
  Object.defineProperty(clone, "name", { value: filename, enumerable: true });
  return clone;
};

const jsonBytes = (value) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
const parseJsonBytes = (bytes, label) => {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`${label} 不是有效 JSON。`);
  }
};

const zipAsync = async (files) => {
  const { zip } = await import("fflate");
  return new Promise((resolve, reject) => {
    zip(files, { level: 1, mtime: new Date("1980-01-01T00:00:00.000Z") }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
};

const unzipAsync = async (bytes, filter) => {
  const { unzip } = await import("fflate");
  return new Promise((resolve, reject) => {
    unzip(bytes, { filter }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
};

const portableBindingsForProject = (project) => (project?.objects ?? [])
  .filter((object) => object.asset?.portable)
  .map((object) => ({ objectId: object.id, binding: object.asset.portable }))
  .sort((left, right) => left.objectId.localeCompare(right.objectId));

const validateBindingEntry = (entry) => {
  const sha256 = String(entry?.sha256 ?? "").toLowerCase();
  const filename = basename(entry?.filename);
  const bytes = Math.round(Number(entry?.bytes) || 0);
  const mimeType = String(entry?.mimeType ?? "application/octet-stream").slice(0, 96);
  const role = String(entry?.role ?? "");
  if (!SHA256_PATTERN.test(sha256) || bytes < 1 || bytes > MAX_ASSET_BYTES || !role) {
    throw new Error("项目中的可移植资产引用无效。");
  }
  return { sha256, filename, bytes, mimeType, role };
};

export async function persistPortableFiles(persistence, kind, descriptors) {
  if (!persistence?.available) throw new Error("当前浏览器无法持久化二进制资产。");
  const expectedRoles = kind === "model" ? ["model"] : kind === "spatial-bridge" ? ["bridge", "depth", "rgb"] : null;
  if (!expectedRoles) throw new Error("未知的可移植资产类型。");
  const byRole = new Map((descriptors ?? []).map((descriptor) => [descriptor.role, descriptor.file]));
  if (byRole.size !== expectedRoles.length || expectedRoles.some((role) => !byRole.get(role))) {
    throw new Error("可移植资产文件集合不完整。");
  }

  const entries = [];
  for (const role of expectedRoles) {
    const file = byRole.get(role);
    entries.push(await persistPortableFile(persistence, role, file));
  }
  return { schemaVersion: 1, kind, entries: entries.sort((left, right) => left.role.localeCompare(right.role)) };
}

export async function persistPortableFile(persistence, role, file) {
  if (!persistence?.available) throw new Error("当前浏览器无法持久化二进制资产。");
  if (!["model", "animation", "bridge", "rgb", "depth"].includes(role)) throw new Error("未知的可移植资产角色。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_ASSET_BYTES) throw new Error("资产文件大小超出限制。");
  const record = {
    role,
    sha256: await sha256Hex(bytes),
    filename: basename(file.name),
    bytes: bytes.byteLength,
    mimeType: String(file.type || "application/octet-stream").slice(0, 96),
    blob: new Blob([bytes], { type: file.type || "application/octet-stream" }),
  };
  await persistence.putAsset(record);
  const { blob: _blob, ...entry } = record;
  return entry;
}

export async function filesForPortableBinding(persistence, binding) {
  const entries = (binding?.entries ?? []).map(validateBindingEntry);
  const files = [];
  for (const entry of entries) {
    const stored = await persistence.getAsset(entry.sha256);
    if (!stored || stored.bytes !== entry.bytes || stored.blob?.size !== entry.bytes) {
      throw new Error(`本地资产缓存缺少 ${entry.filename}；请重新导入工程包。`);
    }
    files.push({ role: entry.role, file: fileLike(stored.blob, entry.filename, entry.mimeType) });
  }
  return files;
}

export async function createPortableProjectPackage(project, persistence, serializeProject) {
  const bindings = portableBindingsForProject(project);
  const projectBytes = new TextEncoder().encode(serializeProject(project));
  if (projectBytes.byteLength > MAX_PROJECT_BYTES) throw new Error("项目 JSON 超过 96 MB，无法安全打包。");
  const projectSha256 = await sha256Hex(projectBytes);
  const uniqueAssets = new Map();
  for (const { binding } of bindings) {
    for (const rawEntry of binding.entries ?? []) {
      const entry = validateBindingEntry(rawEntry);
      const previous = uniqueAssets.get(entry.sha256);
      if (previous && previous.bytes !== entry.bytes) throw new Error("资产哈希与大小映射冲突。");
      uniqueAssets.set(entry.sha256, entry);
    }
  }

  const assets = [];
  const files = { [PROJECT_PATH]: [projectBytes, { level: 6 }] };
  let totalBytes = projectBytes.byteLength;
  for (const entry of [...uniqueAssets.values()].sort((left, right) => left.sha256.localeCompare(right.sha256))) {
    const stored = await persistence.getAsset(entry.sha256);
    if (!stored || stored.bytes !== entry.bytes || stored.blob?.size !== entry.bytes) {
      throw new Error(`资产 ${entry.filename} 尚未写入本地内容库。`);
    }
    const bytes = new Uint8Array(await stored.blob.arrayBuffer());
    if (await sha256Hex(bytes) !== entry.sha256) throw new Error(`资产 ${entry.filename} 的本地哈希已改变。`);
    const path = packagePathFor(entry);
    files[path] = [bytes, { level: /\.(?:json|obj)$/i.test(entry.filename) ? 6 : 0 }];
    assets.push({ ...entry, path });
    totalBytes += bytes.byteLength;
  }
  if (totalBytes > MAX_PACKAGE_BYTES) throw new Error("工程包未压缩内容超过 360 MB 限制。");

  const manifest = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    type: PACKAGE_TYPE,
    project: {
      path: PROJECT_PATH,
      sha256: projectSha256,
      bytes: projectBytes.byteLength,
      id: String(project.id ?? ""),
      name: String(project.name ?? ""),
    },
    bindings: bindings.map(({ objectId, binding }) => ({
      objectId,
      kind: binding.kind,
      entries: binding.entries.map((entry) => ({ role: entry.role, sha256: entry.sha256 })),
    })),
    assets,
  };
  files[MANIFEST_PATH] = [jsonBytes(manifest), { level: 6 }];
  const archive = await zipAsync(files);
  return {
    blob: new Blob([archive], { type: "application/zip" }),
    manifest,
    uncompressedBytes: totalBytes,
  };
}

const validateManifest = (manifest) => {
  if (manifest?.schemaVersion !== PACKAGE_SCHEMA_VERSION || manifest?.type !== PACKAGE_TYPE) {
    throw new Error("这不是兼容的 Blockout Studio 可移植工程包。");
  }
  if (manifest.project?.path !== PROJECT_PATH || !SHA256_PATTERN.test(manifest.project?.sha256 ?? "")) {
    throw new Error("工程包项目入口无效。");
  }
  const projectBytes = Math.round(Number(manifest.project.bytes) || 0);
  if (projectBytes < 2 || projectBytes > MAX_PROJECT_BYTES) throw new Error("工程包项目大小无效。");
  const assets = (Array.isArray(manifest.assets) ? manifest.assets : []).map((entry) => {
    const validated = validateBindingEntry(entry);
    const path = String(entry.path ?? "");
    if (path !== packagePathFor(validated) || path.includes("..") || path.startsWith("/")) {
      throw new Error("工程包包含不安全的资产路径。");
    }
    return { ...validated, path };
  });
  if (new Set(assets.map((entry) => entry.sha256)).size !== assets.length) {
    throw new Error("工程包清单包含重复资产哈希。");
  }
  return { projectBytes, assets };
};

export async function importPortableProjectPackage(file, persistence, parseProject) {
  const compressed = new Uint8Array(await file.arrayBuffer());
  if (!compressed.byteLength || compressed.byteLength > MAX_PACKAGE_BYTES) throw new Error("工程包大小超出 360 MB 限制。");
  const header = await unzipAsync(compressed, (entry) => (
    (entry.name === MANIFEST_PATH && entry.originalSize <= 2_000_000)
    || (entry.name === PROJECT_PATH && entry.originalSize <= MAX_PROJECT_BYTES)
  ));
  if (!header[MANIFEST_PATH] || !header[PROJECT_PATH]) throw new Error("工程包缺少清单或项目 JSON。");
  const manifest = parseJsonBytes(header[MANIFEST_PATH], "工程包清单");
  const { projectBytes, assets } = validateManifest(manifest);
  if (header[PROJECT_PATH].byteLength !== projectBytes) throw new Error("工程包项目大小与清单不一致。");
  if (await sha256Hex(header[PROJECT_PATH]) !== manifest.project.sha256) throw new Error("工程包项目 SHA-256 校验失败。");
  const project = parseProject(new TextDecoder().decode(header[PROJECT_PATH]));

  const referenced = new Set(portableBindingsForProject(project)
    .flatMap(({ binding }) => binding.entries.map((entry) => entry.sha256)));
  const declared = new Set(assets.map((entry) => entry.sha256));
  if (referenced.size !== declared.size || [...referenced].some((sha256) => !declared.has(sha256))) {
    throw new Error("项目资产引用与工程包清单不一致。");
  }

  let advertisedBytes = projectBytes;
  const allowedPaths = new Map();
  for (const asset of assets) {
    advertisedBytes += asset.bytes;
    allowedPaths.set(asset.path, asset);
  }
  if (advertisedBytes > MAX_PACKAGE_BYTES) throw new Error("工程包声明的未压缩内容超过 360 MB 限制。");
  const unpacked = await unzipAsync(compressed, (entry) => {
    const asset = allowedPaths.get(entry.name);
    return Boolean(asset && entry.originalSize === asset.bytes);
  });
  for (const asset of assets) {
    const bytes = unpacked[asset.path];
    if (!bytes || bytes.byteLength !== asset.bytes) throw new Error(`工程包缺少资产 ${asset.filename}。`);
    if (await sha256Hex(bytes) !== asset.sha256) throw new Error(`资产 ${asset.filename} 的 SHA-256 校验失败。`);
    await persistence.putAsset({
      ...asset,
      blob: new Blob([bytes], { type: asset.mimeType }),
    });
  }
  return { project, manifest };
}

export const PORTABLE_PROJECT_PACKAGE = Object.freeze({
  type: PACKAGE_TYPE,
  schemaVersion: PACKAGE_SCHEMA_VERSION,
  manifestPath: MANIFEST_PATH,
  projectPath: PROJECT_PATH,
  maxPackageBytes: MAX_PACKAGE_BYTES,
});
