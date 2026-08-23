import { describe, expect, it } from "vitest";
import { createEntityConfig, normalizeProject } from "./model.js";
import { buildNavigationMesh, planNavmeshPath } from "./navmesh-runtime.js";

describe("triangulated navigation mesh", () => {
  it("builds shared-edge portals and uses a direct corridor in an empty room", () => {
    const project = normalizeProject({ objects: [] });
    const mesh = buildNavigationMesh(project, [0, 0, 0], [3, 0, 0], { cellSize: 0.5 });
    const result = planNavmeshPath(project, [0, 0, 0], [3, 0, 0], { cellSize: 0.5 });

    expect(mesh.ok).toBe(true);
    expect(mesh.triangles.length).toBeGreaterThan(2);
    expect(mesh.portals.length).toBeGreaterThan(1);
    expect(result).toMatchObject({ ok: true, backend: "triangulated-raster-navmesh" });
    expect(result.path).toEqual([[0, 0, 0], [3, 0, 0]]);
  });

  it("routes a corridor around radius-inflated static geometry", () => {
    const project = normalizeProject({
      objects: [{
        id: "wall",
        type: "box",
        position: [0, 1, 0],
        dimensions: [1, 2, 4],
        entity: createEntityConfig("environment"),
      }],
    });
    const result = planNavmeshPath(project, [-3, 0, 0], [3, 0, 0], { cellSize: 0.4, actorRadius: 0.35 });

    expect(result.ok).toBe(true);
    expect(result.path.length).toBeGreaterThan(2);
    expect(result.path.some((point) => Math.abs(point[2]) > 2.35)).toBe(true);
    expect(result.corridor.length).toBeGreaterThan(2);
  });

  it("fails closed when a start or goal is isolated inside static geometry", () => {
    const project = normalizeProject({
      objects: [{
        id: "solid-blocker",
        type: "box",
        position: [0, 1, 0],
        dimensions: [3, 2, 3],
        entity: createEntityConfig("environment"),
      }],
    });

    const startBlocked = planNavmeshPath(project, [0, 0, 0], [4, 0, 0], { cellSize: 0.25, actorRadius: 0.2 });
    const goalBlocked = planNavmeshPath(project, [4, 0, 0], [0, 0, 0], { cellSize: 0.25, actorRadius: 0.2 });

    expect(startBlocked).toMatchObject({ ok: false, code: "navigation_blocked", path: [] });
    expect(goalBlocked).toMatchObject({ ok: false, code: "navigation_blocked", path: [] });
  });
});
