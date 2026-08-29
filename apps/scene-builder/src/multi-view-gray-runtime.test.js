import { describe, expect, it } from "vitest";
import {
  MULTI_VIEW_GRAY_CONTRACT,
  buildVisualHullMeshData,
  deriveSilhouetteMask,
  normalizeRelativeDepthForSilhouette,
  parseMultiViewRecipe,
  projectVoxelDepthCoordinate,
  projectVoxelToView,
  serializeMultiViewRecipe,
  serializeVisualHullObj,
  validateCanonicalViews,
} from "./multi-view-gray-runtime.js";

const rgba = (width, height, foreground) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const active = foreground(x, y);
      pixels[offset] = active ? 40 : 245;
      pixels[offset + 1] = active ? 70 : 245;
      pixels[offset + 2] = active ? 110 : 245;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
};

const viewFixture = (id, width = 12, height = 16, inset = 3) => {
  const silhouette = deriveSilhouetteMask({
    pixels: rgba(width, height, (x, y) => x >= inset && x < width - inset && y >= 2 && y < height - 2),
    width,
    height,
    threshold: 50,
  });
  return { id, sourceName: `${id}.png`, originalSize: [width, height], ...silhouette };
};

const withDepth = (view, valueForPixel, { inverted = false, enabled = true } = {}) => {
  const depth = new Float32Array(view.width * view.height);
  for (let y = 0; y < view.height; y += 1) {
    for (let x = 0; x < view.width; x += 1) depth[y * view.width + x] = valueForPixel(x, y, view);
  }
  return {
    ...view,
    depth: {
      width: view.width,
      height: view.height,
      depth,
      inverted,
      backend: "test-fixture",
      modelId: "deterministic/relative-depth-test",
      dtype: "float32",
    },
    depthEnabled: enabled,
  };
};

describe("multi-view gray visual hull", () => {
  it("extracts a deterministic foreground against the median corner background", () => {
    const first = deriveSilhouetteMask({
      pixels: rgba(10, 10, (x, y) => x >= 2 && x <= 7 && y >= 3 && y <= 8),
      width: 10,
      height: 10,
      threshold: 40,
    });
    const second = deriveSilhouetteMask({
      pixels: rgba(10, 10, (x, y) => x >= 2 && x <= 7 && y >= 3 && y <= 8),
      width: 10,
      height: 10,
      threshold: 40,
    });

    expect(first.mode).toBe("background");
    expect(first.bounds).toMatchObject({ left: 2, right: 7, top: 3, bottom: 8, count: 36 });
    expect([...first.mask]).toEqual([...second.mask]);
  });

  it("uses alpha only when transparency is substantial and reaches the image corners", () => {
    const width = 10;
    const height = 10;
    const pixels = rgba(width, height, (x, y) => x >= 3 && x <= 6 && y >= 2 && y <= 7);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        pixels[(y * width + x) * 4 + 3] = x >= 3 && x <= 6 && y >= 2 && y <= 7 ? 255 : 0;
      }
    }
    const cutout = deriveSilhouetteMask({ pixels, width, height });
    const incidental = rgba(width, height, (x, y) => x >= 2 && x <= 7 && y >= 2 && y <= 7);
    incidental[(5 * width + 5) * 4 + 3] = 0;
    const opaqueBackground = deriveSilhouetteMask({ pixels: incidental, width, height });

    expect(cutout.mode).toBe("alpha");
    expect(cutout.bounds.count).toBe(24);
    expect(opaqueBackground.mode).toBe("background");
  });

  it("requires two orthogonal projection families and supports the guided front-side pair", () => {
    const front = viewFixture("front");
    const back = viewFixture("back");
    const right = viewFixture("right");

    expect(() => validateCanonicalViews([front, back])).toThrow(/正交/);
    expect(validateCanonicalViews([front, right], { requireGuidedPair: true }).map((view) => view.id)).toEqual(["front", "right"]);
    expect(() => validateCanonicalViews([right, viewFixture("top")], { requireGuidedPair: true })).toThrow(/正面/);
  });

  it("maps opposite cameras by mirroring their horizontal image coordinate", () => {
    expect(projectVoxelToView("front", 0.2, 0.7, 0.4)).toEqual([0.2, 0.30000000000000004]);
    expect(projectVoxelToView("back", 0.2, 0.7, 0.4)).toEqual([0.8, 0.30000000000000004]);
    expect(projectVoxelToView("left", 0.2, 0.7, 0.4)).toEqual([0.4, 0.30000000000000004]);
    expect(projectVoxelToView("right", 0.2, 0.7, 0.4)).toEqual([0.6, 0.30000000000000004]);
    expect(projectVoxelDepthCoordinate("front", 0.2, 0.7, 0.4)).toBe(0.4);
    expect(projectVoxelDepthCoordinate("back", 0.2, 0.7, 0.4)).toBe(0.6);
    expect(projectVoxelDepthCoordinate("right", 0.2, 0.7, 0.4)).toBe(0.2);
    expect(projectVoxelDepthCoordinate("left", 0.2, 0.7, 0.4)).toBe(0.8);
  });

  it("robustly normalizes useful relative depth and deactivates flat evidence", () => {
    const view = viewFixture("front", 18, 20, 4);
    const gradient = new Float32Array(view.width * view.height);
    for (let y = 0; y < view.height; y += 1) {
      for (let x = 0; x < view.width; x += 1) gradient[y * view.width + x] = x / (view.width - 1);
    }
    const normalized = normalizeRelativeDepthForSilhouette({
      depth: gradient,
      width: view.width,
      height: view.height,
      mask: view.mask,
    });
    const flat = normalizeRelativeDepthForSilhouette({
      depth: new Float32Array(view.width * view.height).fill(0.5),
      width: view.width,
      height: view.height,
      mask: view.mask,
    });

    expect(normalized.usable).toBe(true);
    expect(Math.min(...normalized.values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...normalized.values)).toBeLessThanOrEqual(1);
    expect(flat.usable).toBe(false);
    expect(flat.warnings.join(" ")).toMatch(/纯轮廓/);
  });

  it("carves a finite deterministic mesh and extra evidence cannot increase occupied volume", () => {
    const front = viewFixture("front", 14, 18, 3);
    const right = viewFixture("right", 12, 18, 4);
    const top = viewFixture("top", 14, 12, 4);
    const pair = buildVisualHullMeshData({ views: [front, right], resolution: 18 });
    const triple = buildVisualHullMeshData({ views: [front, right, top], resolution: 18 });
    const repeat = buildVisualHullMeshData({ views: [front, right], resolution: 18 });

    expect(pair.voxelCount).toBeGreaterThan(0);
    expect(triple.voxelCount).toBeLessThanOrEqual(pair.voxelCount);
    expect(repeat.voxelCount).toBe(pair.voxelCount);
    expect([...repeat.indices]).toEqual([...pair.indices]);
    expect([...pair.positions].every(Number.isFinite)).toBe(true);
  });

  it("blends monotonically from the pure hull to a depth-guided visible surface", () => {
    const front = withDepth(
      viewFixture("front", 22, 24, 4),
      (x, _y, view) => x / Math.max(1, view.width - 1),
    );
    const right = viewFixture("right", 18, 24, 5);
    const pure = buildVisualHullMeshData({ views: [front, right], resolution: 20, depthInfluence: 0 });
    const gentle = buildVisualHullMeshData({
      views: [front, right],
      resolution: 20,
      depthInfluence: 0.3,
      depthTolerance: 0.03,
    });
    const strong = buildVisualHullMeshData({
      views: [front, right],
      resolution: 20,
      depthInfluence: 0.7,
      depthTolerance: 0.03,
    });
    const inverted = buildVisualHullMeshData({
      views: [{ ...front, depth: { ...front.depth, inverted: true } }, right],
      resolution: 20,
      depthInfluence: 0.7,
      depthTolerance: 0.03,
    });

    expect(gentle.voxelCount).toBeLessThanOrEqual(pure.voxelCount);
    expect(strong.voxelCount).toBeLessThanOrEqual(gentle.voxelCount);
    expect(strong.depthCarvedVoxelCount).toBeGreaterThan(0);
    expect(strong.depthCarvedFraction).toBeGreaterThan(0);
    expect(strong.depthViewIds).toEqual(["front"]);
    expect(strong.depthRejectedVoxelCounts.front).toBe(strong.depthCarvedVoxelCount);
    expect(strong.depthConflictVoxelCount).toBe(0);
    expect([...inverted.occupancy]).not.toEqual([...strong.occupancy]);
  });

  it("ignores disabled or flat depth without changing the pure silhouette hull", () => {
    const front = viewFixture("front", 18, 20, 4);
    const right = viewFixture("right", 16, 20, 4);
    const flat = withDepth(front, () => 0.5);
    const disabled = withDepth(front, (x, _y, view) => x / (view.width - 1), { enabled: false });
    const pure = buildVisualHullMeshData({ views: [front, right], resolution: 18 });
    const flatResult = buildVisualHullMeshData({ views: [flat, right], resolution: 18, depthInfluence: 0.8 });
    const disabledResult = buildVisualHullMeshData({ views: [disabled, right], resolution: 18, depthInfluence: 0.8 });

    expect(flatResult.voxelCount).toBe(pure.voxelCount);
    expect(flatResult.depthWarnings.join(" ")).toMatch(/变化过小/);
    expect(disabledResult.voxelCount).toBe(pure.voxelCount);
  });

  it("uses tolerance to soften conflicting opposite-view depth ceilings", () => {
    const front = withDepth(viewFixture("front", 24, 28, 5), (x, _y, view) => x / (view.width - 1));
    const back = withDepth(viewFixture("back", 24, 28, 5), (x, _y, view) => x / (view.width - 1));
    const right = withDepth(viewFixture("right", 20, 28, 5), (x, _y, view) => x / (view.width - 1));
    const pure = buildVisualHullMeshData({ views: [front, back, right], resolution: 24 });
    const strict = buildVisualHullMeshData({
      views: [front, back, right],
      resolution: 24,
      depthInfluence: 0.55,
      depthTolerance: 0.01,
    });
    const tolerant = buildVisualHullMeshData({
      views: [front, back, right],
      resolution: 24,
      depthInfluence: 0.55,
      depthTolerance: 0.12,
    });

    expect(strict.voxelCount).toBeGreaterThan(0);
    expect(tolerant.voxelCount).toBeGreaterThanOrEqual(strict.voxelCount);
    expect(tolerant.voxelCount).toBeLessThanOrEqual(pure.voxelCount);
    expect(strict.depthRejectedVoxelCounts.front).toBeGreaterThan(0);
    expect(strict.depthRejectedVoxelCounts.back).toBeGreaterThan(0);
    expect(strict.depthConflictVoxelCount).toBeGreaterThan(0);
  });

  it("keeps deterministic noisy depth bounded at the maximum guided UI resolution", () => {
    const noisyDepth = (x, y, view) => {
      const gradient = x / Math.max(1, view.width - 1);
      const noise = Math.sin(x * 12.9898 + y * 78.233) * 0.04;
      return Math.max(0, Math.min(1, gradient + noise));
    };
    const front = withDepth(viewFixture("front", 48, 64, 10), noisyDepth);
    const right = withDepth(viewFixture("right", 44, 64, 11), noisyDepth);
    const result = buildVisualHullMeshData({
      views: [front, right],
      resolution: 64,
      depthInfluence: 0.3,
      depthTolerance: 0.08,
    });

    expect(result.voxelCount).toBeGreaterThan(0);
    expect(result.occupancy.length).toBeLessThanOrEqual(1_500_000);
    expect([...result.positions].every(Number.isFinite)).toBe(true);
  });

  it("warns when depth removes at least half of the silhouette baseline", () => {
    const front = withDepth(
      viewFixture("front", 24, 28, 5),
      (x, _y, view) => x >= view.width - 7 ? 0.9 : 0.1,
    );
    const right = viewFixture("right", 20, 28, 5);
    const result = buildVisualHullMeshData({
      views: [front, right],
      resolution: 24,
      depthInfluence: 1,
      depthTolerance: 0.01,
    });

    expect(result.depthCarvedFraction).toBeGreaterThanOrEqual(0.5);
    expect(result.depthWarnings.join(" ")).toMatch(/至少一半/);
  });

  it("exports a neutral, texture-free OBJ and a round-trippable evidence recipe", () => {
    const views = [
      withDepth(viewFixture("front"), (x, _y, view) => x / (view.width - 1)),
      viewFixture("left"),
    ];
    const mesh = buildVisualHullMeshData({ views, resolution: 16, depthInfluence: 0.35, depthTolerance: 0.06 });
    const obj = serializeVisualHullObj(mesh, { name: "chair study" });
    const recipeText = serializeMultiViewRecipe({
      views,
      mesh,
      name: "chair study",
      interactionTrace: [
        { sequence: 1, elapsedMs: 120, action: "view-added", viewId: "front" },
        { sequence: 2, elapsedMs: 310, action: "threshold-changed", viewId: "left", value: 52 },
      ],
    });
    const recipe = parseMultiViewRecipe(recipeText);
    const recipeDocument = JSON.parse(recipeText);

    expect(obj).toContain(`# ${MULTI_VIEW_GRAY_CONTRACT}`);
    expect(obj).toContain("o chair-study");
    expect(obj).toMatch(/^v -?\d+\.\d{6} -?\d+\.\d{6} -?\d+\.\d{6} 0\.560784 0\.560784 0\.576471$/m);
    expect(obj).not.toMatch(/^(?:vt|mtllib|usemtl) /m);
    expect(obj).not.toContain("NaN");
    expect(recipe).toMatchObject({
      contract: MULTI_VIEW_GRAY_CONTRACT,
      name: "chair-study",
      settings: { resolution: 16, padding: 0, depthInfluence: 0.35, depthTolerance: 0.06 },
    });
    expect(recipe.views.map((view) => view.role)).toEqual(["view-front", "view-left"]);
    expect(recipe.views[0].depth).toMatchObject({ role: "depth-front", enabled: true, inverted: false });
    expect(recipeDocument.result).toMatchObject({
      depthCarvedVoxelCount: mesh.depthCarvedVoxelCount,
      depthRejectedVoxelCounts: mesh.depthRejectedVoxelCounts,
      depthConflictVoxelCount: mesh.depthConflictVoxelCount,
    });
    expect(recipe.interactionTrace).toEqual([
      { sequence: 1, elapsedMs: 120, action: "view-added", viewId: "front" },
      { sequence: 2, elapsedMs: 310, action: "threshold-changed", viewId: "left", value: 52 },
    ]);
  });

  it("fails closed for an empty mask and incompatible silhouettes", () => {
    const emptyPixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let index = 0; index < emptyPixels.length; index += 4) {
      emptyPixels[index] = 255;
      emptyPixels[index + 1] = 255;
      emptyPixels[index + 2] = 255;
      emptyPixels[index + 3] = 255;
    }
    expect(() => deriveSilhouetteMask({ pixels: emptyPixels, width: 8, height: 8 })).toThrow(/没有提取/);

    const front = viewFixture("front", 8, 8, 2);
    const right = viewFixture("right", 8, 8, 2);
    right.mask.fill(0);
    right.mask[0] = 1;
    right.bounds = { left: 0, right: 0, top: 0, bottom: 0, width: 1, height: 1, count: 1 };
    expect(() => buildVisualHullMeshData({ views: [front, right], resolution: 16 })).toThrow(/轮廓过小/);
  });
});
