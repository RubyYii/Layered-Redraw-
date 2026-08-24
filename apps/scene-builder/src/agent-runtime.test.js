import { describe, expect, it } from "vitest";
import catalogFixture from "../projects/window-case-cp02/asset-catalog.json" with { type: "json" };
import cp02ProjectFixture from "../projects/window-case-cp02/cp02-mutable-room.blockout.json" with { type: "json" };
import slotFixture from "../projects/window-case-cp02/scene-slots.json" with { type: "json" };
import {
  AGENT_BEHAVIOR_CONTRACT,
  buildAgentObservation,
  compileAgentBehaviorCommand,
  compileAgentPlan,
  decideCp02ReframeIntent,
  planAgentIntent,
  runAgentTurn,
  runAgentBehaviorTurn,
  runSceneCompositionTurn,
  validateAssetIntent,
  validateAgentIntent,
  validateAgentBehaviorCommand,
} from "./agent-runtime.js";
import { createInteractionDemoProject } from "./interaction-demo.js";
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

const createOwnershipProject = () => {
  const project = createInteractionDemoProject();
  project.director.timeline.clips = [];
  project.director.timeline.duration = 0;
  project.objects.find((object) => object.id === "interaction-actor-a").position = [-1.25, 0, 0];
  return project;
};

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

  it("turns an out-of-range semantic intent into deterministic navigation and interaction clips", () => {
    const project = createAgentProject([0, 0, 4]);
    const frame = evaluateTimeline(project, 0);
    const plan = planAgentIntent(project, frame, {
      kind: "interact", actorId: "actor", targetId: "recorder", affordance: "interrupt",
    });
    const clips = compileAgentPlan(plan, 2);

    expect(plan).toMatchObject({ ok: true, requiresNavigation: true });
    expect(plan.steps.map((step) => step.kind)).toEqual(["navigate", "interact"]);
    expect(clips.map((clip) => clip.type)).toEqual(["move", "interaction"]);
    expect(clips[0].start).toBe(2);
    expect(clips[1].start).toBeGreaterThan(clips[0].start);
    expect(compileAgentPlan(plan, 3)[0].id).not.toBe(clips[0].id);
  });

  it("preserves registered ownership metadata in Ruby's interaction clip", () => {
    const project = createOwnershipProject();
    const frame = evaluateTimeline(project, 0);
    const plan = planAgentIntent(project, frame, {
      kind: "interact",
      actorId: "interaction-actor-a",
      targetId: "interaction-cup",
      affordance: "pickup",
    });
    const interactionClip = compileAgentPlan(plan, 0).find((clip) => clip.type === "interaction");

    expect(interactionClip).toMatchObject({
      ownershipMode: "claim",
      holderAnchor: "carry",
      itemAnchor: "grip",
      actorContactAnchor: "grip",
    });
  });

  it("requires registered semantic targets for transfer and release affordances", () => {
    const project = createOwnershipProject();
    const frame = evaluateTimeline(project, 0);
    const base = {
      kind: "interact",
      actorId: "interaction-actor-a",
      targetId: "interaction-cup",
    };

    expect(validateAgentIntent(project, frame, { ...base, affordance: "handoff" }))
      .toMatchObject({ ok: false, code: "missing_recipient" });
    expect(validateAgentIntent(project, frame, {
      ...base,
      affordance: "handoff",
      recipientId: "interaction-destination-table",
    })).toMatchObject({ ok: false, code: "invalid_recipient" });
    expect(validateAgentIntent(project, frame, {
      ...base,
      affordance: "handoff",
      recipientId: "interaction-actor-b",
    })).toMatchObject({
      ok: true,
      intent: { ownershipMode: "transfer", recipientId: "interaction-actor-b" },
    });

    expect(validateAgentIntent(project, frame, { ...base, affordance: "place" }))
      .toMatchObject({ ok: false, code: "missing_placement_target" });
    expect(validateAgentIntent(project, frame, {
      ...base,
      affordance: "place",
      placementTargetId: "interaction-actor-b",
    })).toMatchObject({ ok: false, code: "invalid_placement_target" });
    expect(validateAgentIntent(project, frame, {
      ...base,
      affordance: "place",
      placementTargetId: "interaction-destination-table",
    })).toMatchObject({
      ok: true,
      intent: { ownershipMode: "release", placementTargetId: "interaction-destination-table" },
    });
  });

  it("exposes one callback boundary for a future model provider", async () => {
    const project = createAgentProject();
    const frame = evaluateTimeline(project, 0);
    const result = await runAgentTurn({
      project,
      frame,
      actorId: "actor",
      decide: async (observation) => ({
        kind: "interact",
        actorId: observation.actor.id,
        targetId: observation.perceivedEntities[0].id,
        affordance: observation.perceivedEntities[0].affordances[0].name,
      }),
    });

    expect(result.plan).toMatchObject({ ok: true, requiresNavigation: false });
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0].type).toBe("interaction");
  });
});

describe("constrained seven-action Agent behavior interface", () => {
  it("keeps performance control inside the deterministic runtime contract", () => {
    expect(AGENT_BEHAVIOR_CONTRACT.authority.runtime).toContain("phase-aware performance");
    expect(AGENT_BEHAVIOR_CONTRACT.performance).toMatchObject({
      contactPlanning: expect.stringContaining("two-hand"),
      bodyControl: expect.stringContaining("foot lock"),
      expressionControl: expect.stringContaining("deterministic"),
    });
  });
  it.each([
    [{ action: "approach", actorId: "interaction-actor-a", targetId: "interaction-cup" }, "move"],
    [{ action: "look", actorId: "interaction-actor-a", targetId: "interaction-cup" }, "behavior"],
    [{ action: "reach", actorId: "interaction-actor-a", targetId: "interaction-cup", hand: "both" }, "behavior"],
    [{ action: "grasp", actorId: "interaction-actor-a", targetId: "interaction-cup" }, "interaction"],
    [{ action: "transfer", actorId: "interaction-actor-a", targetId: "interaction-cup", recipientId: "interaction-actor-b" }, "interaction"],
    [{ action: "release", actorId: "interaction-actor-a", targetId: "interaction-cup", placementTargetId: "interaction-destination-table" }, "interaction"],
    [{ action: "speak", actorId: "interaction-actor-a", targetId: "interaction-actor-b", utterance: "请接住。" }, "dialogue"],
  ])("compiles %s without accepting transforms", (command, expectedType) => {
    const project = createOwnershipProject();
    const baseFrame = evaluateTimeline(project, 0);
    const frame = ["transfer", "release"].includes(command.action)
      ? {
        ...baseFrame,
        simulation: {
          ...baseFrame.simulation,
          ownership: {
            ...baseFrame.simulation.ownership,
            "interaction-cup": { status: "held", holderId: "interaction-actor-a" },
          },
        },
      }
      : baseFrame;
    const result = compileAgentBehaviorCommand(project, frame, command, {
      navigationOptions: { backend: "grid" },
    });

    expect(result.ok).toBe(true);
    expect(result.clips.at(-1)).toMatchObject({ type: expectedType, behaviorAction: command.action });
    expect(JSON.stringify(result.clips)).not.toMatch(/https?:\/\/|script|code/);
  });

  it("rejects raw transforms, unknown verbs and cross-actor control", async () => {
    const project = createAgentProject();
    const frame = evaluateTimeline(project, 0);

    expect(validateAgentBehaviorCommand(project, frame, {
      action: "look", actorId: "actor", targetId: "recorder", position: [0, 0, 0],
    })).toMatchObject({ ok: false, code: "direct_scene_control_forbidden" });
    expect(validateAgentBehaviorCommand(project, frame, {
      action: "teleport", actorId: "actor", targetId: "recorder",
    })).toMatchObject({ ok: false, code: "unsupported_action" });

    const result = await runAgentBehaviorTurn({
      project,
      frame,
      actorId: "actor",
      decide: async () => ({ action: "look", actorId: "someone-else", targetId: "recorder" }),
    });
    expect(result.receipt).toMatchObject({ status: "REJECTED", code: "actor_scope_violation", actorId: "actor" });
    expect(result.receipt.commandSha256).toHaveLength(64);
  });

  it("requires approach before a distant reach and enforces current ownership", () => {
    const distantProject = createAgentProject([0, 0, 5]);
    expect(validateAgentBehaviorCommand(distantProject, evaluateTimeline(distantProject, 0), {
      action: "reach", actorId: "actor", targetId: "recorder",
    })).toMatchObject({ ok: false, code: "out_of_reach", recoverable: true });

    const ownershipProject = createOwnershipProject();
    const frame = evaluateTimeline(ownershipProject, 0);
    expect(validateAgentBehaviorCommand(ownershipProject, frame, {
      action: "transfer",
      actorId: "interaction-actor-a",
      targetId: "interaction-cup",
      recipientId: "interaction-actor-b",
    })).toMatchObject({ ok: false, code: "ownership_violation" });
  });

  it("includes visible non-affordance characters as look and speak targets", () => {
    const project = createOwnershipProject();
    const observation = buildAgentObservation(project, evaluateTimeline(project, 0), "interaction-actor-a");

    expect(observation.perceivedEntities).toContainEqual(expect.objectContaining({
      id: "interaction-actor-b",
      role: "character",
      affordances: [],
    }));
  });

  it("emits a hash-bound accepted receipt at the future provider callback boundary", async () => {
    const project = createAgentProject();
    const frame = evaluateTimeline(project, 0);
    const result = await runAgentBehaviorTurn({
      project,
      frame,
      actorId: "actor",
      decide: async (observation) => ({
        schemaVersion: observation.behaviorContract.schemaVersion,
        action: "look",
        actorId: observation.actor.id,
        targetId: observation.perceivedEntities[0].id,
        requestId: "look-001",
      }),
    });

    expect(result.plan.ok).toBe(true);
    expect(result.clips[0]).toMatchObject({ type: "behavior", behaviorAction: "look" });
    expect(result.receipt).toMatchObject({
      status: "ACCEPTED",
      code: "semantic_action_compiled",
      action: "look",
      generatedClipIds: [result.clips[0].id],
    });
    expect(result.receipt.sceneSha256).toHaveLength(64);
    expect(result.receipt.clipsSha256).toHaveLength(64);
  });
});

describe("offline CP02 composition boundary", () => {
  const project = normalizeProject(cp02ProjectFixture);

  it.each([
    "我记得床边有一张小桌子、一把椅子，桌上放着一个旧杯子。",
    "I remember a small table and chair by the bed, with an old cup on the table.",
  ])("maps the frozen CP02 sentence to one bounded Reframe intent", async (text) => {
    const result = await runSceneCompositionTurn({
      project,
      text,
      decide: decideCp02ReframeIntent,
      catalog: catalogFixture,
      slots: slotFixture,
    });

    expect(result.intent.caseAction).toBe("Reframe");
    expect(result.intent.requests.map((item) => item.slotId)).toEqual([
      "memory-table-bedside",
      "memory-chair-near",
      "memory-cup-on-table",
    ]);
    expect(result.patchPreview.provider).toBe("deterministic-cp02-fixture-v1");
    expect(result.patchPreview.operations.every((operation) => !Object.hasOwn(operation, "position"))).toBe(true);
  });

  it("maps the fixed thermos follow-up to one additive request without replacing the cup", async () => {
    const result = await runSceneCompositionTurn({
      project,
      text: "桌上还应该有一个旧保温杯，但不要替换那个杯子。",
      decide: decideCp02ReframeIntent,
      catalog: catalogFixture,
      slots: slotFixture,
    });

    expect(result.intent.requests).toEqual([{
      operation: "add",
      semanticClass: "thermos",
      slotId: "memory-thermos-on-table",
    }]);
    expect(result.patchPreview).toMatchObject({
      patchId: "CP02-REFRAME-THERMOS-001",
      operations: [{
        kind: "add",
        assetId: "CP02-THERMOS-CARRIER-001",
        slotId: "memory-thermos-on-table",
      }],
    });
    expect(result.patchPreview.operations.some((operation) => operation.kind === "replace")).toBe(false);
  });

  it.each(["position", "rotation", "scale", "path", "url", "code", "script"])(
    "rejects provider-authored %s",
    (field) => {
      const raw = {
        kind: "compose",
        caseAction: "Reframe",
        requests: [
          { operation: "add", semanticClass: "table", slotId: "memory-table-bedside" },
        ],
        reason: "bounded fixture",
        [field]: field === "url" ? "https://example.com/a.glb" : [1, 2, 3],
      };

      expect(validateAssetIntent(raw, slotFixture)).toMatchObject({
        ok: false,
        code: "direct_scene_control_forbidden",
      });
    },
  );

  it("withholds unsupported language instead of pretending to understand it", async () => {
    const result = await runSceneCompositionTurn({
      project,
      text: "Please redesign the whole room however you like.",
      decide: decideCp02ReframeIntent,
      catalog: catalogFixture,
      slots: slotFixture,
    });

    expect(result.intent).toEqual({ kind: "withhold", code: "unsupported_fixture_utterance" });
    expect(result.patchPreview).toMatchObject({ outcome: "WITHHELD", provider: "deterministic-cp02-fixture-v1" });
  });

  it("does not expose transforms, local paths, URLs, or credentials to the decision provider", async () => {
    let observed;
    await runSceneCompositionTurn({
      project,
      text: "unsupported",
      decide: async (observation) => {
        observed = observation;
        return { kind: "withhold", code: "inspection_only" };
      },
      catalog: catalogFixture,
      slots: slotFixture,
    });

    const serialized = JSON.stringify(observed);
    expect(serialized).not.toMatch(/position|rotation|\/Users\/|https?:\/\/|credential|token/i);
    expect(observed.authoredSlots).toEqual([
      { id: "memory-table-bedside", semanticClass: "table" },
      { id: "memory-chair-near", semanticClass: "chair" },
      { id: "memory-chair-withdrawn", semanticClass: "chair" },
      { id: "memory-cup-on-table", semanticClass: "cup" },
      { id: "memory-thermos-on-table", semanticClass: "thermos" },
    ]);
  });
});
