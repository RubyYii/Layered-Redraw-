export const MULTI_VIEW_GRAY_CONTRACT = "canonical-silhouette-visual-hull-v1";

export const CANONICAL_VIEW_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "front", label: "正面", family: "xy", required: true }),
  Object.freeze({ id: "back", label: "背面", family: "xy", required: false }),
  Object.freeze({ id: "left", label: "左侧", family: "zy", required: false }),
  Object.freeze({ id: "right", label: "右侧", family: "zy", required: false }),
  Object.freeze({ id: "top", label: "顶部", family: "xz", required: false }),
  Object.freeze({ id: "bottom", label: "底部", family: "xz", required: false }),
]);

const VIEW_BY_ID = new Map(CANONICAL_VIEW_DEFINITIONS.map((view) => [view.id, view]));
const MAX_GRID_VOXELS = 1_500_000;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const assertPixelBuffer = (pixels, width, height) => {
  if (!ArrayBuffer.isView(pixels) || pixels.length !== width * height * 4) {
    throw new Error("轮廓像素缓冲区与图像尺寸不一致。");
  }
};

const median = (values, fallback = 0) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const maskBounds = (mask, width, height) => {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      count += 1;
    }
  }
  if (!count) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    count,
  };
};

const estimateCornerBackground = (pixels, width, height) => {
  const edge = Math.max(1, Math.min(24, Math.round(Math.min(width, height) * 0.06)));
  const red = [];
  const green = [];
  const blue = [];
  const corners = [
    [0, 0],
    [width - edge, 0],
    [0, height - edge],
    [width - edge, height - edge],
  ];
  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + edge; y += 1) {
      for (let x = startX; x < startX + edge; x += 1) {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] < 224) continue;
        red.push(pixels[offset]);
        green.push(pixels[offset + 1]);
        blue.push(pixels[offset + 2]);
      }
    }
  }
  return [median(red, 255), median(green, 255), median(blue, 255)].map(Math.round);
};

export function deriveSilhouetteMask({
  pixels,
  width,
  height,
  mode = "auto",
  threshold = 48,
  alphaCutoff = 24,
  invert = false,
} = {}) {
  const safeWidth = Math.round(finite(width));
  const safeHeight = Math.round(finite(height));
  if (safeWidth < 1 || safeHeight < 1) throw new Error("轮廓图像尺寸无效。");
  assertPixelBuffer(pixels, safeWidth, safeHeight);
  if (!["auto", "alpha", "background"].includes(mode)) throw new Error("未知的轮廓提取模式。");

  const cornerEdge = Math.max(1, Math.round(Math.min(safeWidth, safeHeight) * 0.06));
  let transparentPixels = 0;
  let transparentCornerPixels = 0;
  let cornerPixels = 0;
  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const transparent = pixels[(y * safeWidth + x) * 4 + 3] < 250;
      if (transparent) transparentPixels += 1;
      const corner = (x < cornerEdge || x >= safeWidth - cornerEdge)
        && (y < cornerEdge || y >= safeHeight - cornerEdge);
      if (!corner) continue;
      cornerPixels += 1;
      if (transparent) transparentCornerPixels += 1;
    }
  }
  const hasTransparency = transparentPixels / (safeWidth * safeHeight) >= 0.005
    && transparentCornerPixels / Math.max(1, cornerPixels) >= 0.25;
  const resolvedMode = mode === "auto" ? (hasTransparency ? "alpha" : "background") : mode;
  const backgroundRgb = estimateCornerBackground(pixels, safeWidth, safeHeight);
  const safeThreshold = clamp(finite(threshold, 48), 1, 441);
  const safeAlphaCutoff = clamp(Math.round(finite(alphaCutoff, 24)), 1, 254);
  const thresholdSquared = safeThreshold * safeThreshold;
  const mask = new Uint8Array(safeWidth * safeHeight);

  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const alphaForeground = pixels[offset + 3] >= safeAlphaCutoff;
    const redDelta = pixels[offset] - backgroundRgb[0];
    const greenDelta = pixels[offset + 1] - backgroundRgb[1];
    const blueDelta = pixels[offset + 2] - backgroundRgb[2];
    const colourForeground = redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta >= thresholdSquared;
    const foreground = resolvedMode === "alpha" ? alphaForeground : colourForeground;
    mask[index] = (invert ? !foreground : foreground) ? 1 : 0;
  }

  const bounds = maskBounds(mask, safeWidth, safeHeight);
  if (!bounds) throw new Error("当前设置没有提取到物体轮廓；请降低阈值或检查反相选项。");
  const coverage = bounds.count / mask.length;
  const warnings = [];
  if (coverage > 0.96) warnings.push("轮廓几乎覆盖整张图，背景可能未被分离。");
  if (bounds.left === 0 || bounds.top === 0 || bounds.right === safeWidth - 1 || bounds.bottom === safeHeight - 1) {
    warnings.push("轮廓触碰画面边缘，生成的灰模可能被截断。");
  }
  return {
    width: safeWidth,
    height: safeHeight,
    mask,
    bounds,
    coverage,
    mode: resolvedMode,
    threshold: safeThreshold,
    alphaCutoff: safeAlphaCutoff,
    invert: Boolean(invert),
    backgroundRgb,
    warnings,
  };
}

export function silhouetteMaskToRgba({ pixels, silhouette }) {
  const { width, height, mask } = silhouette ?? {};
  assertPixelBuffer(pixels, width, height);
  if (!ArrayBuffer.isView(mask) || mask.length !== width * height) {
    throw new Error("轮廓遮罩与图像尺寸不一致。");
  }
  const output = new Uint8ClampedArray(pixels.length);
  const isEdge = (x, y) => {
    const value = mask[y * width + x];
    if (!value) return false;
    return x === 0 || y === 0 || x === width - 1 || y === height - 1
      || !mask[y * width + x - 1]
      || !mask[y * width + x + 1]
      || !mask[(y - 1) * width + x]
      || !mask[(y + 1) * width + x];
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const foreground = Boolean(mask[index]);
      const edge = isEdge(x, y);
      const mix = edge ? 0.78 : foreground ? 0.3 : 0;
      const target = edge ? [255, 50, 145] : [255, 0, 127];
      const shade = foreground ? 1 : 0.2;
      output[offset] = Math.round(pixels[offset] * shade * (1 - mix) + target[0] * mix);
      output[offset + 1] = Math.round(pixels[offset + 1] * shade * (1 - mix) + target[1] * mix);
      output[offset + 2] = Math.round(pixels[offset + 2] * shade * (1 - mix) + target[2] * mix);
      output[offset + 3] = 255;
    }
  }
  return output;
}

const quantile = (sorted, fraction) => {
  if (!sorted.length) return NaN;
  const position = clamp(fraction, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const mix = position - lower;
  return sorted[lower] * (1 - mix) + sorted[upper] * mix;
};

export function normalizeRelativeDepthForSilhouette({
  depth,
  width,
  height,
  mask,
  invert = false,
  smoothingRadius = 1,
} = {}) {
  const safeWidth = Math.round(finite(width));
  const safeHeight = Math.round(finite(height));
  if (safeWidth < 1 || safeHeight < 1 || !ArrayBuffer.isView(depth) || depth.length !== safeWidth * safeHeight) {
    throw new Error("相对深度缓冲区与视角尺寸不一致。");
  }
  if (!ArrayBuffer.isView(mask) || mask.length !== depth.length) {
    throw new Error("相对深度缺少匹配的轮廓遮罩。");
  }
  const samples = [];
  const stride = Math.max(1, Math.floor(depth.length / 80_000));
  for (let index = 0; index < depth.length; index += stride) {
    if (!mask[index]) continue;
    const value = clamp(finite(depth[index], 0.5), 0, 1);
    samples.push(invert ? 1 - value : value);
  }
  if (samples.length < 4) throw new Error("轮廓内没有足够的相对深度样本。");
  samples.sort((left, right) => left - right);
  const lower = quantile(samples, 0.05);
  const upper = quantile(samples, 0.95);
  const range = upper - lower;
  if (!Number.isFinite(range) || range < 0.02) {
    return {
      width: safeWidth,
      height: safeHeight,
      values: new Float32Array(depth.length).fill(1),
      sourceRange: [lower, upper],
      usable: false,
      smoothingRadius: 0,
      warnings: ["相对深度变化过小，已自动降级为纯轮廓约束。"],
    };
  }
  const normalized = new Float32Array(depth.length);
  for (let index = 0; index < depth.length; index += 1) {
    if (!mask[index]) {
      normalized[index] = 1;
      continue;
    }
    const raw = clamp(finite(depth[index], lower), 0, 1);
    const oriented = invert ? 1 - raw : raw;
    normalized[index] = clamp((oriented - lower) / range, 0, 1);
  }
  const radius = clamp(Math.round(finite(smoothingRadius, 1)), 0, 2);
  if (!radius) {
    return {
      width: safeWidth,
      height: safeHeight,
      values: normalized,
      sourceRange: [lower, upper],
      usable: true,
      smoothingRadius: 0,
      warnings: [],
    };
  }
  const smoothed = new Float32Array(normalized.length);
  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const index = y * safeWidth + x;
      if (!mask[index]) {
        smoothed[index] = 1;
        continue;
      }
      let total = 0;
      let count = 0;
      for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(safeHeight - 1, y + radius); sampleY += 1) {
        for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(safeWidth - 1, x + radius); sampleX += 1) {
          const sampleIndex = sampleY * safeWidth + sampleX;
          if (!mask[sampleIndex]) continue;
          total += normalized[sampleIndex];
          count += 1;
        }
      }
      smoothed[index] = count ? total / count : normalized[index];
    }
  }
  return {
    width: safeWidth,
    height: safeHeight,
    values: smoothed,
    sourceRange: [lower, upper],
    usable: true,
    smoothingRadius: radius,
    warnings: [],
  };
}

const normalizeView = (view) => {
  const definition = VIEW_BY_ID.get(String(view?.id ?? ""));
  if (!definition) throw new Error(`未知的规范视角：${view?.id ?? "空"}`);
  const width = Math.round(finite(view.width));
  const height = Math.round(finite(view.height));
  if (width < 1 || height < 1 || !ArrayBuffer.isView(view.mask) || view.mask.length !== width * height) {
    throw new Error(`${definition.label}轮廓数据无效。`);
  }
  const bounds = view.bounds ?? maskBounds(view.mask, width, height);
  if (!bounds) throw new Error(`${definition.label}没有可用轮廓。`);
  if (bounds.count < 4) throw new Error(`${definition.label}轮廓过小，无法形成可靠体积。`);
  if (
    view.depth
    && (
      Math.round(finite(view.depth.width)) !== width
      || Math.round(finite(view.depth.height)) !== height
      || !ArrayBuffer.isView(view.depth.depth)
      || view.depth.depth.length !== width * height
    )
  ) throw new Error(`${definition.label}相对深度与处理后照片尺寸不一致。`);
  return { ...view, id: definition.id, family: definition.family, width, height, bounds };
};

export function validateCanonicalViews(views, { requireGuidedPair = false } = {}) {
  const normalized = (views ?? []).map(normalizeView);
  const ids = new Set();
  for (const view of normalized) {
    if (ids.has(view.id)) throw new Error(`规范视角重复：${view.id}`);
    ids.add(view.id);
  }
  const families = new Set(normalized.map((view) => view.family));
  if (normalized.length < 2 || families.size < 2) {
    throw new Error("至少需要两个互相正交的规范视角。");
  }
  if (requireGuidedPair && (!ids.has("front") || (!ids.has("left") && !ids.has("right")))) {
    throw new Error("引导流程至少需要正面和一个侧面（左侧或右侧）。");
  }
  return normalized.sort((left, right) => (
    CANONICAL_VIEW_DEFINITIONS.findIndex((entry) => entry.id === left.id)
    - CANONICAL_VIEW_DEFINITIONS.findIndex((entry) => entry.id === right.id)
  ));
}

const boundsAspect = (view) => view.bounds.width / Math.max(1, view.bounds.height);

const inferWorldRatios = (views) => {
  const xy = views.filter((view) => view.family === "xy").map(boundsAspect);
  const zy = views.filter((view) => view.family === "zy").map(boundsAspect);
  const xz = views.filter((view) => view.family === "xz").map(boundsAspect);
  let x = median(xy, NaN);
  let z = median(zy, NaN);
  const topRatio = median(xz, NaN);
  if (!Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(topRatio)) x = z * topRatio;
  if (!Number.isFinite(z) && Number.isFinite(x) && Number.isFinite(topRatio)) z = x / Math.max(0.001, topRatio);
  return {
    x: clamp(finite(x, 1), 0.2, 3),
    y: 1,
    z: clamp(finite(z, 1), 0.2, 3),
  };
};

const sampleViewPixel = (view, u, v, padding) => {
  const { bounds } = view;
  const padX = bounds.width * padding;
  const padY = bounds.height * padding;
  const left = clamp(bounds.left - padX, 0, view.width - 1);
  const right = clamp(bounds.right + padX, 0, view.width - 1);
  const top = clamp(bounds.top - padY, 0, view.height - 1);
  const bottom = clamp(bounds.bottom + padY, 0, view.height - 1);
  const x = clamp(Math.floor(left + clamp(u, 0, 0.999999) * (right - left + 1)), 0, view.width - 1);
  const y = clamp(Math.floor(top + clamp(v, 0, 0.999999) * (bottom - top + 1)), 0, view.height - 1);
  return { x, y, index: y * view.width + x };
};

const sampleView = (view, u, v, padding) => Boolean(view.mask[sampleViewPixel(view, u, v, padding).index]);

export function projectVoxelToView(viewId, x, y, z) {
  if (!VIEW_BY_ID.has(viewId)) throw new Error(`未知的规范视角：${viewId}`);
  return {
    front: [x, 1 - y],
    back: [1 - x, 1 - y],
    left: [z, 1 - y],
    right: [1 - z, 1 - y],
    top: [x, z],
    bottom: [x, 1 - z],
  }[viewId];
}

export function projectVoxelDepthCoordinate(viewId, x, y, z) {
  if (!VIEW_BY_ID.has(viewId)) throw new Error(`未知的规范视角：${viewId}`);
  return {
    front: z,
    back: 1 - z,
    left: 1 - x,
    right: x,
    top: y,
    bottom: 1 - y,
  }[viewId];
}

const addQuad = (positions, normals, indices, corners, normal) => {
  const offset = positions.length / 3;
  for (const corner of corners) {
    positions.push(...corner);
    normals.push(...normal);
  }
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
};

export function buildVisualHullMeshData({
  views,
  resolution = 40,
  padding = 0,
  depthInfluence = 0,
  depthTolerance = 0.08,
} = {}) {
  const normalizedViews = validateCanonicalViews(views);
  const safeResolution = clamp(Math.round(finite(resolution, 40)), 12, 72);
  const safePadding = clamp(finite(padding, 0), 0, 0.12);
  const safeDepthInfluence = clamp(finite(depthInfluence, 0), 0, 1);
  const safeDepthTolerance = clamp(finite(depthTolerance, 0.08), 0, 0.3);
  const depthWarnings = [];
  const depthViews = normalizedViews.map((view) => {
    if (!view.depth || view.depthEnabled === false || safeDepthInfluence <= 0) return null;
    const evidence = normalizeRelativeDepthForSilhouette({
      depth: view.depth.depth,
      width: view.width,
      height: view.height,
      mask: view.mask,
      invert: Boolean(view.depth.inverted),
      smoothingRadius: 1,
    });
    if (!evidence.usable) {
      depthWarnings.push(...evidence.warnings.map((warning) => `${VIEW_BY_ID.get(view.id).label}：${warning}`));
      return null;
    }
    return { view, evidence };
  }).filter(Boolean);
  const ratios = inferWorldRatios(normalizedViews);
  const dimensions = {
    x: clamp(Math.round(safeResolution * ratios.x), 6, 144),
    y: safeResolution,
    z: clamp(Math.round(safeResolution * ratios.z), 6, 144),
  };
  const totalVoxels = dimensions.x * dimensions.y * dimensions.z;
  if (totalVoxels > MAX_GRID_VOXELS) {
    throw new Error("当前物体比例与网格精度会产生过多体素；请降低精度。");
  }
  const occupancy = new Uint8Array(totalVoxels);
  const offsetFor = (x, y, z) => x + dimensions.x * (y + dimensions.y * z);
  const depthRejectedVoxelCounts = Object.fromEntries(depthViews.map(({ view }) => [view.id, 0]));
  let voxelCount = 0;
  let visualHullVoxelCount = 0;
  let depthConflictVoxelCount = 0;

  for (let z = 0; z < dimensions.z; z += 1) {
    const zUnit = (z + 0.5) / dimensions.z;
    for (let y = 0; y < dimensions.y; y += 1) {
      const yUnit = (y + 0.5) / dimensions.y;
      for (let x = 0; x < dimensions.x; x += 1) {
        const xUnit = (x + 0.5) / dimensions.x;
        const insideSilhouettes = normalizedViews.every((view) => {
          const [u, v] = projectVoxelToView(view.id, xUnit, yUnit, zUnit);
          return sampleView(view, u, v, safePadding);
        });
        if (!insideSilhouettes) continue;
        visualHullVoxelCount += 1;
        let depthRejectionCount = 0;
        for (const { view, evidence } of depthViews) {
          const [u, v] = projectVoxelToView(view.id, xUnit, yUnit, zUnit);
          const pixel = sampleViewPixel(view, u, v, safePadding);
          const predictedSurface = evidence.values[pixel.index];
          const visibleSurfaceCeiling = 1 - safeDepthInfluence * (1 - predictedSurface);
          const rayDepth = projectVoxelDepthCoordinate(view.id, xUnit, yUnit, zUnit);
          if (rayDepth <= visibleSurfaceCeiling + safeDepthTolerance) continue;
          depthRejectedVoxelCounts[view.id] += 1;
          depthRejectionCount += 1;
        }
        if (depthRejectionCount) {
          if (depthRejectionCount > 1) depthConflictVoxelCount += 1;
          continue;
        }
        occupancy[offsetFor(x, y, z)] = 1;
        voxelCount += 1;
      }
    }
  }
  if (!voxelCount) {
    throw new Error(depthViews.length
      ? "相对深度约束移除了全部共同体积；请检查深度方向，或降低深度影响并提高容差。"
      : "这些轮廓没有形成共同体积；请检查视角标签、反相设置与物体对齐。");
  }
  const depthCarvedVoxelCount = visualHullVoxelCount - voxelCount;
  const depthCarvedFraction = depthCarvedVoxelCount / Math.max(1, visualHullVoxelCount);
  if (depthViews.length && depthCarvedFraction >= 0.5) {
    depthWarnings.push("深度约束削减了至少一半的纯轮廓体积；请逐视角检查近／远方向，并与纯轮廓基线比较。");
  }

  const positions = [];
  const normals = [];
  const indices = [];
  const dx = (ratios.x * 2) / dimensions.x;
  const dy = 2 / dimensions.y;
  const dz = (ratios.z * 2) / dimensions.z;
  const occupied = (x, y, z) => (
    x >= 0 && y >= 0 && z >= 0
    && x < dimensions.x && y < dimensions.y && z < dimensions.z
    && occupancy[offsetFor(x, y, z)] === 1
  );

  for (let z = 0; z < dimensions.z; z += 1) {
    for (let y = 0; y < dimensions.y; y += 1) {
      for (let x = 0; x < dimensions.x; x += 1) {
        if (!occupied(x, y, z)) continue;
        const x0 = -ratios.x + x * dx;
        const x1 = x0 + dx;
        const y0 = -1 + y * dy;
        const y1 = y0 + dy;
        const z0 = -ratios.z + z * dz;
        const z1 = z0 + dz;
        if (!occupied(x - 1, y, z)) addQuad(positions, normals, indices, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0]);
        if (!occupied(x + 1, y, z)) addQuad(positions, normals, indices, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
        if (!occupied(x, y - 1, z)) addQuad(positions, normals, indices, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
        if (!occupied(x, y + 1, z)) addQuad(positions, normals, indices, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
        if (!occupied(x, y, z - 1)) addQuad(positions, normals, indices, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
        if (!occupied(x, y, z + 1)) addQuad(positions, normals, indices, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
      }
    }
  }

  return {
    contract: MULTI_VIEW_GRAY_CONTRACT,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    occupancy,
    ratios,
    dimensions,
    resolution: safeResolution,
    padding: safePadding,
    depthInfluence: safeDepthInfluence,
    depthTolerance: safeDepthTolerance,
    depthViewIds: depthViews.map(({ view }) => view.id),
    depthWarnings,
    depthRejectedVoxelCounts,
    depthConflictVoxelCount,
    viewIds: normalizedViews.map((view) => view.id),
    voxelCount,
    visualHullVoxelCount,
    depthCarvedVoxelCount,
    depthCarvedFraction,
    solidFraction: voxelCount / totalVoxels,
    surfaceQuadCount: indices.length / 6,
    vertexCount: positions.length / 3,
    faceCount: indices.length / 3,
  };
}

const safeObjName = (value) => String(value ?? "multi-view-gray")
  .replace(/[^a-z0-9_.-]+/giu, "-")
  .replace(/^-+|-+$/gu, "")
  .slice(0, 96) || "multi-view-gray";

export function serializeVisualHullObj(mesh, { name = "multi-view-gray" } = {}) {
  if (!mesh?.positions?.length || !mesh?.normals?.length || !mesh?.indices?.length) {
    throw new Error("没有可序列化的多视角灰模网格。");
  }
  const lines = [
    `# ${MULTI_VIEW_GRAY_CONTRACT}`,
    "# Neutral visual-hull blockout; no texture, metric scale, or hidden-surface recovery.",
    `o ${safeObjName(name)}`,
  ];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const values = [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]];
    if (values.some((value) => !Number.isFinite(value))) throw new Error("灰模网格包含无效顶点。");
    lines.push(`v ${values.map((value) => value.toFixed(6)).join(" ")} 0.560784 0.560784 0.576471`);
  }
  for (let index = 0; index < mesh.normals.length; index += 3) {
    lines.push(`vn ${mesh.normals[index].toFixed(6)} ${mesh.normals[index + 1].toFixed(6)} ${mesh.normals[index + 2].toFixed(6)}`);
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const face = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]]
      .map((value) => value + 1)
      .map((value) => `${value}//${value}`);
    lines.push(`f ${face.join(" ")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function serializeMultiViewRecipe({ views, mesh, name = "multi-view-gray", interactionTrace = [] } = {}) {
  const normalizedViews = validateCanonicalViews(views);
  const safeTrace = (Array.isArray(interactionTrace) ? interactionTrace : []).slice(-2_000).map((entry, index) => ({
    sequence: Math.max(1, Math.round(finite(entry?.sequence, index + 1))),
    elapsedMs: Math.max(0, Math.round(finite(entry?.elapsedMs, 0))),
    action: String(entry?.action ?? "unknown").replace(/[^a-z0-9_.-]+/giu, "-").slice(0, 64) || "unknown",
    ...(VIEW_BY_ID.has(entry?.viewId) ? { viewId: entry.viewId } : {}),
    ...(Number.isFinite(Number(entry?.value)) ? { value: Number(entry.value) } : {}),
  }));
  const document = {
    contract: MULTI_VIEW_GRAY_CONTRACT,
    name: safeObjName(name),
    method: "deterministic canonical silhouette intersection with optional relative-depth visible-surface ceilings",
    coordinateSystem: {
      up: "+Y",
      frontCamera: "+Z looking toward -Z",
      rightCamera: "+X looking toward -X",
      alignment: "per-view tight silhouette bounds with shared upright height",
    },
    settings: {
      resolution: mesh?.resolution ?? 40,
      padding: mesh?.padding ?? 0,
      depthInfluence: mesh?.depthInfluence ?? 0,
      depthTolerance: mesh?.depthTolerance ?? 0.08,
    },
    views: normalizedViews.map((view) => ({
      id: view.id,
      role: `view-${view.id}`,
      sourceName: String(view.sourceName ?? `view-${view.id}`).slice(0, 120),
      originalSize: Array.isArray(view.originalSize) ? view.originalSize.slice(0, 2) : [view.width, view.height],
      processedSize: [view.width, view.height],
      silhouette: {
        mode: view.mode ?? "background",
        threshold: finite(view.threshold, 48),
        alphaCutoff: Math.round(finite(view.alphaCutoff, 24)),
        invert: Boolean(view.invert),
        coverage: Number(finite(view.coverage, view.bounds.count / (view.width * view.height)).toFixed(6)),
      },
      ...(view.depth ? {
        depth: {
          role: `depth-${view.id}`,
          enabled: view.depthEnabled !== false,
          inverted: Boolean(view.depth.inverted),
          backend: String(view.depth.backend ?? "unknown").slice(0, 64),
          modelId: String(view.depth.modelId ?? "unknown/relative-depth").slice(0, 160),
          dtype: String(view.depth.dtype ?? "float32").slice(0, 32),
          interpretation: "near-white relative depth; per-view robust normalization only",
        },
      } : {}),
    })),
    result: mesh ? {
      dimensions: mesh.dimensions,
      ratios: mesh.ratios,
      voxelCount: mesh.voxelCount,
      visualHullVoxelCount: mesh.visualHullVoxelCount,
      depthCarvedVoxelCount: mesh.depthCarvedVoxelCount,
      depthCarvedFraction: Number(mesh.depthCarvedFraction.toFixed(6)),
      depthViewIds: mesh.depthViewIds,
      depthWarnings: mesh.depthWarnings,
      depthRejectedVoxelCounts: mesh.depthRejectedVoxelCounts,
      depthConflictVoxelCount: mesh.depthConflictVoxelCount,
      solidFraction: Number(mesh.solidFraction.toFixed(6)),
      vertexCount: mesh.vertexCount,
      faceCount: mesh.faceCount,
    } : null,
    interactionTrace: safeTrace,
    capabilityBoundary: [
      "visual-hull blockout only",
      "no texture fusion",
      "no metric scale",
      "no camera calibration",
      "relative depth is normalized per view and never aligned as metric cross-view depth",
      "no hidden concavity recovery",
      "no production topology guarantee",
    ],
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseMultiViewRecipe(text) {
  let document;
  try {
    document = JSON.parse(String(text ?? ""));
  } catch {
    throw new Error("多视角配方不是有效 JSON。");
  }
  if (document?.contract !== MULTI_VIEW_GRAY_CONTRACT || !Array.isArray(document.views)) {
    throw new Error("多视角配方合同不兼容。");
  }
  const seen = new Set();
  const views = document.views.map((view) => {
    const id = String(view?.id ?? "");
    if (!VIEW_BY_ID.has(id) || seen.has(id)) throw new Error("多视角配方包含无效或重复视角。");
    seen.add(id);
    return {
      id,
      role: `view-${id}`,
      sourceName: String(view.sourceName ?? `view-${id}`).slice(0, 120),
      mode: ["alpha", "background"].includes(view?.silhouette?.mode) ? view.silhouette.mode : "auto",
      threshold: clamp(finite(view?.silhouette?.threshold, 48), 1, 441),
      alphaCutoff: clamp(Math.round(finite(view?.silhouette?.alphaCutoff, 24)), 1, 254),
      invert: Boolean(view?.silhouette?.invert),
      depth: view?.depth ? {
        role: `depth-${id}`,
        enabled: view.depth.enabled !== false,
        inverted: Boolean(view.depth.inverted),
        backend: String(view.depth.backend ?? "restored-package").slice(0, 64),
        modelId: String(view.depth.modelId ?? "restored/relative-depth").slice(0, 160),
        dtype: String(view.depth.dtype ?? "uint8-preview").slice(0, 32),
      } : null,
    };
  });
  const ids = new Set(views.map((view) => view.id));
  if (ids.size < 2 || new Set(views.map((view) => VIEW_BY_ID.get(view.id).family)).size < 2) {
    throw new Error("多视角配方缺少正交视角。");
  }
  return {
    contract: MULTI_VIEW_GRAY_CONTRACT,
    name: safeObjName(document.name),
    settings: {
      resolution: clamp(Math.round(finite(document?.settings?.resolution, 40)), 12, 72),
      padding: clamp(finite(document?.settings?.padding, 0), 0, 0.12),
      depthInfluence: clamp(finite(document?.settings?.depthInfluence, 0), 0, 1),
      depthTolerance: clamp(finite(document?.settings?.depthTolerance, 0.08), 0, 0.3),
    },
    views,
    interactionTrace: (Array.isArray(document.interactionTrace) ? document.interactionTrace : []).slice(-2_000).map((entry, index) => ({
      sequence: Math.max(1, Math.round(finite(entry?.sequence, index + 1))),
      elapsedMs: Math.max(0, Math.round(finite(entry?.elapsedMs, 0))),
      action: String(entry?.action ?? "unknown").replace(/[^a-z0-9_.-]+/giu, "-").slice(0, 64) || "unknown",
      ...(VIEW_BY_ID.has(entry?.viewId) ? { viewId: entry.viewId } : {}),
      ...(Number.isFinite(Number(entry?.value)) ? { value: Number(entry.value) } : {}),
    })),
  };
}
