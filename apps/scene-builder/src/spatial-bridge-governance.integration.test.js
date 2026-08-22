import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { ThreeSceneAdapter } from "./editor.js";

function adapterFor(object) {
  const carrier = new THREE.Group();
  carrier.scale.set(1, 1, 1);
  const state = { project: { objects: [object] } };
  return Object.assign(Object.create(ThreeSceneAdapter.prototype), {
    store: { getState: () => state },
    lastState: state,
    meshes: new Map([[object.id, carrier]]),
    assetControllers: new Map(),
    assetLoadTokens: new Map(),
    assetReplacementRootById: new Map(),
    casePackControllerCache: new Map(),
    casePackAssetIdByCarrier: new Map(),
    scene: new THREE.Scene(),
    rebuildAssetReplacementMap() {},
    applyAssetReplacements() {},
  });
}

describe("RGB-D bridge composed with CP02 governance", () => {
  it("rejects runtime-surface attachment to a source-locked carrier", async () => {
    const object = {
      id: "sandbox-photo_image",
      locked: true,
      governance: { state: "SOURCE_LOCKED", sourceId: "B2-SOURCE-001" },
    };
    const adapter = adapterFor(object);
    let created = false;

    await expect(adapter.attachRuntimeAsset(
      object.id,
      async () => {
        created = true;
        return { root: new THREE.Group(), fitToCarrier() {}, dispose() {}, report: {} };
      },
      "RGB-D 工程",
    )).rejects.toThrow(/SOURCE_LOCKED|来源锁定/);
    expect(created).toBe(false);
    expect(adapter.assetControllers.size).toBe(0);
  });

  it("attaches and replaces one runtime controller only on an authorised mutable carrier", async () => {
    const object = {
      id: "cp02-memory-table",
      locked: true,
      governance: { state: "AUTHORISED", assetId: "CP02-TABLE-PROXY-001" },
    };
    const adapter = adapterFor(object);
    const disposed = [];
    const controller = (name) => ({
      root: Object.assign(new THREE.Group(), { name }),
      fitToCarrier() {},
      dispose() {
        disposed.push(name);
        this.root.removeFromParent();
      },
      report: { name },
    });

    await expect(adapter.attachRuntimeAsset(object.id, async () => controller("case-pack"), "模型"))
      .resolves.toEqual({ name: "case-pack" });
    await expect(adapter.attachRuntimeAsset(object.id, async () => controller("rgbd"), "RGB-D 工程"))
      .resolves.toEqual({ name: "rgbd" });

    expect(disposed).toEqual(["case-pack"]);
    expect(adapter.assetControllers.get(object.id).root.name).toBe("rgbd");
  });
});
