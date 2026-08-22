import { describe, expect, it } from "vitest";
import { minimumJerk, sampleVectorPath, tangentForVectorPath } from "./motion.js";

describe("cinematic motion curves", () => {
  it("keeps a two-point path linear before easing is applied", () => {
    expect(sampleVectorPath([[0, 0, 0], [10, 0, 0]], 0.5)).toEqual([5, 0, 0]);
  });

  it("uses arc-length progress across uneven control-point spacing", () => {
    const halfway = sampleVectorPath([[0, 0, 0], [1, 0, 0], [10, 0, 0]], 0.5);

    expect(halfway[0]).toBeGreaterThan(4);
    expect(halfway[0]).toBeLessThan(6);
    expect(tangentForVectorPath([[0, 0, 0], [1, 0, 0], [10, 0, 0]], 0.5)[0]).toBeCloseTo(1, 3);
  });

  it("starts and ends minimum-jerk motion with a soft velocity ramp", () => {
    expect(minimumJerk(0.01)).toBeLessThan(0.00002);
    expect(1 - minimumJerk(0.99)).toBeLessThan(0.00002);
    expect(minimumJerk(0.5)).toBeCloseTo(0.5, 8);
  });
});
