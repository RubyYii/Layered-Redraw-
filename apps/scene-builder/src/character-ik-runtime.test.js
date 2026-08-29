import { describe, expect, it } from "vitest";
import {
  constrainLimbTarget,
  selectIkSolvePolicy,
  stepIkIterationBudget,
} from "./character-ik-runtime.js";

describe("character IK runtime policy", () => {
  it("clamps unreachable targets short of the straight-limb singularity", () => {
    const result = constrainLimbTarget({
      origin: [0, 0, 0],
      target: [10, 0, 0],
      currentEffector: [2, 0, 0],
      segmentLengths: [1, 1],
    });

    expect(result).toMatchObject({ valid: true, clamped: true, reason: "outside_max_reach" });
    expect(result.maxReach).toBeCloseTo(1.97);
    expect(result.effectiveTarget).toEqual([result.maxReach, 0, 0]);
  });

  it("keeps targets outside the inner dead zone of unequal segments", () => {
    const result = constrainLimbTarget({
      origin: [0, 0, 0],
      target: [0.1, 0, 0],
      currentEffector: [2.5, 0, 0],
      segmentLengths: [2, 0.5],
    });

    expect(result).toMatchObject({ valid: true, clamped: true, reason: "inside_min_reach" });
    expect(result.minReach).toBeGreaterThan(1.5);
    expect(result.effectiveDistance).toBeCloseTo(result.minReach);
  });

  it("supports bounded multi-segment creature chains", () => {
    const result = constrainLimbTarget({
      origin: [0, 0, 0],
      target: [0, 0, 5],
      currentEffector: [0, 0, 2.4],
      segmentLengths: [0.8, 0.7, 0.6, 0.5],
      singularityMargin: 0,
    });

    expect(result).toMatchObject({ valid: true, clamped: true, maxReach: 2.6 });
    expect(result.effectiveTarget[2]).toBeCloseTo(2.6);
  });

  it("rejects zero-length chains and non-finite targets", () => {
    expect(constrainLimbTarget({
      origin: [0, 0, 0],
      target: [1, 0, 0],
      currentEffector: [1, 0, 0],
      segmentLengths: [0, 1],
    })).toMatchObject({ valid: false, reason: "degenerate_chain" });
    expect(constrainLimbTarget({
      origin: [0, 0, 0],
      target: [Number.NaN, 0, 0],
      currentEffector: [1, 0, 0],
      segmentLengths: [1, 1],
    })).toMatchObject({ valid: false, reason: "non_finite_target" });
  });

  it("assigns deterministic full, near, mid, far, distant, and offscreen budgets", () => {
    expect(selectIkSolvePolicy({ fullQuality: true, visible: false, distance: 500 })).toEqual({
      tier: "export-full", iterations: 8,
    });
    expect(selectIkSolvePolicy({ selected: true, visible: false, distance: 500 })).toEqual({
      tier: "selected-full", iterations: 8,
    });
    expect(selectIkSolvePolicy({ visible: true, distance: 12 }).iterations).toBe(8);
    expect(selectIkSolvePolicy({ visible: true, distance: 30 }).iterations).toBe(5);
    expect(selectIkSolvePolicy({ visible: true, distance: 60 }).iterations).toBe(3);
    expect(selectIkSolvePolicy({ visible: true, distance: 120 }).iterations).toBe(1);
    expect(selectIkSolvePolicy({ visible: false, distance: 12 })).toEqual({ tier: "offscreen", iterations: 1 });
  });

  it("moves only one iteration per frame between quality tiers", () => {
    expect(stepIkIterationBudget(8, 1)).toBe(7);
    expect(stepIkIterationBudget(1, 8)).toBe(2);
    expect(stepIkIterationBudget(5, 5)).toBe(5);
  });

  it("evaluates a many-character policy set without shared mutable state", () => {
    const policies = Array.from({ length: 2_000 }, (_, index) => selectIkSolvePolicy({
      distance: index % 121,
      visible: index % 7 !== 0,
      selected: index === 17,
    }));
    expect(policies).toHaveLength(2_000);
    expect(policies[17]).toEqual({ tier: "selected-full", iterations: 8 });
    expect(policies.filter((policy) => policy.tier === "offscreen").length).toBeGreaterThan(250);
    expect(new Set(policies.map((policy) => policy.iterations))).toEqual(new Set([1, 3, 5, 8]));
  });
});
