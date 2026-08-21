import { describe, expect, it } from "vitest";
import {
  attachmentPosition,
  interactionPhaseForProgress,
  proceduralInteractionPose,
  rotateLocalOffset,
} from "./interaction-runtime.js";

describe("semantic interaction runtime", () => {
  it("separates anticipation, reach, contact, and recovery", () => {
    expect(interactionPhaseForProgress(0.1).name).toBe("anticipation");
    expect(interactionPhaseForProgress(0.4).name).toBe("reach");
    expect(interactionPhaseForProgress(0.6)).toMatchObject({ name: "contact", contactWeight: 1 });
    expect(interactionPhaseForProgress(0.9).name).toBe("recovery");
  });

  it("rotates carried offsets with the holder instead of using world-space addition", () => {
    const rotated = rotateLocalOffset([1, 0, 0], [0, 90, 0]);
    const position = attachmentPosition([3, 1, 2], [0, 90, 0], [1, 0, 0]);

    expect(rotated[0]).toBeCloseTo(0, 6);
    expect(rotated[2]).toBeCloseTo(-1, 6);
    expect(position).toEqual(expect.arrayContaining([expect.any(Number), 1, 1]));
    expect(position[0]).toBeCloseTo(3, 6);
  });

  it("creates reversible anticipation, reach, and contact offsets", () => {
    const anticipation = proceduralInteractionPose([0, 0, 0], [0, 0, 2], {
      name: "anticipation", progress: 1, contactWeight: 0,
    });
    const contact = proceduralInteractionPose([0, 0, 0], [0, 0, 2], {
      name: "contact", progress: 0.5, contactWeight: 1,
    });

    expect(anticipation.actorOffset[2]).toBeLessThan(0);
    expect(contact.actorOffset[2]).toBeGreaterThan(0);
    expect(contact.targetOffset[2]).toBeGreaterThan(0);
    expect(contact.targetScale).toBeGreaterThan(1);
    expect(contact.effectorWeight).toBeCloseTo(0.92);
  });
});
