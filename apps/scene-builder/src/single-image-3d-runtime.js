import * as THREE from "three";

export const SINGLE_IMAGE_DEPTH_MODEL = "onnx-community/depth-anything-v2-small";
export const SINGLE_IMAGE_3D_CONTRACT = "single-image-relative-relief-v1";

const ORT_WASM_MODULE_URL = new URL(
  "../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs",
  import.meta.url,
).href;
const ORT_WASM_BINARY_URL = new URL(
  "../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm",
  import.meta.url,
).href;

const MAX_IMAGE_BYTES = 20_000_000;
const MAX_IMAGE_EDGE = 8_192;
const MAX_IMAGE_PIXELS = 33_554_432;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const assertTypedArray = (value, length, label) => {
  if (!ArrayBuffer.isView(value) || value.length !== length) {
    throw new Error(`${label}像素缓冲区与图像尺寸不一致。`);
  }
};

const canvasToBlob = (canvas, type = "image/png", quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error("浏览器无法编码生成工件。"));
  }, type, quality);
});

const decodeBrowserImage = async (file) => {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  if (typeof document === "undefined") throw new Error("当前环境不能解码本地图片。");
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片，请换用 PNG、JPEG 或 WebP。"));
    };
    image.src = url;
  });
};

export async function prepareSingleImageFile(file, { maxEdge = 1_024 } = {}) {
  if (!file || typeof file !== "object" || !String(file.type ?? "").startsWith("image/")) {
    throw new Error("请选择 PNG、JPEG 或 WebP 单图。");
  }
  if (!Number(file.size) || file.size > MAX_IMAGE_BYTES) {
    throw new Error("单图必须小于 20 MB。");
  }
  const image = await decodeBrowserImage(file);
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  if (
    !sourceWidth
    || !sourceHeight
    || sourceWidth > MAX_IMAGE_EDGE
    || sourceHeight > MAX_IMAGE_EDGE
    || sourceWidth * sourceHeight > MAX_IMAGE_PIXELS
  ) {
    image.close?.();
    throw new Error("图片尺寸超出安全解码范围。");
  }
  const safeMaxEdge = clamp(Math.round(finite(maxEdge, 1_024)), 256, 2_048);
  const scale = Math.min(1, safeMaxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) {
    image.close?.();
    throw new Error("浏览器无法创建单图采样画布。");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  image.close?.();
  const pixels = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
  const blob = await canvasToBlob(canvas, "image/png");
  return {
    width,
    height,
    pixels,
    blob,
    sourceName: String(file.name ?? "single-image").replace(/\.[^.]+$/u, "").slice(0, 80) || "single-image",
    originalSize: [sourceWidth, sourceHeight],
  };
}

const normalizedDepthFromValues = (values, width, height, invert = false) => {
  assertTypedArray(values, width * height, "深度");
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const raw of values) {
    const value = finite(raw, 0);
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const range = maximum - minimum;
  const depth = new Float32Array(values.length);
  let mean = 0;
  for (let index = 0; index < values.length; index += 1) {
    const normalized = range > 1e-8 ? (finite(values[index], minimum) - minimum) / range : 0.5;
    depth[index] = invert ? 1 - normalized : normalized;
    mean += depth[index];
  }
  mean /= depth.length;
  return { width, height, depth, mean, range: [minimum, maximum], inverted: invert };
};

export function depthPipelineOutputToRaster(output, { invert = false } = {}) {
  const image = output?.depth;
  const width = Math.round(finite(image?.width, 0));
  const height = Math.round(finite(image?.height, 0));
  const channels = Math.max(1, Math.round(finite(image?.channels, 1)));
  if (width && height && ArrayBuffer.isView(image?.data) && image.data.length >= width * height * channels) {
    const values = new Float32Array(width * height);
    for (let index = 0; index < values.length; index += 1) {
      const offset = index * channels;
      values[index] = channels === 1
        ? image.data[offset]
        : image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722;
    }
    return normalizedDepthFromValues(values, width, height, invert);
  }

  const prediction = output?.predicted_depth;
  const dims = Array.isArray(prediction?.dims) ? prediction.dims : [];
  const predictedWidth = Math.round(finite(dims.at(-1), 0));
  const predictedHeight = Math.round(finite(dims.at(-2), 0));
  if (!predictedWidth || !predictedHeight || !ArrayBuffer.isView(prediction?.data)) {
    throw new Error("深度模型没有返回可用的像素数据。");
  }
  return normalizedDepthFromValues(prediction.data, predictedWidth, predictedHeight, invert);
}

export function depthRasterToRgba(raster) {
  const { width, height, depth } = raster ?? {};
  assertTypedArray(depth, width * height, "深度");
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < depth.length; index += 1) {
    const value = Math.round(clamp(finite(depth[index], 0), 0, 1) * 255);
    const offset = index * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

const progressMessage = (event, backend) => {
  const progress = clamp(finite(event?.progress, 0), 0, 100);
  const filename = String(event?.file ?? "").split("/").at(-1);
  if (event?.status === "progress") return `下载模型 ${filename || "权重"} · ${Math.round(progress)}%`;
  if (event?.status === "ready") return `${backend.toUpperCase()} 深度模型已就绪`;
  return `${backend.toUpperCase()} · ${event?.status || "正在加载模型"}`;
};

const describeRuntimeError = (error) => {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error?.message) return `${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message}`;
  if (error?.error?.message) return error.error.message;
  if (error?.target?.status || error?.target?.statusText) {
    return `HTTP ${error.target.status || "请求失败"} ${error.target.statusText || ""}`.trim();
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Fall through to the stable object tag.
  }
  return Object.prototype.toString.call(error);
};

export function createDepthEstimatorRuntime({
  importer = () => import("@huggingface/transformers"),
  modelId = SINGLE_IMAGE_DEPTH_MODEL,
  webgpuAvailable = async () => {
    const gpu = globalThis.navigator?.gpu;
    if (!gpu?.requestAdapter) return false;
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      return Boolean(adapter?.features?.has?.("shader-f16"));
    } catch {
      return false;
    }
  },
} = {}) {
  let loaded = null;
  let loading = null;

  const load = async (onProgress = () => {}) => {
    if (loaded) return loaded;
    if (loading) return loading;
    loading = (async () => {
      const module = await importer();
      if (typeof module?.pipeline !== "function") throw new Error("Transformers.js 深度管线不可用。");
      if (module.env?.backends?.onnx?.wasm) {
        module.env.backends.onnx.wasm.wasmPaths = {
          mjs: ORT_WASM_MODULE_URL,
          wasm: ORT_WASM_BINARY_URL,
        };
      }
      const candidates = await webgpuAvailable()
        ? [
          { backend: "webgpu", device: "webgpu", dtype: "q4f16" },
          { backend: "wasm", device: "wasm", dtype: "q8" },
        ]
        : [{ backend: "wasm", device: "wasm", dtype: "q8" }];
      const failures = [];
      for (const candidate of candidates) {
        try {
          onProgress({ phase: "loading", backend: candidate.backend, message: `${candidate.backend.toUpperCase()} 正在载入深度模型` });
          const estimator = await module.pipeline("depth-estimation", modelId, {
            device: candidate.device,
            dtype: candidate.dtype,
            progress_callback: (event) => onProgress({
              phase: "loading",
              backend: candidate.backend,
              event,
              message: progressMessage(event, candidate.backend),
            }),
          });
          loaded = { estimator, backend: candidate.backend, modelId, dtype: candidate.dtype };
          onProgress({ phase: "ready", ...loaded, message: `${candidate.backend.toUpperCase()} 深度模型已就绪` });
          return loaded;
        } catch (error) {
          failures.push(`${candidate.backend}: ${describeRuntimeError(error)}`);
        }
      }
      throw new Error(`深度模型载入失败（${failures.join("；")}）。首次运行需要联网下载模型，之后使用浏览器缓存。`);
    })().catch((error) => {
      loading = null;
      throw error;
    });
    return loading;
  };

  return {
    async estimate(imageInput, { invert = false, onProgress = () => {} } = {}) {
      const runtime = await load(onProgress);
      onProgress({ phase: "estimating", ...runtime, message: "正在本机估算相对深度…" });
      const output = await runtime.estimator(imageInput);
      const raster = depthPipelineOutputToRaster(output, { invert });
      onProgress({ phase: "complete", ...runtime, message: `深度估算完成 · ${raster.width} × ${raster.height}` });
      return { ...raster, backend: runtime.backend, modelId: runtime.modelId, dtype: runtime.dtype };
    },
    status() {
      return loaded ? { state: "ready", backend: loaded.backend, modelId: loaded.modelId, dtype: loaded.dtype } : { state: loading ? "loading" : "idle", modelId };
    },
    async dispose() {
      const current = loaded;
      loaded = null;
      loading = null;
      await current?.estimator?.dispose?.();
    },
  };
}

export const browserDepthEstimator = createDepthEstimatorRuntime();

const bilinearSample = (values, width, height, u, v, channels = 1) => {
  const x = clamp(u, 0, 1) * (width - 1);
  const y = clamp(v, 0, 1) * (height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const sample = (channel) => {
    const at = (sampleX, sampleY) => finite(values[(sampleY * width + sampleX) * channels + channel], 0);
    const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
    const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return channels === 1 ? sample(0) : Array.from({ length: channels }, (_, channel) => sample(channel));
};

export function buildReliefMeshData({
  rgbPixels,
  depth,
  width,
  height,
  resolution = 96,
  depthStrength = 0.35,
  edgeThreshold = 0.28,
  alphaCutoff = 0.02,
} = {}) {
  const safeWidth = Math.round(finite(width, 0));
  const safeHeight = Math.round(finite(height, 0));
  if (!safeWidth || !safeHeight) throw new Error("单图网格缺少有效尺寸。");
  assertTypedArray(rgbPixels, safeWidth * safeHeight * 4, "RGB");
  assertTypedArray(depth, safeWidth * safeHeight, "深度");
  const safeResolution = clamp(Math.round(finite(resolution, 96)), 8, 192);
  const safeStrength = clamp(finite(depthStrength, 0.35), 0, 2);
  const safeEdgeThreshold = clamp(finite(edgeThreshold, 0.28), 0.01, 1);
  const safeAlphaCutoff = clamp(finite(alphaCutoff, 0.02), 0, 1);
  const landscape = safeWidth >= safeHeight;
  const columns = landscape ? safeResolution : Math.max(2, Math.round(safeResolution * safeWidth / safeHeight));
  const rows = landscape ? Math.max(2, Math.round(safeResolution * safeHeight / safeWidth)) : safeResolution;
  const planeWidth = landscape ? 1 : safeWidth / safeHeight;
  const planeHeight = landscape ? safeHeight / safeWidth : 1;
  const vertexCount = columns * rows;
  const sampledDepth = new Float32Array(vertexCount);
  const sampledAlpha = new Float32Array(vertexCount);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  let mean = 0;
  let activeSamples = 0;

  for (let row = 0; row < rows; row += 1) {
    const v = rows === 1 ? 0.5 : row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const u = columns === 1 ? 0.5 : column / (columns - 1);
      const index = row * columns + column;
      const rgba = bilinearSample(rgbPixels, safeWidth, safeHeight, u, v, 4);
      const relativeDepth = clamp(bilinearSample(depth, safeWidth, safeHeight, u, v), 0, 1);
      const alpha = clamp(rgba[3] / 255, 0, 1);
      sampledDepth[index] = relativeDepth;
      sampledAlpha[index] = alpha;
      colors[index * 3] = clamp(rgba[0] / 255, 0, 1);
      colors[index * 3 + 1] = clamp(rgba[1] / 255, 0, 1);
      colors[index * 3 + 2] = clamp(rgba[2] / 255, 0, 1);
      uvs[index * 2] = u;
      uvs[index * 2 + 1] = 1 - v;
      if (alpha >= safeAlphaCutoff) {
        mean += relativeDepth;
        activeSamples += 1;
      }
    }
  }
  if (!activeSamples) throw new Error("透明度阈值移除了全部图像表面。");
  mean /= activeSamples;
  const positions = new Float32Array(vertexCount * 3);
  for (let row = 0; row < rows; row += 1) {
    const v = rows === 1 ? 0.5 : row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const u = columns === 1 ? 0.5 : column / (columns - 1);
      const index = row * columns + column;
      positions[index * 3] = (u - 0.5) * planeWidth;
      positions[index * 3 + 1] = (0.5 - v) * planeHeight;
      positions[index * 3 + 2] = (sampledDepth[index] - mean) * safeStrength;
    }
  }

  const faces = [];
  const appendTriangle = (a, b, c) => {
    const values = [sampledDepth[a], sampledDepth[b], sampledDepth[c]];
    if (Math.max(...values) - Math.min(...values) > safeEdgeThreshold) return;
    if ([a, b, c].some((index) => sampledAlpha[index] < safeAlphaCutoff)) return;
    faces.push(a, b, c);
  };
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const topLeft = row * columns + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns;
      const bottomRight = bottomLeft + 1;
      appendTriangle(topLeft, bottomLeft, topRight);
      appendTriangle(topRight, bottomLeft, bottomRight);
    }
  }
  if (!faces.length) throw new Error("深度断层或透明度阈值移除了全部网格面。");
  const indices = new Uint32Array(faces);
  const normals = new Float32Array(vertexCount * 3);
  const left = new THREE.Vector3();
  const middle = new THREE.Vector3();
  const right = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const readPosition = (index, target) => target.fromArray(positions, index * 3);
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    readPosition(a, left);
    readPosition(b, middle);
    readPosition(c, right);
    edgeA.subVectors(middle, left);
    edgeB.subVectors(right, left);
    normal.crossVectors(edgeA, edgeB);
    for (const vertex of [a, b, c]) {
      normals[vertex * 3] += normal.x;
      normals[vertex * 3 + 1] += normal.y;
      normals[vertex * 3 + 2] += normal.z;
    }
  }
  for (let index = 0; index < vertexCount; index += 1) {
    normal.fromArray(normals, index * 3);
    if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
    else normal.normalize();
    normal.toArray(normals, index * 3);
  }

  return {
    contract: SINGLE_IMAGE_3D_CONTRACT,
    imageSize: [safeWidth, safeHeight],
    gridSize: [columns, rows],
    planeSize: [planeWidth, planeHeight],
    vertexCount,
    faceCount: indices.length / 3,
    positions,
    normals,
    colors,
    uvs,
    indices,
    sampledDepth,
    sampledAlpha,
    depthMean: mean,
    settings: {
      resolution: safeResolution,
      depthStrength: safeStrength,
      edgeThreshold: safeEdgeThreshold,
      alphaCutoff: safeAlphaCutoff,
    },
  };
}

const fixed = (value) => finite(value, 0).toFixed(6);

export function serializeReliefObj(mesh, { name = "single-image-relief" } = {}) {
  if (!mesh?.positions || !mesh?.indices) throw new Error("没有可导出的单图网格。");
  const safeName = String(name).replace(/[^a-z0-9_.-]+/giu, "-").replace(/^-+|-+$/gu, "") || "single-image-relief";
  const lines = [
    `# ${SINGLE_IMAGE_3D_CONTRACT}`,
    "# Relative 2.5D relief; not metric geometry and no hidden surfaces.",
    `o ${safeName}`,
  ];
  for (let index = 0; index < mesh.vertexCount; index += 1) {
    const positionOffset = index * 3;
    lines.push(`v ${fixed(mesh.positions[positionOffset])} ${fixed(mesh.positions[positionOffset + 1])} ${fixed(mesh.positions[positionOffset + 2])} ${fixed(mesh.colors[positionOffset])} ${fixed(mesh.colors[positionOffset + 1])} ${fixed(mesh.colors[positionOffset + 2])}`);
  }
  for (let index = 0; index < mesh.vertexCount; index += 1) {
    const offset = index * 2;
    lines.push(`vt ${fixed(mesh.uvs[offset])} ${fixed(mesh.uvs[offset + 1])}`);
  }
  for (let index = 0; index < mesh.vertexCount; index += 1) {
    const offset = index * 3;
    lines.push(`vn ${fixed(mesh.normals[offset])} ${fixed(mesh.normals[offset + 1])} ${fixed(mesh.normals[offset + 2])}`);
  }
  lines.push("s 1");
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index] + 1;
    const b = mesh.indices[index + 1] + 1;
    const c = mesh.indices[index + 2] + 1;
    lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
  }
  return `${lines.join("\n")}\n`;
}

const HUMANOID_JOINT_PRESET = Object.freeze([
  { slot: "root", name: "Root", parent: null, u: 0.5, v: 0.66 },
  { slot: "hips", name: "Hips", parent: "root", u: 0.5, v: 0.58 },
  { slot: "spine", name: "Spine", parent: "hips", u: 0.5, v: 0.49 },
  { slot: "chest", name: "Chest", parent: "spine", u: 0.5, v: 0.38 },
  { slot: "neck", name: "Neck", parent: "chest", u: 0.5, v: 0.27 },
  { slot: "head", name: "Head", parent: "neck", u: 0.5, v: 0.16 },
  { slot: "leftShoulder", name: "LeftShoulder", parent: "chest", u: 0.59, v: 0.31 },
  { slot: "leftUpperArm", name: "LeftUpperArm", parent: "leftShoulder", u: 0.68, v: 0.37 },
  { slot: "leftLowerArm", name: "LeftLowerArm", parent: "leftUpperArm", u: 0.76, v: 0.49 },
  { slot: "leftHand", name: "LeftHand", parent: "leftLowerArm", u: 0.81, v: 0.61 },
  { slot: "rightShoulder", name: "RightShoulder", parent: "chest", u: 0.41, v: 0.31 },
  { slot: "rightUpperArm", name: "RightUpperArm", parent: "rightShoulder", u: 0.32, v: 0.37 },
  { slot: "rightLowerArm", name: "RightLowerArm", parent: "rightUpperArm", u: 0.24, v: 0.49 },
  { slot: "rightHand", name: "RightHand", parent: "rightLowerArm", u: 0.19, v: 0.61 },
  { slot: "leftUpperLeg", name: "LeftUpperLeg", parent: "hips", u: 0.56, v: 0.61 },
  { slot: "leftLowerLeg", name: "LeftLowerLeg", parent: "leftUpperLeg", u: 0.57, v: 0.78 },
  { slot: "leftFoot", name: "LeftFoot", parent: "leftLowerLeg", u: 0.58, v: 0.93 },
  { slot: "leftToe", name: "LeftToe", parent: "leftFoot", u: 0.64, v: 0.96 },
  { slot: "rightUpperLeg", name: "RightUpperLeg", parent: "hips", u: 0.44, v: 0.61 },
  { slot: "rightLowerLeg", name: "RightLowerLeg", parent: "rightUpperLeg", u: 0.43, v: 0.78 },
  { slot: "rightFoot", name: "RightFoot", parent: "rightLowerLeg", u: 0.42, v: 0.93 },
  { slot: "rightToe", name: "RightToe", parent: "rightFoot", u: 0.36, v: 0.96 },
]);

export function createHumanoidRigDraft(overrides = {}) {
  const bySlot = new Map((Array.isArray(overrides.joints) ? overrides.joints : []).map((joint) => [joint.slot, joint]));
  return {
    schemaVersion: 1,
    kind: "blockout-studio-rig-draft",
    preset: "front-humanoid-22",
    coordinateSpace: "image-normalized-top-left",
    contract: SINGLE_IMAGE_3D_CONTRACT,
    joints: HUMANOID_JOINT_PRESET.map((preset) => {
      const saved = bySlot.get(preset.slot);
      return {
        ...preset,
        u: clamp(finite(saved?.u, preset.u), 0, 1),
        v: clamp(finite(saved?.v, preset.v), 0, 1),
      };
    }),
  };
}

export function moveRigDraftJoint(draft, slot, u, v) {
  if (!draft?.joints?.some((joint) => joint.slot === slot)) return draft;
  return {
    ...draft,
    joints: draft.joints.map((joint) => joint.slot === slot
      ? { ...joint, u: clamp(finite(u, joint.u), 0, 1), v: clamp(finite(v, joint.v), 0, 1) }
      : { ...joint }),
  };
}

export function sampleReliefPosition(mesh, u, v) {
  const [columns, rows] = mesh.gridSize;
  const column = clamp(Math.round(clamp(u, 0, 1) * (columns - 1)), 0, columns - 1);
  const row = clamp(Math.round(clamp(v, 0, 1) * (rows - 1)), 0, rows - 1);
  const offset = (row * columns + column) * 3;
  return [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2] + 0.004];
}

const squaredDistanceToSegment2d = (point, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-10) return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  const x = start[0] + dx * t;
  const y = start[1] + dy * t;
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
};

const buildSkinAttributes = (mesh, joints, jointPositions) => {
  const skinIndices = new Uint16Array(mesh.vertexCount * 4);
  const skinWeights = new Float32Array(mesh.vertexCount * 4);
  const slotToIndex = new Map(joints.map((joint, index) => [joint.slot, index]));
  const segments = joints.map((joint, index) => {
    const parentIndex = joint.parent == null ? index : slotToIndex.get(joint.parent);
    return { index, start: jointPositions[parentIndex] ?? jointPositions[index], end: jointPositions[index] };
  });
  const sigmaSquared = Math.max(0.0025, Math.min(mesh.planeSize[0], mesh.planeSize[1]) ** 2 * 0.018);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const point = [mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1]];
    const ranked = segments
      .map((segment) => ({
        index: segment.index,
        distance: squaredDistanceToSegment2d(point, segment.start, segment.end),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 4);
    const rawWeights = ranked.map((entry) => Math.exp(-entry.distance / sigmaSquared) + 1e-6);
    const total = rawWeights.reduce((sum, value) => sum + value, 0);
    for (let influence = 0; influence < 4; influence += 1) {
      skinIndices[vertex * 4 + influence] = ranked[influence]?.index ?? 0;
      skinWeights[vertex * 4 + influence] = (rawWeights[influence] ?? 0) / total;
    }
  }
  return { skinIndices, skinWeights };
};

export function buildRiggedReliefScene(mesh, rigDraft = createHumanoidRigDraft()) {
  if (!mesh?.positions || !mesh?.indices) throw new Error("请先生成单图 OBJ 网格。");
  const draft = createHumanoidRigDraft(rigDraft);
  const jointPositions = draft.joints.map((joint) => sampleReliefPosition(mesh, joint.u, joint.v));
  const { skinIndices, skinWeights } = buildSkinAttributes(mesh, draft.joints, jointPositions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions.slice(), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals.slice(), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(mesh.colors.slice(), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs.slice(), 2));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices.slice(), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.name = "SingleImageRelief";
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  const bones = draft.joints.map((joint) => {
    const bone = new THREE.Bone();
    bone.name = joint.name;
    return bone;
  });
  const bySlot = new Map(draft.joints.map((joint, index) => [joint.slot, index]));
  draft.joints.forEach((joint, index) => {
    const position = jointPositions[index];
    if (joint.parent == null) {
      bones[index].position.fromArray(position);
      skinnedMesh.add(bones[index]);
      return;
    }
    const parentIndex = bySlot.get(joint.parent);
    const parentPosition = jointPositions[parentIndex];
    bones[index].position.set(
      position[0] - parentPosition[0],
      position[1] - parentPosition[1],
      position[2] - parentPosition[2],
    );
    bones[parentIndex].add(bones[index]);
  });
  const skeleton = new THREE.Skeleton(bones);
  skinnedMesh.bind(skeleton);
  skeleton.pose();
  skinnedMesh.updateMatrixWorld(true);
  const scene = new THREE.Group();
  scene.name = "Single image rigged relief";
  scene.userData = {
    contract: SINGLE_IMAGE_3D_CONTRACT,
    relativeDepth: true,
    metricScale: false,
    hiddenSurfacesRecovered: false,
    rigPreset: draft.preset,
  };
  scene.add(skinnedMesh);
  return {
    scene,
    mesh: skinnedMesh,
    skeleton,
    draft,
    report: {
      boneCount: bones.length,
      boneNames: bones.map((bone) => bone.name),
      skinVertexCount: mesh.vertexCount,
      mapping: Object.fromEntries(draft.joints.map((joint) => [joint.slot, joint.name])),
    },
  };
}

const disposeRiggedScene = (scene) => scene?.traverse?.((node) => {
  node.geometry?.dispose?.();
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  materials.filter(Boolean).forEach((material) => material.dispose?.());
});

export async function exportRiggedReliefGlb(mesh, rigDraft, { exporterFactory } = {}) {
  const built = buildRiggedReliefScene(mesh, rigDraft);
  try {
    const exporter = exporterFactory
      ? exporterFactory()
      : new (await import("three/examples/jsm/exporters/GLTFExporter.js")).GLTFExporter();
    const buffer = await exporter.parseAsync(built.scene, {
      binary: true,
      onlyVisible: true,
      trs: true,
      truncateDrawRange: true,
    });
    if (!(buffer instanceof ArrayBuffer)) throw new Error("GLB 导出器没有返回二进制容器。");
    return { buffer, report: built.report, draft: built.draft };
  } finally {
    disposeRiggedScene(built.scene);
  }
}

export function serializeRigDraft(rigDraft, mesh, metadata = {}) {
  const draft = createHumanoidRigDraft(rigDraft);
  return `${JSON.stringify({
    ...draft,
    source: {
      label: String(metadata.label ?? "single-image").slice(0, 120),
      imageSize: mesh?.imageSize ?? null,
      depthModel: metadata.depthModel ?? null,
      depthBackend: metadata.depthBackend ?? null,
      relativeDepth: true,
      metricScale: false,
    },
    mesh: mesh ? {
      gridSize: mesh.gridSize,
      vertexCount: mesh.vertexCount,
      faceCount: mesh.faceCount,
      settings: mesh.settings,
    } : null,
    appliedToModel: metadata.appliedToModel === true,
  }, null, 2)}\n`;
}
