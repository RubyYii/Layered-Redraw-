import { describe, expect, it } from "vitest";
import catalogFixture from "../projects/window-case-cp02/asset-catalog.json" with { type: "json" };
import cp02ProjectFixture from "../projects/window-case-cp02/cp02-mutable-room.blockout.json" with { type: "json" };
import slotFixture from "../projects/window-case-cp02/scene-slots.json" with { type: "json" };
import {
  buildAgentObservation,
  compileAgentPlan,
  decideCp02ReframeIntent,
  planAgentIntent,
  runAgentTurn,
  runSceneCompositionTurn,
  validateAssetIntent,
  validateAgentIntent,
} from "./agent-runtime.js";
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
    ]);
  });
});
