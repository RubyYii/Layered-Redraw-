import { describe, expect, it } from "vitest";
import {
  animationSlotForCharacterAction,
  createCharacterActionStateMachine,
} from "./character-action-runtime.js";

describe("character action state machine", () => {
  it("runs a controlled approach/reach/grasp/carry sequence", () => {
    const machine = createCharacterActionStateMachine();

    expect(machine.transition("approach", { targetId: "cup" }).ok).toBe(true);
    expect(machine.transition("reach", { targetId: "cup", hand: "right" }).ok).toBe(true);
    expect(machine.transition("grasp", { targetId: "cup", hand: "right" }).ok).toBe(true);
    expect(machine.transition("carry", { targetId: "cup" }).ok).toBe(true);
    expect(machine.snapshot()).toMatchObject({ state: "carry", sequence: 4 });
    expect(animationSlotForCharacterAction("approach")).toBe("move");
    expect(animationSlotForCharacterAction("grasp")).toBe("interact");
  });

  it("rejects impossible transitions and incomplete semantic context", () => {
    const machine = createCharacterActionStateMachine();

    expect(machine.transition("transfer", { targetId: "cup", recipientId: "other" }))
      .toMatchObject({ ok: false, code: "invalid_transition" });
    expect(machine.transition("reach", {})).toMatchObject({ ok: false, code: "missing_target" });
    expect(machine.transition("reach", { targetId: { unsafe: true }, hand: { side: "left" } }))
      .toMatchObject({ ok: false, code: "missing_target" });
    expect(machine.synchronize("release", { targetId: "cup" }))
      .toMatchObject({ ok: false, code: "missing_release_target" });
  });
});
