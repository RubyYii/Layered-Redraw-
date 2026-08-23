import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CP03_ACTIONS, CP03_VISUAL_GRAMMAR, Cp03VisualEffects } from "./visual-effects.js";

describe("CP03 five-action visual grammar", () => {
  it("registers five distinct action labels and terminal semantics", () => {
    expect(CP03_ACTIONS).toEqual(["Translate", "Reframe", "Merge", "Continue", "KeepOpaque"]);
    expect(new Set(Object.values(CP03_VISUAL_GRAMMAR).map((entry) => entry.label)).size).toBe(5);
    expect(Object.entries(CP03_VISUAL_GRAMMAR).filter(([, entry]) => entry.terminal).map(([action]) => action))
      .toEqual(["Continue", "KeepOpaque"]);
  });

  it.each(CP03_ACTIONS)("creates and disposes the %s effect", (action) => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    scene.add(mesh);
    const runtime = new Cp03VisualEffects(scene, (id) => id === "target" ? mesh : null);
    const report = runtime.play(action, ["target"], { startedAt: 100, durationMs: 500 });
    expect(report.action).toBe(action);
    expect(runtime.effects).toHaveLength(1);
    expect(runtime.effects[0].root.children.length).toBeGreaterThan(0);
    runtime.update(601);
    expect(runtime.effects).toHaveLength(0);
  });
});
