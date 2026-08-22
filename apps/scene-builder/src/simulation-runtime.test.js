import { describe, expect, it } from "vitest";
import { createEntityConfig, normalizeProject } from "./model.js";
import {
  FixedStepClock,
  SIMULATION_BACKEND,
  resolveInteractionSimulation,
} from "./simulation-runtime.js";

const createSimulationProject = () => normalizeProject({
  objects: [
    {
      id: "giver",
      type: "group",
      position: [0, 0, 0],
      entity: createEntityConfig("character"),
      interactionSpec: { anchors: { carry: [0, 1, -0.5], effector: [0, 1, -0.6] } },
    },
    {
      id: "receiver",
      type: "group",
      position: [2, 0, 0],
      rotation: [0, 90, 0],
      entity: createEntityConfig("character"),
      interactionSpec: { anchors: { carry: [0, 1, -0.5], effector: [0, 1, -0.6] } },
    },
    {
      id: "cup",
      type: "cylinder",
      position: [0, 0.25, -1],
      dimensions: [0.4, 0.5, 0.4],
      entity: createEntityConfig("prop"),
      interactionSpec: { anchors: { grip: [0, 0, 0], bottom: [0, -0.25, 0] } },
    },
    {
      id: "table",
      type: "box",
      position: [4, 0.5, 0],
      dimensions: [1, 1, 1],
      entity: createEntityConfig("environment"),
      interactionSpec: { anchors: { surface: [0, 0.5, 0] } },
    },
  ],
  director: {
    timeline: {
      duration: 4,
      clips: [
        {
          id: "pickup", type: "interaction", track: "character", start: 0, duration: 1,
          targetId: "cup", secondaryTargetId: "giver", ownershipMode: "claim",
          targetAnchor: "grip", holderAnchor: "carry", itemAnchor: "grip",
        },
        {
          id: "handoff", type: "interaction", track: "character", start: 1.2, duration: 1,
          targetId: "cup", secondaryTargetId: "giver", recipientId: "receiver",
          ownershipMode: "transfer", targetAnchor: "grip", recipientAnchor: "carry", itemAnchor: "grip",
        },
        {
          id: "place", type: "interaction", track: "character", start: 2.4, duration: 1,
          targetId: "cup", secondaryTargetId: "receiver", placementTargetId: "table",
          ownershipMode: "release", targetAnchor: "bottom", placementAnchor: "surface", itemAnchor: "bottom",
        },
      ],
    },
  },
});

const baseObjects = (project) => Object.fromEntries(project.objects.map((object) => [object.id, {
  position: [...object.position],
  rotation: [...object.rotation],
  scale: [...object.scale],
  visible: object.visible,
  semanticState: object.entity.state,
  animationState: "idle",
}]));

describe("fixed-step interaction simulation", () => {
  it("advances in exact 60 Hz steps across irregular display timestamps", () => {
    const clock = new FixedStepClock();
    clock.reset(0, 1_000);

    expect(clock.advance(1_010).steps).toBe(0);
    const advanced = clock.advance(1_034);

    expect(advanced.steps).toBe(2);
    expect(advanced.time).toBeCloseTo(2 / 60, 10);
    expect(advanced.tick).toBe(2);
    expect(advanced.alpha).toBeGreaterThan(0);
  });

  it("claims, transfers, and releases one prop without teleporting at first contact", () => {
    const project = createSimulationProject();
    const duringPickupObjects = baseObjects(project);
    const duringPickup = resolveInteractionSimulation(project, duringPickupObjects, 0.65);
    const heldObjects = baseObjects(project);
    const held = resolveInteractionSimulation(project, heldObjects, 1.1);
    const transferredObjects = baseObjects(project);
    const transferred = resolveInteractionSimulation(project, transferredObjects, 2.3);
    const placedObjects = baseObjects(project);
    const placed = resolveInteractionSimulation(project, placedObjects, 3.6);

    expect(duringPickup.backend).toBe(SIMULATION_BACKEND);
    expect(duringPickup.ownership.cup.status).toBe("transition");
    expect(duringPickup.contacts[0].constraintWeight).toBeGreaterThan(0);
    expect(duringPickup.contacts[0].constraintWeight).toBeLessThan(1);
    expect(held.ownership.cup).toMatchObject({ status: "held", holderId: "giver" });
    expect(heldObjects.cup.position).toEqual([0, 1, -0.5]);
    expect(transferred.ownership.cup).toMatchObject({ status: "held", holderId: "receiver" });
    expect(transferredObjects.cup.position[0]).toBeCloseTo(1.5, 6);
    expect(placed.ownership.cup).toMatchObject({ status: "placed", placementTargetId: "table" });
    expect(placedObjects.cup.position).toEqual([4, 1.25, 0]);
    expect(placed.violations).toEqual([]);
  });

  it("rejects a transfer performed by someone who does not own the prop", () => {
    const project = createSimulationProject();
    project.director.timeline.clips = project.director.timeline.clips.filter((clip) => clip.id !== "pickup");
    const objects = baseObjects(project);
    const result = resolveInteractionSimulation(project, objects, 2.3);

    expect(result.ownership.cup).toBeUndefined();
    expect(result.violations[0]).toMatchObject({ clipId: "handoff", mode: "transfer" });
    expect(objects.cup.position).toEqual([0, 0.25, -1]);
  });

  it("keeps an off-centre grip aligned while the holder rotates", () => {
    const project = createSimulationProject();
    const cup = project.objects.find((object) => object.id === "cup");
    cup.interactionSpec.anchors.grip = [0.2, 0, 0];
    const objects = baseObjects(project);
    const result = resolveInteractionSimulation(project, objects, 2.3);
    const itemGripWorld = [
      objects.cup.position[0],
      objects.cup.position[1],
      objects.cup.position[2] - 0.2,
    ];
    const receiverCarryWorld = [1.5, 1, 0];

    expect(result.ownership.cup).toMatchObject({ status: "held", holderId: "receiver" });
    expect(objects.cup.rotation[1]).toBeCloseTo(90, 8);
    expect(itemGripWorld[0]).toBeCloseTo(receiverCarryWorld[0], 8);
    expect(itemGripWorld[1]).toBeCloseTo(receiverCarryWorld[1], 8);
    expect(itemGripWorld[2]).toBeCloseTo(receiverCarryWorld[2], 8);
  });
});
