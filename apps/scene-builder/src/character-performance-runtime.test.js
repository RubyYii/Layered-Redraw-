import { describe, expect, it } from "vitest";
import {
  characterPerformanceProfile,
  planTwoHandContactTargets,
  speechMouthEnvelope,
} from "./character-performance-runtime.js";

describe("character performance runtime", () => {
  it("binds locomotion, contact, gaze, and foot-lock policy to semantic actions", () => {
    expect(characterPerformanceProfile("approach", { targetId: "cup" })).toMatchObject({
      state: "approach",
      footLock: false,
      handWeight: 0,
      gazeWeight: 0.45,
    });
    expect(characterPerformanceProfile("reach", {
      targetId: "cup",
      hand: "both",
      phase: "reach",
      phaseProgress: 0.5,
      contactWeight: 0.7,
    })).toMatchObject({
      state: "reach",
      phase: "reach",
      hand: "both",
      handWeight: 0.7,
      footLock: true,
    });
  });

  it("creates deterministic bounded dialogue mouth and blink cues", () => {
    expect(speechMouthEnvelope({ utterance: "", progress: 0.5 })).toBe(0);
    expect(speechMouthEnvelope({ utterance: "A bounded line.", progress: 0 })).toBe(0);
    expect(speechMouthEnvelope({ utterance: "A bounded line.", progress: 1 })).toBe(0);
    const first = characterPerformanceProfile("speak", {
      utterance: "The room remembers us.",
      phaseProgress: 0.22,
    });
    const second = characterPerformanceProfile("speak", {
      utterance: "The room remembers us.",
      phaseProgress: 0.22,
    });
    expect(first).toEqual(second);
    expect(first.expressions.mouthOpen).toBeGreaterThan(0);
    expect(first.expressions.blinkLeft).toBeGreaterThan(0.6);
    expect(first.expressions.blinkRight).toBe(first.expressions.blinkLeft);
  });

  it("plans symmetric two-hand contacts in the actor contact frame", () => {
    const plan = planTwoHandContactTargets({
      center: [1, 1.2, 2],
      rightAxis: [0, 0, -2],
      targetWidth: 0.4,
    });
    expect(plan).toMatchObject({ valid: true, clamped: false, span: 0.288 });
    expect(plan.leftHand).toEqual([1, 1.2, 2.144]);
    expect(plan.rightHand).toEqual([1, 1.2, 1.856]);

    expect(planTwoHandContactTargets({
      center: [0, 0, 0],
      rightAxis: [0, 0, 0],
    })).toEqual({ valid: false, reason: "degenerate_right_axis" });
  });
});
