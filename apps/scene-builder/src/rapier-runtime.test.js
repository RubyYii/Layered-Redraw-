import { describe, expect, it } from "vitest";
import { createEntityConfig, normalizeProject } from "./model.js";
import { createRapierProjectRuntime, projectNeedsRapier, RAPIER_BACKEND } from "./rapier-runtime.js";

const physicsProject = () => normalizeProject({
  objects: [
    {
      id: "floor",
      type: "box",
      position: [0, -0.1, 0],
      dimensions: [8, 0.2, 8],
      entity: createEntityConfig("environment"),
    },
    {
      id: "falling-cube",
      type: "box",
      position: [0, 2, 0],
      dimensions: [0.5, 0.5, 0.5],
      entity: createEntityConfig("prop", { physics: { bodyType: "dynamic", mass: 1 } }),
    },
  ],
});

describe("Rapier project runtime", () => {
  it("applies gravity and collides a dynamic body with a fixed floor", async () => {
    const project = physicsProject();
    expect(projectNeedsRapier(project)).toBe(true);
    const runtime = await createRapierProjectRuntime(project);
    runtime.advanceTo(0, Object.fromEntries(project.objects.map((object) => [object.id, object])));
    let snapshot;
    for (let frame = 1; frame <= 120; frame += 1) {
      snapshot = runtime.advanceTo(frame / 60, Object.fromEntries(project.objects.map((object) => [object.id, object])));
    }
    expect(snapshot.backend).toBe(RAPIER_BACKEND);
    expect(snapshot.bodyCounts).toEqual({ static: 1, kinematic: 0, dynamic: 1 });
    expect(snapshot.objects["falling-cube"].position[1]).toBeLessThan(2);
    expect(snapshot.objects["falling-cube"].position[1]).toBeGreaterThan(0.2);
    runtime.dispose();
  });

  it("hands a timeline-controlled dynamic body to kinematic authority", async () => {
    const project = physicsProject();
    const runtime = await createRapierProjectRuntime(project);
    const frame = Object.fromEntries(project.objects.map((object) => [object.id, object]));
    const snapshot = runtime.advanceTo(0, frame, new Set(["falling-cube"]));
    expect(snapshot.objects["falling-cube"]).toBeUndefined();
    runtime.dispose();
  });
});
