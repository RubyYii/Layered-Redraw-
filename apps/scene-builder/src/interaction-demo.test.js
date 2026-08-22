import { describe, expect, it } from "vitest";
import { compileScreenplay, evaluateTimeline } from "./director.js";
import { createInteractionDemoProject, INTERACTION_DEMO_DURATION } from "./interaction-demo.js";

describe("ten-second interaction simulation fixture", () => {
  it("contains one continuous camera and three legal ownership transitions", () => {
    const project = createInteractionDemoProject();
    const ownershipClips = project.director.timeline.clips.filter((clip) => clip.ownershipMode !== "none");

    expect(project.director.timeline.duration).toBe(INTERACTION_DEMO_DURATION);
    expect(project.objects.filter((object) => object.entity.role === "character" && !object.parentId)).toHaveLength(2);
    expect(ownershipClips.map((clip) => clip.ownershipMode)).toEqual(["claim", "transfer", "release"]);
    expect(project.director.timeline.clips.filter((clip) => clip.type === "camera")).toHaveLength(1);
  });

  it("moves ownership from actor A to actor B and then to a stable surface", () => {
    const project = createInteractionDemoProject();
    const heldByA = evaluateTimeline(project, 4.2);
    const heldByB = evaluateTimeline(project, 7.2);
    const placed = evaluateTimeline(project, 9.6);

    expect(heldByA.simulation.ownership["interaction-cup"]).toMatchObject({
      status: "held",
      holderId: "interaction-actor-a",
    });
    expect(heldByB.simulation.ownership["interaction-cup"]).toMatchObject({
      status: "held",
      holderId: "interaction-actor-b",
    });
    expect(placed.simulation.ownership["interaction-cup"]).toMatchObject({
      status: "placed",
      placementTargetId: "interaction-destination-table",
    });
    expect(placed.objects["interaction-cup"].position[0]).toBeCloseTo(4.15, 8);
    expect(placed.objects["interaction-cup"].position[1]).toBeCloseTo(1.38, 8);
    expect(placed.objects["interaction-cup"].position[2]).toBeCloseTo(0, 8);
    expect(placed.simulation.violations).toEqual([]);
  });

  it("keeps contact motion continuous around the pickup constraint", () => {
    const project = createInteractionDemoProject();
    const before = evaluateTimeline(project, 2.99).objects["interaction-cup"].position;
    const after = evaluateTimeline(project, 3).objects["interaction-cup"].position;
    const delta = Math.hypot(...after.map((value, axis) => value - before[axis]));

    expect(delta).toBeLessThan(0.08);
    expect(evaluateTimeline(project, 5.95).simulation.contacts[0]).toMatchObject({
      mode: "transfer",
      fromHolderId: "interaction-actor-a",
      toHolderId: "interaction-actor-b",
    });
  });

  it("keeps a persistent surface-contact pose during both carry segments", () => {
    const project = createInteractionDemoProject();
    const carriedByA = evaluateTimeline(project, 4.2).interactionPoses;
    const carriedByB = evaluateTimeline(project, 7.2).interactionPoses;

    expect(carriedByA).toContainEqual(expect.objectContaining({
      id: "persistent-hold-interaction-cup",
      actorId: "interaction-actor-a",
      targetId: "interaction-cup",
      ownershipMode: "hold",
      contactAnchor: "grip",
    }));
    expect(carriedByB).toContainEqual(expect.objectContaining({
      id: "persistent-hold-interaction-cup",
      actorId: "interaction-actor-b",
      targetId: "interaction-cup",
      ownershipMode: "hold",
      contactAnchor: "grip",
    }));

    const cup = project.objects.find((object) => object.id === "interaction-cup");
    const hand = project.objects.find((object) => object.id === "interaction-actor-a-hand");
    const requiredClearance = cup.dimensions[0] / 2 + hand.dimensions[0] / 2;
    for (const actorId of ["interaction-actor-a", "interaction-actor-b"]) {
      const actor = project.objects.find((object) => object.id === actorId);
      const carry = actor.interactionSpec.anchors.carry;
      const restEffector = actor.interactionSpec.anchors.effector;
      expect(Math.hypot(carry[0] - restEffector[0], carry[2] - restEffector[2]))
        .toBeGreaterThan(requiredClearance);
    }
  });

  it("keeps every 60 Hz sample free of character and prop penetration", () => {
    const project = createInteractionDemoProject();
    let resolvedContacts = 0;

    for (let tick = 0; tick <= INTERACTION_DEMO_DURATION * 60; tick += 1) {
      const frame = evaluateTimeline(project, tick / 60);
      resolvedContacts += frame.simulation.collision.resolvedCount;
      expect(frame.simulation.collision.safe, `tick ${tick}`).toBe(true);
      expect(frame.simulation.collision.residualPenetration, `tick ${tick}`).toBeLessThan(1e-6);
    }

    const pickup = evaluateTimeline(project, 3);
    const place = evaluateTimeline(project, 8.65);
    expect(resolvedContacts).toBeGreaterThan(0);
    expect(pickup.objects["interaction-actor-a"].position[0]).toBeLessThanOrEqual(-1.409);
    expect(place.objects["interaction-actor-b"].position[0]).toBeLessThanOrEqual(3.016);
    expect(place.interactions[0]).toMatchObject({
      contactTargetId: "interaction-cup",
      contactAnchor: "grip",
    });
  });

  it("recompiles the readable script without losing ownership semantics", () => {
    const project = createInteractionDemoProject();
    const compiled = compileScreenplay(project.director.screenplay, project);

    expect(compiled.issues.filter((item) => item.severity === "error")).toEqual([]);
    expect(compiled.clips.filter((clip) => clip.type === "interaction").map((clip) => clip.ownershipMode))
      .toEqual(["claim", "transfer", "release"]);
    expect(compiled.clips.filter((clip) => clip.type === "interaction").map((clip) => clip.actorContactAnchor))
      .toEqual(["grip", "grip", "grip"]);
    expect(compiled.duration).toBe(10);
  });
});
