import {
  CP03_RUNTIME_SCHEMA_VERSION,
  sha256Canonical,
} from "@layered-redraw/pact-cp03-contracts";
import { describe, expect, it } from "vitest";

import { evaluateTimeline } from "../director.js";
import { createInteractionDemoProject } from "../interaction-demo.js";
import { hashProject } from "../scene-patch-runtime.js";
import {
  applyGuardedInteractionPlan,
  compileGuardedInteractionPlan,
} from "./capability-gate.js";

const createGateProject = () => {
  const project = createInteractionDemoProject();
  project.director.screenplay = "";
  project.director.timeline = {
    duration: 0,
    clips: [],
    issues: [],
    compiledScript: "",
    compiledAt: null,
  };
  return project;
};

const createDraft = async (project, overrides = {}) => ({
  identity: {
    draftId: "draft_gate_runtime01",
    schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
    caseSessionId: "case_gate_runtime01",
    turnId: "turn_gate_runtime01",
    parentSceneHash: await hashProject(project),
    ...overrides.identity,
  },
  decision: {
    status: "PROPOSED",
    actionSequence: ["Reframe"],
    ...overrides.decision,
  },
  creative: {
    interpretation: "The agent carries the cup as a reversible proposal.",
    unresolvedAmbiguities: ["The viewer did not assign a hand."],
    spatialIntent: "Approach the registered cup and perform its pickup affordance.",
    visualIntent: "Keep the action visibly provisional.",
    cameraIntent: "Keep the registered scene camera unchanged.",
    lightIntent: "Keep the registered scene light unchanged.",
    soundIntent: "Keep the registered room tone unchanged.",
    publicPoeticText: "The hand moves; the source remains.",
    seamsAndContradictionsToPreserve: ["The carried cup is not recovered truth."],
    ...overrides.creative,
  },
  materials: {
    requestedAssetIds: [],
    requestedSpatialBridgeIds: [],
    provenanceAnchors: ["interaction-cup"],
    rightsRequirements: ["Use only the registered local scene."],
    ...overrides.materials,
  },
  execution: {
    executionMode: "EXECUTABLE_PROPOSAL",
    semanticCapabilityCalls: [{
      capability: "performRegisteredInteraction",
      arguments: {
        actorId: "interaction-actor-a",
        targetId: "interaction-cup",
        affordance: "pickup",
      },
    }],
    expectedChanges: ["interaction-actor-a", "interaction-cup"],
    forbiddenChanges: ["interaction-floor", "interaction-backdrop"],
    forbiddenCapabilityIds: [],
    rollbackRequirements: ["Discard the transient director overlay."],
    terminalIntent: null,
    ...overrides.execution,
  },
  agency: {
    contributions: [],
    disagreements: [],
    guardianChallenge: "Execute only after approval of this exact draft hash.",
    witnessEvidence: {
      observations: [],
      uncertainties: [],
      evidenceAnchors: [],
    },
    dissentRecords: [],
    ...overrides.agency,
  },
});

const createApproval = async (draft, overrides = {}) => ({
  schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
  approvalId: "approval_gate_runtime01",
  caseSessionId: draft.identity.caseSessionId,
  turnId: draft.identity.turnId,
  draftHash: await sha256Canonical(draft),
  parentSceneHash: draft.identity.parentSceneHash,
  decision: "APPROVE",
  approvedBy: "viewer",
  decidedAt: "2026-08-22T00:00:00.000Z",
  ...overrides,
});

describe("CP03 viewer-approved capability gate", () => {
  it("rejects absent, rejected, or hash-mismatched viewer authority before planning", async () => {
    const project = createGateProject();
    const draft = await createDraft(project);
    const approval = await createApproval(draft);
    const frame = evaluateTimeline(project, 0);

    await expect(compileGuardedInteractionPlan({ draft, project, frame }))
      .rejects.toThrow(/approval required/i);
    await expect(compileGuardedInteractionPlan({
      draft,
      approval: { ...approval, decision: "REJECT" },
      project,
      frame,
    })).rejects.toThrow(/rejected/i);
    await expect(compileGuardedInteractionPlan({
      draft,
      approval: { ...approval, draftHash: "f".repeat(64) },
      project,
      frame,
    })).rejects.toThrow(/draft hash/i);
  });

  it("rejects stale scene identity and mismatched case or turn authority", async () => {
    const project = createGateProject();
    const draft = await createDraft(project);
    const approval = await createApproval(draft);
    const frame = evaluateTimeline(project, 0);

    await expect(compileGuardedInteractionPlan({
      draft: { ...draft, identity: { ...draft.identity, parentSceneHash: "b".repeat(64) } },
      approval,
      project,
      frame,
    })).rejects.toThrow(/draft hash|scene hash/i);
    await expect(compileGuardedInteractionPlan({
      draft,
      approval: { ...approval, turnId: "turn_other_runtime01" },
      project,
      frame,
    })).rejects.toThrow(/turn/i);
  });

  it.each([
    ["unknown actor", { actorId: "missing-actor" }, /actor/i],
    ["unknown target", { targetId: "missing-target" }, /target/i],
    ["unknown affordance", { affordance: "invented-action" }, /affordance/i],
    ["raw position", { position: [99, 0, 0] }, /validation|position/i],
  ])("rejects %s without mutating the project", async (_label, argumentOverride, errorPattern) => {
    const project = createGateProject();
    const before = structuredClone(project);
    const seedDraft = await createDraft(project);
    const call = seedDraft.execution.semanticCapabilityCalls[0];
    const draft = await createDraft(project, {
      execution: {
        ...seedDraft.execution,
        semanticCapabilityCalls: [{
          ...call,
          arguments: { ...call.arguments, ...argumentOverride },
        }],
      },
    });
    const approval = await createApproval(draft);

    await expect(compileGuardedInteractionPlan({
      draft,
      approval,
      project,
      frame: evaluateTimeline(project, 0),
    })).rejects.toThrow(errorPattern);
    expect(project).toEqual(before);
  });

  it("compiles one approved semantic draft into Ruby navigation and ownership clips", async () => {
    const project = createGateProject();
    const draft = await createDraft(project);
    const approval = await createApproval(draft);
    const plan = await compileGuardedInteractionPlan({
      draft,
      approval,
      project,
      frame: evaluateTimeline(project, 0),
      now: "2026-08-22T00:00:01.000Z",
    });

    expect(plan.clips.map((clip) => clip.type)).toEqual(["move", "interaction"]);
    expect(plan.clips.at(-1)).toMatchObject({
      targetId: "interaction-cup",
      secondaryTargetId: "interaction-actor-a",
      ownershipMode: "claim",
    });
    expect(plan).toMatchObject({
      draftHash: approval.draftHash,
      approvalId: approval.approvalId,
      preconditionHash: draft.identity.parentSceneHash,
      affectedObjectIds: ["interaction-actor-a", "interaction-cup"],
    });
  });

  it("rejects a capability that is explicitly forbidden even when it is registered", async () => {
    const project = createGateProject();
    const draft = await createDraft(project, {
      execution: {
        forbiddenCapabilityIds: ["performRegisteredInteraction"],
      },
    });
    const approval = await createApproval(draft);

    await expect(compileGuardedInteractionPlan({
      draft,
      approval,
      project,
      frame: evaluateTimeline(project, 0),
    })).rejects.toThrow(/forbidden capability/i);
  });

  it("accepts empty object restrictions, capability restrictions, and rollback requirements", async () => {
    const project = createGateProject();
    const draft = await createDraft(project, {
      execution: {
        forbiddenChanges: [],
        forbiddenCapabilityIds: [],
        rollbackRequirements: [],
      },
    });
    const approval = await createApproval(draft);
    const plan = await compileGuardedInteractionPlan({
      draft,
      approval,
      project,
      frame: evaluateTimeline(project, 0),
    });

    expect(plan.forbiddenObjectIds).toEqual([]);
    expect(plan.rollbackRequirements).toEqual([]);
  });

  it("applies a transient overlay without mutating the source and emits a linked receipt", async () => {
    const project = createGateProject();
    const before = structuredClone(project);
    const draft = await createDraft(project);
    const approval = await createApproval(draft);
    const plan = await compileGuardedInteractionPlan({
      draft,
      approval,
      project,
      frame: evaluateTimeline(project, 0),
      now: "2026-08-22T00:00:01.000Z",
    });
    const result = await applyGuardedInteractionPlan({
      project,
      plan,
      now: "2026-08-22T00:00:02.000Z",
    });

    expect(project).toEqual(before);
    expect(result.project).not.toBe(project);
    expect(result.project.director.timeline.clips.map((clip) => clip.id)).toEqual(
      plan.clips.map((clip) => clip.id),
    );
    const finalFrame = evaluateTimeline(result.project, result.project.director.timeline.duration);
    expect(finalFrame.simulation.ownership["interaction-cup"])
      .toMatchObject({ status: "held", holderId: "interaction-actor-a" });
    expect(finalFrame.simulation.violations).toEqual([]);
    expect(result.receipt).toMatchObject({
      schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
      draftHash: approval.draftHash,
      approvalId: approval.approvalId,
      preconditionHash: draft.identity.parentSceneHash,
      changedClipIds: plan.clips.map((clip) => clip.id),
      changedObjectIds: ["interaction-actor-a", "interaction-cup"],
    });
    expect(result.receipt.resultSceneHash).toBe(await hashProject(result.project));
    expect(Object.isFrozen(result.receipt)).toBe(true);
  });

  it("refuses to apply an approved plan after the source project changes", async () => {
    const project = createGateProject();
    const draft = await createDraft(project);
    const approval = await createApproval(draft);
    const plan = await compileGuardedInteractionPlan({
      draft,
      approval,
      project,
      frame: evaluateTimeline(project, 0),
    });
    const changed = structuredClone(project);
    changed.name = "stale scene";

    await expect(applyGuardedInteractionPlan({ project: changed, plan }))
      .rejects.toThrow(/stale|precondition/i);
  });
});
