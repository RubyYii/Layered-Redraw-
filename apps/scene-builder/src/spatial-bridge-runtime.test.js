import { describe, expect, it } from "vitest";
import {
  buildHeightfieldSamples,
  inspectPngDimensions,
  matchSpatialArtifactFile,
  resolveSpatialBridgeFiles,
  sha256Hex,
  validateSpatialBridge,
} from "./spatial-bridge-runtime.js";

const encoder = new TextEncoder();

const fakeFile = (name, content, webkitRelativePath = name) => {
  const bytes = typeof content === "string" ? encoder.encode(content) : content;
  return {
    name,
    size: bytes.byteLength,
    webkitRelativePath,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
  };
};

const validBridge = ({ rgbHash = "a".repeat(64), depthHash = "b".repeat(64) } = {}) => ({
  kind: "layered-redraw-spatial-bridge",
  schema_version: "1.0",
  source: {
    id: "scene-rgb",
    role: "primary-rgb",
    label: "Scene",
    width: 4,
    height: 2,
    rgb_artifact: "references/scene-rgb/rgb.png",
    rgb_sha256: rgbHash,
  },
  depth: {
    id: "depth-one",
    preview_artifact: "references/scene-rgb/depth/depth-one/depth-preview.png",
    artifact_sha256: { preview: depthHash },
    orientation: "near-white",
    relative_depth: true,
    metric_scale: false,
  },
  surface: {
    representation: "rgb-depth-heightfield",
    mesh_resolution: 24,
    displacement: 0.65,
    perspective: 0.58,
    near_direction: "+surface-normal",
    texture_fit: "preserve-aspect",
  },
  semantic_layers: { status: "missing", count: 0, layers: [] },
  invariants: {
    raw_depth_immutable: true,
    art_direction_changes_interpretation_only: true,
    relative_depth_must_not_be_treated_as_metres: true,
  },
  handoff: {
    target: "apps/scene-builder",
    contract: "depth-heightfield-v1",
    status: "ready-for-import",
  },
  contract_sha256: "c".repeat(64),
});

describe("Layered Redraw RGB-D spatial bridge", () => {
  it("accepts the strict relative-depth contract and rejects metric or unsafe variants", () => {
    expect(validateSpatialBridge(validBridge())).toMatchObject({
      width: 4,
      height: 2,
      resolution: 24,
      displacement: 0.65,
      rgbArtifact: "references/scene-rgb/rgb.png",
    });

    const metric = validBridge();
    metric.depth.metric_scale = true;
    expect(() => validateSpatialBridge(metric)).toThrow(/metric_scale/);

    const traversal = validBridge();
    traversal.source.rgb_artifact = "../secret.png";
    expect(() => validateSpatialBridge(traversal)).toThrow(/安全相对路径/);
  });

  it("matches declared project-relative artifacts without guessing across duplicates", () => {
    const expected = fakeFile(
      "rgb.png",
      "rgb",
      "my-project/references/scene-rgb/rgb.png",
    );
    const other = fakeFile("rgb.png", "other", "my-project/archive/rgb.png");
    expect(matchSpatialArtifactFile([expected, other], "references/scene-rgb/rgb.png", "RGB 工件")).toBe(expected);
    expect(() => matchSpatialArtifactFile([expected, other], "missing/rgb.png", "RGB 工件")).toThrow(/多个同名/);
  });

  it("checks PNG dimensions before browser image decoding", () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    header.set([0x49, 0x48, 0x44, 0x52], 12);
    const view = new DataView(header.buffer);
    view.setUint32(16, 384, false);
    view.setUint32(20, 216, false);

    expect(inspectPngDimensions(header)).toEqual({ width: 384, height: 216 });
    view.setUint32(16, 20_000, false);
    expect(() => inspectPngDimensions(header)).toThrow(/安全解码范围/);
    expect(() => inspectPngDimensions(new Uint8Array(24))).toThrow(/有效的 PNG/);
  });

  it("verifies the two declared artifact hashes before returning a bundle", async () => {
    const rgb = fakeFile("rgb.png", "rgb bytes", "project/references/scene-rgb/rgb.png");
    const depth = fakeFile(
      "depth-preview.png",
      "depth bytes",
      "project/references/scene-rgb/depth/depth-one/depth-preview.png",
    );
    const bridge = validBridge({
      rgbHash: await sha256Hex(rgb),
      depthHash: await sha256Hex(depth),
    });
    const bridgeFile = fakeFile("spatial-bridge.json", JSON.stringify(bridge), "project/spatial-bridge.json");
    const resolved = await resolveSpatialBridgeFiles([bridgeFile, rgb, depth]);

    expect(resolved.rgbFile).toBe(rgb);
    expect(resolved.depthFile).toBe(depth);
    expect(resolved.verifiedHashes).toEqual({
      rgb: bridge.source.rgb_sha256,
      depthPreview: bridge.depth.artifact_sha256.preview,
    });

    const tampered = fakeFile(
      "depth-preview.png",
      "tampered",
      "project/references/scene-rgb/depth/depth-one/depth-preview.png",
    );
    await expect(resolveSpatialBridgeFiles([bridgeFile, rgb, tampered])).rejects.toThrow(/SHA-256/);
  });

  it("maps near-white pixels toward +surface-normal and preserves source aspect", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255,
      0, 0, 0, 255, 0, 0, 0, 255,
    ]);
    const samples = buildHeightfieldSamples(pixels, 2, 2, 24, 1);

    expect(samples).toMatchObject({ columns: 24, rows: 24, vertexCount: 576, planeWidth: 1, planeHeight: 1 });
    expect(samples.heights[0]).toBeCloseTo(0.5);
    expect(samples.heights.at(-1)).toBeCloseTo(-0.5);
    expect(samples.nearnessMean).toBeCloseTo(0.5);
    expect(samples.nearnessRange[0]).toBeCloseTo(0);
    expect(samples.nearnessRange[1]).toBeCloseTo(1);
  });
});
