import { describe, expect, it } from "vitest";
import { createEntityConfig, normalizeProject } from "./model.js";
import { planGroundPath } from "./navigation-runtime.js";

describe("deterministic ground navigation", () => {
  it("uses a direct path in an empty scene", () => {
    const project = normalizeProject({ objects: [] });
    const result = planGroundPath(project, [0, 0, 0], [3, 0, 0]);

    expect(result.ok).toBe(true);
    expect(result.path[0]).toEqual([0, 0, 0]);
    expect(result.path.at(-1)).toEqual([3, 0, 0]);
  });

  it("routes around expanded static obstacle bounds", () => {
    const project = normalizeProject({
      objects: [{
        id: "wall",
        type: "box",
        position: [0, 1, 0],
        dimensions: [1, 2, 4],
        entity: createEntityConfig("environment"),
      }],
    });
    const result = planGroundPath(project, [-3, 0, 0], [3, 0, 0], { cellSize: 0.4 });

    expect(result.ok).toBe(true);
    expect(result.path.length).toBeGreaterThan(2);
    expect(result.path.some((point) => Math.abs(point[2]) > 2)).toBe(true);
  });
});
