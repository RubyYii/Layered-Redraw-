import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
  CP03_RUNTIME_SCHEMA_VERSION,
  sha256Canonical,
} from "@layered-redraw/pact-cp03-contracts";
import { describe, expect, it } from "vitest";

import {
  applyGuardedInteractionPlan,
  compileGuardedInteractionPlan,
} from "../../scene-builder/src/cp03/capability-gate.js";
import { evaluateTimeline } from "../../scene-builder/src/director.js";
import { createInteractionDemoProject } from "../../scene-builder/src/interaction-demo.js";
import { hashProject } from "../../scene-builder/src/scene-patch-runtime.js";
import { CaseSessionLedger } from "../src/case-session.js";
import { persistCaseSessionTransition } from "../src/case-session-persistence.js";
import {
  coldInspect,
  createFoundationHarness,
} from "../src/create-foundation-harness.js";
import {
  ScriptedAdapter,
  textResponse,
  toolCallResponse,
} from "./scripted-adapter.js";

const executableDraft = ({ caseSessionId, turnId, parentSceneHash }) => ({
  identity: {
    draftId: "draft_e2e_runtime01",
    schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
    caseSessionId,
    turnId,
    parentSceneHash,
  },
  decision: { status: "PROPOSED", actionSequence: ["Reframe"] },
  creative: {
    interpretation: "The character carries the cup as a reversible proposal.",
    unresolvedAmbiguities: ["The memory does not identify a hand."],
    spatialIntent: "Approach the registered cup and perform pickup.",
    visualIntent: "Keep the action visibly provisional.",
    cameraIntent: "Keep the registered camera unchanged.",
    lightIntent: "Keep the registered light unchanged.",
    soundIntent: "Keep the registered room tone unchanged.",
    publicPoeticText: "The agent carries what the archive will not claim.",
    seamsAndContradictionsToPreserve: ["The moved cup remains a proposal."],
  },
  materials: {
    requestedAssetIds: [],
    requestedSpatialBridgeIds: [],
    provenanceAnchors: ["interaction-cup"],
    rightsRequirements: ["Use only the registered local scene."],
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
    rollbackRequirements: ["Discard the transient director overlay."],
    terminalIntent: null,
  },
  agency: {
    contributions: [],
    disagreements: [],
    guardianChallenge: "Execute only after approval of this exact draft hash.",
  },
});

const gateProject = () => {
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

describe("DSH to Ruby local CP03 vertical slice", () => {
  it("persists the exact approved Ruby result in the root CaseSession", async () => {
    const project = gateProject();
    const parentSceneHash = await hashProject(project);
    const turnId = "turn_e2e_runtime01";
    let submittedDraft;
    const adapter = new ScriptedAdapter([
      (options) => {
        if (options.sessionId === undefined) throw new Error("missing conductor session id");
        submittedDraft = executableDraft({
          caseSessionId: String(options.sessionId),
          turnId,
          parentSceneHash,
        });
        return toolCallResponse("tool_e2e_runtime", "pact_submit_draft", submittedDraft);
      },
      textResponse("proposal is waiting for viewer approval"),
    ]);
    const persistenceRoot = join(tmpdir(), `layered-redraw-pact-e2e-${randomUUID()}`);
    mkdirSync(persistenceRoot, { recursive: true });
    const harness = await createFoundationHarness({ persistenceRoot, scriptedAdapter: adapter });

    try {
      const conductor = await harness.createConductor(
        SessionId(`case_${randomUUID().replaceAll("-", "")}`),
        { parked: false },
      );
      conductor.agent.followup(createUserMessage({
        content: [{ type: "text", text: "let an agent carry the registered cup" }],
        source: { kind: "user" },
      }));
      await conductor.agent.whenIdle();
      await harness.ctx.sessions.flush(conductor.agent.session);

      const draftHash = harness.registry.currentDraft(turnId);
      expect(draftHash).toBe(await sha256Canonical(submittedDraft));
      const storedDraft = harness.registry.draftPayload(draftHash);
      expect(storedDraft).toEqual(submittedDraft);
      const approval = {
        schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
        approvalId: "approval_e2e_runtime01",
        caseSessionId: storedDraft.identity.caseSessionId,
        turnId: storedDraft.identity.turnId,
        draftHash,
        parentSceneHash,
        decision: "APPROVE",
        approvedBy: "viewer",
        decidedAt: "2026-08-22T00:00:00.000Z",
      };
      const plan = await compileGuardedInteractionPlan({
        draft: storedDraft,
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
      const cases = new CaseSessionLedger({
        caseSessionId: storedDraft.identity.caseSessionId,
        mode: "checkpoint",
        rootDshSessionId: String(conductor.agent.id),
        initialSceneHash: parentSceneHash,
      });
      const transition = cases.recordApprovedExecution({
        caseSessionId: storedDraft.identity.caseSessionId,
        turnId: storedDraft.identity.turnId,
        draftHash,
        approvalId: approval.approvalId,
        receiptId: result.receipt.receiptId,
        parentSceneHash: result.receipt.preconditionHash,
        resultSceneHash: result.receipt.resultSceneHash,
        actionSequence: storedDraft.decision.actionSequence,
        settledAt: result.receipt.appliedAt,
      });
      const durable = await persistCaseSessionTransition({
        ctx: harness.ctx,
        session: conductor.agent.session,
        transition,
      });
      const finalFrame = evaluateTimeline(result.project, result.project.director.timeline.duration);
      const persisted = await coldInspect(persistenceRoot, conductor.agent.id);

      expect(adapter.requests.every((request) => request.provider === "pact-fake")).toBe(true);
      expect(cases.snapshot()).toMatchObject({
        currentSceneHash: result.receipt.resultSceneHash,
        accumulatedActions: ["Reframe"],
        status: "OPEN",
        terminalAction: null,
      });
      expect(durable).toMatchObject({
        status: "DURABLE",
        sessionId: conductor.agent.id,
        transitionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(persisted.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          seq: durable.lastSeq,
          type: "pact/case-transition",
          data: expect.objectContaining({
            caseSessionId: storedDraft.identity.caseSessionId,
            turnId: storedDraft.identity.turnId,
            kind: "APPROVED_EXECUTION",
            transitionHash: durable.transitionHash,
          }),
        }),
      ]));
      expect(plan.clips.map((clip) => clip.type)).toEqual(["move", "interaction"]);
      expect(finalFrame.simulation.ownership["interaction-cup"])
        .toMatchObject({ status: "held", holderId: "interaction-actor-a" });
      expect(finalFrame.simulation.violations).toEqual([]);
      expect(result.receipt).toMatchObject({
        draftHash,
        approvalId: approval.approvalId,
        preconditionHash: parentSceneHash,
        changedObjectIds: ["interaction-actor-a", "interaction-cup"],
      });
    } finally {
      await harness.dispose();
    }
  });
});
