import { describe, expect, it } from "vitest";
import { buildAgentObservation, validateAgentIntent } from "./agent-runtime.js";
import { createEntityConfig, normalizeProject } from "./model.js";
import { evaluateTimeline } from "./director.js";

const createAgentProject = (actorPosition = [0, 0, 1]) => normalizeProject({
  objects: [
    {
      id: "actor",
      type: "group",
      position: actorPosition,
      entity: createEntityConfig("character"),
      asset: { nodes: { effector: "Probe" } },
      interactionSpec: { anchors: { effector: [0.7, 1, 0] } },
    },
    {
      id: "recorder",
      type: "box",
      position: [0, 1, 0],
      entity: createEntityConfig("prop", { state: "idle" }),
      interactionSpec: {
        anchors: { switch: [0, 0.2, 0.2] },
        affordances: {
          interrupt: {
            action: "interrupt_audio",
            targetAnchor: "switch",
            actorNode: "effector",
            maxDistance: 1.2,
            resultingState: "muted",
          },
        },
      },
    },
  ],
});

describe("LLM agent intent boundary", () => {
  it("builds a semantic observation without exposing transform write commands", () => {
    const project = createAgentProject();
    const observation = buildAgentObservation(project, evaluateTimeline(project, 0), "actor");

    expect(observation.perceivedEntities[0]).toMatchObject({
      id: "recorder",
      state: "idle",
      affordances: [{ name: "interrupt", action: "interrupt_audio", inRange: true }],
    });
    expect(observation.intentContract.forbiddenFields).toContain("position");
  });

  it("accepts declared affordances and rejects direct transform control", () => {
    const project = createAgentProject();
    const frame = evaluateTimeline(project, 0);
    const accepted = validateAgentIntent(project, frame, {
      kind: "interact",
      actorId: "actor",
      targetId: "recorder",
      affordance: "interrupt",
      reason: "The recorder is emitting unlicensed audio.",
    });
    const rejected = validateAgentIntent(project, frame, {
      kind: "interact",
      actorId: "actor",
      targetId: "recorder",
      affordance: "interrupt",
      position: [0, 0, 0],
    });

    expect(accepted).toMatchObject({
      ok: true,
      intent: { action: "interrupt_audio", actorNode: "effector", targetAnchor: "switch" },
    });
    expect(rejected).toMatchObject({ ok: false, code: "direct_transform_forbidden" });
  });

  it("returns a recoverable navigation request when the target is out of range", () => {
    const project = createAgentProject([0, 0, 4]);
    const result = validateAgentIntent(project, evaluateTimeline(project, 0), {
      kind: "interact",
      actorId: "actor",
      targetId: "recorder",
      affordance: "interrupt",
    });

    expect(result).toMatchObject({ ok: false, code: "out_of_range", recoverable: true });
  });
});
