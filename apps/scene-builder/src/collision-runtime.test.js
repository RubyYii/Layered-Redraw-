import { describe, expect, it } from "vitest";
import {
  COLLISION_BACKEND,
  mergeCollisionReports,
  resolveCharacterCollisions,
  resolvePropCollisions,
} from "./collision-runtime.js";
import { effectorWeightsForInteraction, surfaceContactPosition } from "./interaction-runtime.js";
import { createEntityConfig, normalizeProject } from "./model.js";

const createCollisionProject = () => normalizeProject({
  objects: [
    {
      id: "actor",
      type: "group",
      position: [-0.7, 0, 0],
      entity: createEntityConfig("character"),
      interactionSpec: {
        collisionProxy: {
          shape: "capsule",
          dimensions: [1, 1.8, 1],
          offset: [0, 0.9, 0],
          margin: 0.1,
        },
      },
    },
    {
      id: "table",
      type: "box",
      position: [0, 0.5, 0],
      dimensions: [1, 1, 1],
      entity: createEntityConfig("environment"),
      interactionSpec: {
        anchors: { surface: [0, 0.5, 0] },
        collisionProxy: { shape: "box", support: true, margin: 0 },
      },
    },
    {
      id: "cup",
      type: "cylinder",
      position: [0, 0.9, 0],
      dimensions: [0.4, 0.4, 0.4],
      entity: createEntityConfig("prop"),
      interactionSpec: { collisionProxy: { shape: "cylinder", margin: 0 } },
    },
  ],
});

const statesFor = (project) => Object.fromEntries(project.objects.map((object) => [object.id, {
  position: [...object.position],
  rotation: [...object.rotation],
  scale: [...object.scale],
  visible: object.visible,
}]));

describe("collision proxy solver", () => {
  it("keeps a kinematic character capsule outside a static table footprint", () => {
    const project = createCollisionProject();
    const objects = statesFor(project);
    const result = resolveCharacterCollisions(project, objects);

    expect(result.backend).toBe(COLLISION_BACKEND);
    expect(result.resolvedCount).toBe(1);
    expect(result.maxPenetration).toBeCloseTo(0.4, 8);
    expect(result.residualPenetration).toBe(0);
    expect(result.safe).toBe(true);
    expect(objects.actor.position[0]).toBeCloseTo(-1.1, 8);
  });

  it("lifts a prop to a support surface instead of letting it pass through", () => {
    const project = createCollisionProject();
    const objects = statesFor(project);
    const result = resolvePropCollisions(project, objects);

    expect(result.contacts[0]).toMatchObject({
      kind: "prop-static",
      leftId: "cup",
      rightId: "table",
      mode: "support",
    });
    expect(result.maxPenetration).toBeCloseTo(0.3, 8);
    expect(result.residualPenetration).toBe(0);
    expect(objects.cup.position[1]).toBeCloseTo(1.2, 8);
  });

  it("merges character and prop reports without hiding residual penetration", () => {
    const project = createCollisionProject();
    const objects = statesFor(project);
    const merged = mergeCollisionReports(
      resolveCharacterCollisions(project, objects),
      resolvePropCollisions(project, objects),
    );

    expect(merged.safe).toBe(true);
    expect(merged.resolvedCount).toBe(2);
    expect(merged.maxPenetration).toBeCloseTo(0.4, 8);
    expect(merged.residualPenetration).toBe(0);
  });

  it("keeps explicit proxy opt-outs and unconfigured decorative props outside the solver", () => {
    const project = normalizeProject({
      objects: [
        {
          id: "disabled-floor-detail",
          type: "box",
          position: [0, 0.02, 0],
          dimensions: [3, 0.04, 3],
          entity: createEntityConfig("environment"),
          interactionSpec: { collisionProxy: { enabled: false } },
        },
        {
          id: "decorative-prop",
          type: "box",
          position: [0, 0.15, 0],
          dimensions: [0.5, 0.5, 0.5],
          entity: createEntityConfig("prop"),
        },
      ],
    });
    const objects = statesFor(project);

    expect(project.objects[0].interactionSpec?.collisionProxy).toEqual({ enabled: false });
    expect(resolveCharacterCollisions(project, objects).resolvedCount).toBe(0);
    expect(resolvePropCollisions(project, objects).resolvedCount).toBe(0);
  });
});

describe("effector surface contact", () => {
  it("places giver and receiver effectors on opposite sides of a prop", () => {
    const halfExtents = [0.21, 0.28, 0.21];
    const left = surfaceContactPosition([-1, 1, 0], [0, 1, 0], halfExtents, 0.12);
    const right = surfaceContactPosition([1, 1, 0], [0, 1, 0], halfExtents, 0.12);

    expect(left[0]).toBeCloseTo(-0.345, 8);
    expect(right[0]).toBeCloseTo(0.345, 8);
    expect(left[1]).toBe(1);
    expect(right[1]).toBe(1);
    expect(right[0] - left[0]).toBeGreaterThan(0.68);
  });

  it("keeps the new owner in contact while the previous owner recovers", () => {
    const recovery = { name: "recovery", progress: 0.6, contactWeight: 0.4 };

    expect(effectorWeightsForInteraction("claim", recovery)).toEqual({ actor: 1, recipient: 0 });
    expect(effectorWeightsForInteraction("transfer", recovery)).toEqual({ actor: 0.4, recipient: 1 });
    expect(effectorWeightsForInteraction("release", recovery)).toEqual({ actor: 0.4, recipient: 0 });
    expect(effectorWeightsForInteraction("hold", recovery)).toEqual({ actor: 1, recipient: 0 });
  });
});
