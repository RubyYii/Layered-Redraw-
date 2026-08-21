import * as THREE from "three";
import { createAssetController } from "./asset-runtime.js";

const BRIDGE_KIND = "layered-redraw-spatial-bridge";
const BRIDGE_SCHEMA = "1.0";
const BRIDGE_CONTRACT = "depth-heightfield-v1";
const MAX_BRIDGE_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 80_000_000;
const MAX_IMAGE_EDGE = 16_384;
const MAX_IMAGE_PIXELS = 33_554_432;
const MAX_PROJECT_FILES = 5_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const assertBridge = (condition, message) => {
  if (!condition) throw new Error(`RGB-D 桥接合同无效：${message}`);
};

const normalizedPath = (value) => String(value ?? "")
  .trim()
  .replaceAll("\\", "/")
  .replace(/^\.\//u, "")
  .replace(/\/+/gu, "/");

const validateArtifactPath = (value, label) => {
  const path = normalizedPath(value);
  const parts = path.split("/");
  assertBridge(
    path
      && !path.startsWith("/")
      && !/^[a-z]:/iu.test(path)
      && !/^[a-z][a-z0-9+.-]*:/iu.test(path)
      && parts.every((part) => part && part !== "." && part !== ".."),
    `${label}必须是工程内的安全相对路径`,
  );
  return path;
};

const validateHash = (value, label) => {
  assertBridge(SHA256_PATTERN.test(String(value ?? "")), `${label}必须是 SHA-256`);
  return String(value).toLowerCase();
};

const validateBoundedNumber = (value, label, minimum, maximum, { integer = false } = {}) => {
  assertBridge(
    typeof value === "number"
      && Number.isFinite(value)
      && value >= minimum
      && value <= maximum
      && (!integer || Number.isInteger(value)),
    `${label}必须在 ${minimum}–${maximum} 之间${integer ? "且为整数" : ""}`,
  );
  return value;
};

export function validateSpatialBridge(bridge) {
  assertBridge(isRecord(bridge), "根节点必须是对象");
  assertBridge(bridge.kind === BRIDGE_KIND, `kind 必须是 ${BRIDGE_KIND}`);
  assertBridge(bridge.schema_version === BRIDGE_SCHEMA, `仅支持 schema ${BRIDGE_SCHEMA}`);
  assertBridge(isRecord(bridge.source), "缺少 source");
  assertBridge(isRecord(bridge.depth), "缺少 depth");
  assertBridge(isRecord(bridge.surface), "缺少 surface");
  assertBridge(isRecord(bridge.invariants), "缺少 invariants");
  assertBridge(isRecord(bridge.handoff), "缺少 handoff");

  const width = validateBoundedNumber(bridge.source.width, "source.width", 1, MAX_IMAGE_EDGE, { integer: true });
  const height = validateBoundedNumber(bridge.source.height, "source.height", 1, MAX_IMAGE_EDGE, { integer: true });
  assertBridge(width * height <= MAX_IMAGE_PIXELS, `源图像素数不能超过 ${MAX_IMAGE_PIXELS}`);
  const rgbArtifact = validateArtifactPath(bridge.source.rgb_artifact, "source.rgb_artifact");
  const depthArtifact = validateArtifactPath(bridge.depth.preview_artifact, "depth.preview_artifact");
  assertBridge(rgbArtifact !== depthArtifact, "RGB 与深度预览不能指向同一文件");

  assertBridge(bridge.depth.orientation === "near-white", "depth.orientation 必须是 near-white");
  assertBridge(bridge.depth.relative_depth === true, "depth.relative_depth 必须为 true");
  assertBridge(bridge.depth.metric_scale === false, "depth.metric_scale 必须为 false");
  assertBridge(bridge.surface.representation === "rgb-depth-heightfield", "仅支持 rgb-depth-heightfield 表面");
  assertBridge(bridge.surface.near_direction === "+surface-normal", "近处方向必须是 +surface-normal");
  assertBridge(bridge.surface.texture_fit === "preserve-aspect", "纹理必须保持宽高比");
  assertBridge(bridge.invariants.raw_depth_immutable === true, "原始深度必须保持不可变");
  assertBridge(
    bridge.invariants.art_direction_changes_interpretation_only === true,
    "艺术指导只能改变解释，不能改写原始深度",
  );
  assertBridge(
    bridge.invariants.relative_depth_must_not_be_treated_as_metres === true,
    "必须声明相对深度不得作为米制尺度",
  );
  assertBridge(bridge.handoff.target === "apps/scene-builder", "handoff.target 必须指向 apps/scene-builder");
  assertBridge(bridge.handoff.contract === BRIDGE_CONTRACT, `仅支持 ${BRIDGE_CONTRACT}`);
  assertBridge(
    ["ready-for-import-adapter", "ready-for-import"].includes(bridge.handoff.status),
    "handoff.status 尚未准备好导入",
  );

  const resolution = validateBoundedNumber(
    bridge.surface.mesh_resolution,
    "surface.mesh_resolution",
    24,
    160,
    { integer: true },
  );
  const displacement = validateBoundedNumber(bridge.surface.displacement, "surface.displacement", 0, 2);
  const perspective = validateBoundedNumber(bridge.surface.perspective, "surface.perspective", 0, 1);
  const rgbSha256 = validateHash(bridge.source.rgb_sha256, "source.rgb_sha256");
  const depthSha256 = validateHash(bridge.depth.artifact_sha256?.preview, "depth.artifact_sha256.preview");
  const contractSha256 = validateHash(bridge.contract_sha256, "contract_sha256");

  return {
    bridge,
    width,
    height,
    rgbArtifact,
    depthArtifact,
    rgbSha256,
    depthSha256,
    contractSha256,
    resolution,
    displacement,
    perspective,
  };
}

const filePath = (file) => normalizedPath(file?.webkitRelativePath || file?.name);
const basename = (path) => normalizedPath(path).split("/").at(-1);

export function matchSpatialArtifactFile(files, artifactPath, label = "工件") {
  const expected = validateArtifactPath(artifactPath, label);
  const exact = files.filter((file) => {
    const path = filePath(file);
    return path === expected || path.endsWith(`/${expected}`);
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`${label}路径匹配到多个文件：${expected}`);

  const expectedName = basename(expected);
  const byName = files.filter((file) => basename(filePath(file)) === expectedName);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`${label}存在多个同名文件，请选择完整的工程文件夹：${expectedName}`);
  throw new Error(`找不到${label}：${expected}`);
}

export async function sha256Hex(input) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("当前环境不支持 SHA-256 校验，已停止导入。");
  const buffer = input instanceof ArrayBuffer
    ? input
    : ArrayBuffer.isView(input)
      ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
      : await input.arrayBuffer();
  const digest = await subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

const verifyFile = async (file, expectedHash, label) => {
  const size = Number(file?.size) || 0;
  if (!size) throw new Error(`${label}文件为空。`);
  if (size > MAX_IMAGE_BYTES) throw new Error(`${label}超过 80 MB，请先压缩工程资源。`);
  const buffer = await file.arrayBuffer();
  const actualHash = await sha256Hex(buffer);
  if (actualHash !== expectedHash) throw new Error(`${label}的 SHA-256 与桥接合同不一致，已停止导入。`);
  return { hash: actualHash, buffer };
};

const bridgeCandidates = (files) => files
  .filter((file) => /(?:^|[-_])spatial-bridge\.json$/iu.test(String(file?.name ?? "")))
  .sort((left, right) => Number(String(left.name).toLowerCase() !== "spatial-bridge.json")
    - Number(String(right.name).toLowerCase() !== "spatial-bridge.json"));

export async function resolveSpatialBridgeFiles(inputFiles) {
  const files = [...(inputFiles ?? [])].filter((file) => file && typeof file === "object");
  if (!files.length) throw new Error("请选择包含 spatial-bridge.json 的 Layered Redraw 工程文件夹。");
  if (files.length > MAX_PROJECT_FILES) throw new Error(`工程文件过多；当前最多检查 ${MAX_PROJECT_FILES} 个文件。`);

  const matches = [];
  for (const file of bridgeCandidates(files)) {
    const size = Number(file.size) || 0;
    if (!size || size > MAX_BRIDGE_BYTES) continue;
    try {
      const bridge = JSON.parse(await file.text());
      if (bridge?.kind === BRIDGE_KIND) matches.push({ file, bridge });
    } catch {
      // Other JSON files in a project are intentionally ignored.
    }
  }
  if (!matches.length) throw new Error("工程中没有可用的 spatial-bridge.json；请先从 Layered Redraw 导出空间桥接合同。");
  if (matches.length > 1) throw new Error("工程中检测到多个空间桥接合同，请只保留或单独选择一个工程。");

  const { file: bridgeFile, bridge } = matches[0];
  const contract = validateSpatialBridge(bridge);
  const rgbFile = matchSpatialArtifactFile(files, contract.rgbArtifact, "RGB 工件");
  const depthFile = matchSpatialArtifactFile(files, contract.depthArtifact, "深度预览工件");
  const [rgbVerified, depthVerified] = await Promise.all([
    verifyFile(rgbFile, contract.rgbSha256, "RGB 工件"),
    verifyFile(depthFile, contract.depthSha256, "深度预览工件"),
  ]);

  return {
    bridgeFile,
    bridge,
    contract,
    rgbFile,
    depthFile,
    verifiedHashes: { rgb: rgbVerified.hash, depthPreview: depthVerified.hash },
    artifactBuffers: { rgb: rgbVerified.buffer, depthPreview: depthVerified.buffer },
  };
}

const channelValue = (pixels, width, height, x, y) => {
  const safeX = Math.min(width - 1, Math.max(0, x));
  const safeY = Math.min(height - 1, Math.max(0, y));
  const offset = (safeY * width + safeX) * 4;
  return (
    pixels[offset] * 0.2126
    + pixels[offset + 1] * 0.7152
    + pixels[offset + 2] * 0.0722
  ) / 255;
};

const bilinearNearness = (pixels, width, height, u, v) => {
  const x = Math.min(width - 1, Math.max(0, u * (width - 1)));
  const y = Math.min(height - 1, Math.max(0, (1 - v) * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = channelValue(pixels, width, height, x0, y0) * (1 - tx)
    + channelValue(pixels, width, height, x1, y0) * tx;
  const bottom = channelValue(pixels, width, height, x0, y1) * (1 - tx)
    + channelValue(pixels, width, height, x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
};

export function buildHeightfieldSamples(pixels, width, height, resolution, displacement) {
  if (!ArrayBuffer.isView(pixels) || pixels.length !== width * height * 4) {
    throw new Error("深度预览像素缓冲区与图像尺寸不一致。");
  }
  const safeResolution = validateBoundedNumber(resolution, "surface.mesh_resolution", 24, 160, { integer: true });
  const safeDisplacement = validateBoundedNumber(displacement, "surface.displacement", 0, 2);
  const landscape = width >= height;
  const columns = landscape
    ? safeResolution
    : Math.max(2, Math.round(safeResolution * width / height));
  const rows = landscape
    ? Math.max(2, Math.round(safeResolution * height / width))
    : safeResolution;
  const nearness = new Float32Array(columns * rows);
  let mean = 0;
  let minimum = 1;
  let maximum = 0;
  for (let row = 0; row < rows; row += 1) {
    // PlaneGeometry emits its first vertex row at UV v=1 (the image top).
    const v = rows === 1 ? 0.5 : 1 - row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const u = columns === 1 ? 0.5 : column / (columns - 1);
      const value = bilinearNearness(pixels, width, height, u, v);
      const index = row * columns + column;
      nearness[index] = value;
      mean += value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  mean /= nearness.length;
  const heights = new Float32Array(nearness.length);
  for (let index = 0; index < nearness.length; index += 1) {
    heights[index] = (nearness[index] - mean) * safeDisplacement;
  }
  return {
    columns,
    rows,
    vertexCount: columns * rows,
    planeWidth: landscape ? 1 : width / height,
    planeHeight: landscape ? height / width : 1,
    heights,
    nearnessMean: mean,
    nearnessRange: [minimum, maximum],
  };
}

export function inspectPngDimensions(input, label = "图像工件") {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = bytes.length >= 24
    && signature.every((value, index) => bytes[index] === value)
    && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR";
  if (!isPng) throw new Error(`${label}不是有效的 PNG 文件。`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`${label}尺寸超出安全解码范围。`);
  }
  return { width, height };
}

const decodeCanvas = async (buffer, label, expectedWidth, expectedHeight) => {
  const dimensions = inspectPngDimensions(buffer, label);
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(`${label}尺寸为 ${dimensions.width}×${dimensions.height}，与合同 ${expectedWidth}×${expectedHeight} 不一致。`);
  }
  if (typeof createImageBitmap !== "function") throw new Error("当前浏览器不能解码本地 RGB-D 图像。");
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([buffer], { type: "image/png" }));
  } catch {
    throw new Error(`${label}不是可解码的 PNG 图像。`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: label.includes("深度") });
  if (!context) {
    bitmap.close?.();
    throw new Error("浏览器无法创建 RGB-D 采样画布。");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
};

export async function loadSpatialBridgeFiles(files, config = {}) {
  const bundle = await resolveSpatialBridgeFiles(files);
  const { bridge, contract } = bundle;
  const [rgbCanvas, depthCanvas] = await Promise.all([
    decodeCanvas(bundle.artifactBuffers.rgb, "RGB 工件", contract.width, contract.height),
    decodeCanvas(bundle.artifactBuffers.depthPreview, "深度预览工件", contract.width, contract.height),
  ]);
  if (rgbCanvas.width !== contract.width || rgbCanvas.height !== contract.height) {
    throw new Error(`RGB 尺寸为 ${rgbCanvas.width}×${rgbCanvas.height}，与合同 ${contract.width}×${contract.height} 不一致。`);
  }
  if (depthCanvas.width !== contract.width || depthCanvas.height !== contract.height) {
    throw new Error(`深度预览尺寸为 ${depthCanvas.width}×${depthCanvas.height}，与 RGB／合同不一致。`);
  }

  const depthContext = depthCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const depthPixels = depthContext.getImageData(0, 0, contract.width, contract.height).data;
  const samples = buildHeightfieldSamples(
    depthPixels,
    contract.width,
    contract.height,
    contract.resolution,
    contract.displacement,
  );
  const geometry = new THREE.PlaneGeometry(
    samples.planeWidth,
    samples.planeHeight,
    samples.columns - 1,
    samples.rows - 1,
  );
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) positions.setZ(index, samples.heights[index]);
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const texture = new THREE.CanvasTexture(rgbCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.22,
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `RGB-D heightfield · ${bridge.source.label || bridge.source.id}`;
  const scene = new THREE.Group();
  scene.name = "RGB-D spatial bridge";
  scene.add(mesh);

  return createAssetController(
    { scene, animations: [] },
    { scale: config?.scale },
    bridge.source.label || bundle.bridgeFile.name,
    {
      format: "RGB-D",
      fitAxes: [0, 1],
      warnings: ["相对深度不是米制几何；未生成隐藏表面、碰撞体、骨架或导航数据。"],
      report: {
        spatialBridge: {
          sourceId: bridge.source.id,
          depthId: bridge.depth.id,
          representation: bridge.surface.representation,
          imageSize: [contract.width, contract.height],
          meshSize: [samples.columns, samples.rows],
          vertexCount: samples.vertexCount,
          displacement: contract.displacement,
          perspective: contract.perspective,
          relativeDepth: true,
          metricScale: false,
          collision: false,
          verifiedArtifacts: ["rgb", "depth-preview"],
          contractSha256: contract.contractSha256,
          handoffStatus: "imported-session-only",
          nearnessMean: samples.nearnessMean,
          nearnessRange: samples.nearnessRange,
        },
      },
    },
  );
}
