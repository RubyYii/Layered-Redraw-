import { describe, expect, it, vi } from "vitest";
import {
  buildReliefMeshData,
  buildRiggedReliefScene,
  createDepthEstimatorRuntime,
  createHumanoidRigDraft,
  depthPipelineOutputToRaster,
  moveRigDraftJoint,
  serializeReliefObj,
} from "./single-image-3d-runtime.js";

const rgbaFixture = (width, height, alpha = 255) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = (index * 31) % 255;
    pixels[index * 4 + 1] = 120;
    pixels[index * 4 + 2] = 210;
    pixels[index * 4 + 3] = alpha;
  }
  return pixels;
};

describe("single image depth to rigged relief", () => {
  it("normalizes processed pipeline depth and supports explicit inversion", () => {
    const output = {
      depth: { width: 2, height: 2, channels: 1, data: new Uint8Array([0, 64, 128, 255]) },
    };

    const nearWhite = depthPipelineOutputToRaster(output);
    const inverted = depthPipelineOutputToRaster(output, { invert: true });

    expect(nearWhite.depth[0]).toBe(0);
    expect(nearWhite.depth[1]).toBeCloseTo(64 / 255, 6);
    expect(nearWhite.depth[2]).toBeCloseTo(128 / 255, 6);
    expect(nearWhite.depth[3]).toBe(1);
    expect(inverted.depth[0]).toBe(1);
    expect(inverted.depth[3]).toBe(0);
  });

  it("loads one reusable local estimator and falls back from WebGPU to WASM", async () => {
    const estimator = vi.fn(async () => ({
      depth: { width: 2, height: 1, channels: 1, data: new Uint8Array([20, 220]) },
    }));
    const pipeline = vi.fn(async (_task, _model, options) => {
      if (options.device === "webgpu") throw new Error("unsupported adapter");
      return estimator;
    });
    const runtime = createDepthEstimatorRuntime({
      importer: async () => ({ pipeline }),
      webgpuAvailable: () => true,
    });

    const first = await runtime.estimate("blob:first");
    const second = await runtime.estimate("blob:second");

    expect(first.backend).toBe("wasm");
    expect(second.depth[1]).toBe(1);
    expect(pipeline).toHaveBeenCalledTimes(2);
    expect(estimator).toHaveBeenCalledTimes(2);
    expect(runtime.status()).toMatchObject({ state: "ready", backend: "wasm" });
  });

  it("preflights the actual GPU adapter before touching the WebGPU session", async () => {
    const estimator = vi.fn(async () => ({
      depth: { width: 1, height: 1, channels: 1, data: new Uint8Array([128]) },
    }));
    const pipeline = vi.fn(async () => estimator);
    const runtime = createDepthEstimatorRuntime({
      importer: async () => ({ pipeline }),
      webgpuAvailable: async () => false,
    });

    await runtime.estimate("blob:wasm-only");

    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.mock.calls[0][2]).toMatchObject({ device: "wasm", dtype: "q8" });
  });

  it("serializes a vertex-colour OBJ with UVs, normals, and discontinuity-safe faces", () => {
    const width = 8;
    const height = 8;
    const depth = new Float32Array(width * height).map((_, index) => index % width < 4 ? 0.1 : 0.9);
    const mesh = buildReliefMeshData({
      rgbPixels: rgbaFixture(width, height),
      depth,
      width,
      height,
      resolution: 8,
      edgeThreshold: 0.2,
    });
    const obj = serializeReliefObj(mesh, { name: "portrait" });

    expect(mesh.vertexCount).toBe(64);
    expect(mesh.faceCount).toBeLessThan((7 * 7) * 2);
    expect(obj).toContain("o portrait");
    expect(obj).toMatch(/^v -?\d+\.\d{6} -?\d+\.\d{6} -?\d+\.\d{6} \d+\.\d{6}/m);
    expect(obj).toMatch(/^vt /m);
    expect(obj).toMatch(/^vn /m);
    expect(obj).toMatch(/^f \d+\/\d+\/\d+/m);
  });

  it("creates an editable 22-bone skinned GLB source with normalized four-weight vertices", () => {
    const width = 8;
    const height = 8;
    const mesh = buildReliefMeshData({
      rgbPixels: rgbaFixture(width, height),
      depth: new Float32Array(width * height).fill(0.5),
      width,
      height,
      resolution: 8,
    });
    const moved = moveRigDraftJoint(createHumanoidRigDraft(), "leftHand", 0.9, 0.55);
    const built = buildRiggedReliefScene(mesh, moved);
    const weights = built.mesh.geometry.getAttribute("skinWeight");
    const indices = built.mesh.geometry.getAttribute("skinIndex");

    expect(built.mesh.isSkinnedMesh).toBe(true);
    expect(built.report.boneCount).toBe(22);
    expect(built.report.mapping.leftHand).toBe("LeftHand");
    expect(built.draft.joints.find((joint) => joint.slot === "leftHand")).toMatchObject({ u: 0.9, v: 0.55 });
    expect(indices.itemSize).toBe(4);
    for (let vertex = 0; vertex < weights.count; vertex += 1) {
      const total = weights.getX(vertex) + weights.getY(vertex) + weights.getZ(vertex) + weights.getW(vertex);
      expect(total).toBeCloseTo(1, 5);
    }
  });
});
