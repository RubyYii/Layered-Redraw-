import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { ThreeSceneAdapter } from "./editor.js";

const readRelative = (relativePath) => fs.readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  "utf8",
);

describe("CP02 interaction surface contract", () => {
  it("keeps the CP02 panel hidden by default and exposes the complete fixed proof controls", () => {
    const html = readRelative("../index.html");

    expect(html).toMatch(/id="cp02-panel"[^>]*hidden/);
    for (const id of [
      "cp02-utterance",
      "cp02-preview",
      "cp02-guardian-allow",
      "cp02-guardian-reject",
      "cp02-propose-thermos",
      "cp02-move-chair",
      "cp02-undo",
      "cp02-attempt-source-rewrite",
      "cp02-download-receipt",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("publishes only a read-only evidence snapshot in CP02 query mode", () => {
    const source = readRelative("./main.js");

    expect(source).toContain("window.__PACT_CP02_EVIDENCE__ = Object.freeze");
    expect(source).toContain("snapshot: () => structuredClone");
    expect(source).toContain('searchParams.get("case") === "pact-cp02"');
  });

  it("provides ephemeral proposal and equal-duration decision-light APIs outside SceneStore", () => {
    expect(typeof ThreeSceneAdapter.prototype.showCp02ProposalPreview).toBe("function");
    expect(typeof ThreeSceneAdapter.prototype.clearCp02ProposalPreview).toBe("function");
    expect(typeof ThreeSceneAdapter.prototype.showCp02DecisionPressure).toBe("function");
    expect(typeof ThreeSceneAdapter.prototype.setGovernanceOverlay).toBe("function");
  });

  it("reuses one resident decision-pressure light across rapid Guardian decisions", () => {
    const scene = new THREE.Scene();
    const decisionLight = new THREE.PointLight(0x69d6ca, 0, 4.8, 2);
    decisionLight.userData.cp02DecisionPressure = true;
    scene.add(decisionLight);
    const adapter = Object.assign(Object.create(ThreeSceneAdapter.prototype), {
      scene,
      cp02DecisionLight: decisionLight,
      cp02DecisionEffects: [],
    });

    adapter.showCp02DecisionPressure({
      positions: [[0, 1, 0], [3, 1, 0], [0, 1, 3]],
      outcome: "APPLIED",
      durationMs: 1800,
    });
    adapter.showCp02DecisionPressure({
      positions: [[1, 2, 3]],
      outcome: "WITHHELD",
      durationMs: 1800,
    });

    expect(scene.children.filter((child) => child.userData.cp02DecisionPressure)).toEqual([decisionLight]);
    expect(adapter.cp02DecisionEffects).toHaveLength(1);
    expect(adapter.cp02DecisionEffects[0].light).toBe(decisionLight);
    expect(decisionLight.position.toArray()).toEqual([1, 2, 3]);
    adapter.applyCp02DecisionPressure(adapter.cp02DecisionEffects[0].startedAt + 1801);
    expect(decisionLight.parent).toBe(scene);
    expect(decisionLight.intensity).toBe(0);
  });

  it("attaches a hash-verified Case Pack controller to an existing governed carrier", async () => {
    const carrier = new THREE.Group();
    carrier.scale.set(0.22, 0.34, 0.22);
    const controller = {
      root: new THREE.Group(),
      report: { format: "GLB", meshCount: 3 },
      fitToCarrier(scale) {
        this.lastCarrierScale = scale.toArray();
      },
      dispose() {
        this.disposed = true;
        this.root.removeFromParent();
      },
    };
    const state = {
      project: { objects: [{ id: "cp02-memory-thermos", parentId: null }] },
    };
    const adapter = Object.assign(Object.create(ThreeSceneAdapter.prototype), {
      store: { getState: () => state },
      lastState: state,
      meshes: new Map([["cp02-memory-thermos", carrier]]),
      assetControllers: new Map(),
      assetLoadTokens: new Map(),
      assetReplacementRootById: new Map(),
      casePackControllerCache: new Map(),
      casePackAssetIdByCarrier: new Map(),
      scene: new THREE.Scene(),
    });
    adapter.scene.add(carrier);
    let casePackLoads = 0;
    const pack = {
      async asset(assetId) {
        if (assetId !== "PH-MUG-MATERIAL-001") throw new Error("unexpected asset");
        casePackLoads += 1;
        if (casePackLoads > 1) throw new Error("verified controller should have been reused");
        return controller;
      },
    };

    const report = await adapter.loadCasePackAsset(
      "cp02-memory-thermos",
      pack,
      "PH-MUG-MATERIAL-001",
    );

    expect(report).toEqual({ format: "GLB", meshCount: 3 });
    expect(controller.root.parent).toBe(carrier);
    expect(controller.lastCarrierScale).toEqual([0.22, 0.34, 0.22]);
    expect(adapter.assetControllers.get("cp02-memory-thermos")).toBe(controller);

    expect(adapter.clearAsset("cp02-memory-thermos", { resync: false })).toBe(true);
    expect(controller.disposed).not.toBe(true);
    expect(controller.root.parent).toBe(null);
    await expect(adapter.loadCasePackAsset(
      "cp02-memory-thermos",
      pack,
      "PH-MUG-MATERIAL-001",
    )).resolves.toEqual({ format: "GLB", meshCount: 3 });
    expect(casePackLoads).toBe(1);
    expect(controller.root.parent).toBe(carrier);
  });

  it("retains authorised ScenePatch meshes across undo so shader materials can be reused", () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#777777" }),
    );
    mesh.userData.objectId = "cp02-memory-table-top";
    mesh.userData.objectType = "box";
    mesh.userData.governanceState = "AUTHORISED";
    mesh.userData.governanceAssetId = "CP02-TABLE-PROXY-001";
    let materialDisposed = false;
    mesh.material.addEventListener("dispose", () => {
      materialDisposed = true;
    });
    const scene = new THREE.Scene();
    scene.add(mesh);
    const adapter = Object.assign(Object.create(ThreeSceneAdapter.prototype), {
      scene,
      meshes: new Map([[mesh.userData.objectId, mesh]]),
      scenePatchMeshCache: new Map(),
    });

    expect(adapter.retainScenePatchMesh(mesh.userData.objectId, mesh)).toBe(true);
    adapter.meshes.delete(mesh.userData.objectId);
    expect(mesh.parent).toBe(null);
    expect(materialDisposed).toBe(false);

    const restored = adapter.restoreScenePatchMesh({
      id: mesh.userData.objectId,
      type: "box",
      governance: { state: "AUTHORISED", assetId: "CP02-TABLE-PROXY-001" },
    });
    expect(restored).toBe(mesh);
    expect(adapter.meshes.get(mesh.userData.objectId)).toBe(mesh);
    expect(mesh.parent).toBe(scene);
    expect(materialDisposed).toBe(false);
  });

  it("applies a CP02-only camera and lighting profile without duplicating its readability light", () => {
    const scene = new THREE.Scene();
    const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    const adapter = Object.assign(Object.create(ThreeSceneAdapter.prototype), {
      scene,
      renderer: { toneMappingExposure: 1 },
      perspectiveCamera,
      activeCamera: null,
      orbitControls: {
        object: null,
        target: new THREE.Vector3(),
        update() {},
      },
      transformControls: { camera: null },
      hemisphereLight: new THREE.HemisphereLight(0xffffff, 0x111111, 0.5),
      keyLight: new THREE.DirectionalLight(0xffffff, 1),
      fillLight: new THREE.DirectionalLight(0xffffff, 0.25),
      practicalLight: new THREE.PointLight(0xffffff, 1, 4, 2),
      cp02ReadabilityLight: null,
    });
    const profile = {
      id: "cp02-visual-repair-test",
      camera: {
        position: [0.3, 3.6, 3.7],
        target: [0.8, 1.1, -1.4],
        fov: 51,
      },
      lighting: {
        exposure: 1.31,
        hemisphereIntensity: 1.08,
        keyIntensity: 3.05,
        fillIntensity: 0.82,
        practical: {
          position: [-1.4, 3.2, 1.2],
          intensity: 9.4,
          distance: 13,
          decay: 2,
        },
        readability: {
          color: "#d7c19c",
          position: [1.2, 2.5, -1.1],
          intensity: 3.8,
          distance: 7.5,
          decay: 2,
        },
      },
    };

    const first = adapter.applyCp02VisualProfile(profile);
    const second = adapter.applyCp02VisualProfile(profile);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ id: "cp02-visual-repair-test", status: "ACTIVE" });
    expect(adapter.activeCamera).toBe(perspectiveCamera);
    expect(perspectiveCamera.position.toArray()).toEqual([0.3, 3.6, 3.7]);
    expect(perspectiveCamera.fov).toBe(51);
    expect(adapter.orbitControls.target.toArray()).toEqual([0.8, 1.1, -1.4]);
    expect(adapter.renderer.toneMappingExposure).toBe(1.31);
    expect(adapter.hemisphereLight.intensity).toBe(1.08);
    expect(adapter.keyLight.intensity).toBe(3.05);
    expect(adapter.fillLight.intensity).toBe(0.82);
    expect(adapter.practicalLight.position.toArray()).toEqual([-1.4, 3.2, 1.2]);
    expect(adapter.cp02ReadabilityLight.position.toArray()).toEqual([1.2, 2.5, -1.1]);
    expect(scene.children.filter((child) => child.userData.cp02Readability)).toHaveLength(1);
  });

  it("applies an idempotent thermos display treatment while retaining the approved texture", () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.24,
      metalness: 0.81,
      map: texture,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    const root = new THREE.Group();
    root.add(mesh);
    const adapter = Object.assign(Object.create(ThreeSceneAdapter.prototype), {
      assetControllers: new Map([["cp02-memory-thermos", { root }]]),
    });
    const treatment = {
      id: "aged-muted-metal-test",
      color: "#b8aa91",
      minRoughness: 0.72,
      maxMetalness: 0.34,
      yawDegrees: 168,
    };

    const first = adapter.applyAssetDisplayTreatment("cp02-memory-thermos", treatment);
    const second = adapter.applyAssetDisplayTreatment("cp02-memory-thermos", treatment);

    expect(first).toEqual(second);
    expect(first).toEqual({
      treatmentId: "aged-muted-metal-test",
      materialCount: 1,
      yawDegrees: 168,
    });
    expect(material.color.getHexString()).toBe("b8aa91");
    expect(material.roughness).toBe(0.72);
    expect(material.metalness).toBe(0.34);
    expect(material.map).toBe(texture);
    expect(root.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(168));
  });
});
