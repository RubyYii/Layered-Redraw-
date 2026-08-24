import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionId } from "@deepseek-ai/dsh-session";
import { sha256Canonical } from "@layered-redraw/pact-cp03-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyGuardedInteractionPlan,
  compileGuardedInteractionPlan,
} from "../../scene-builder/src/cp03/capability-gate.js";
import { evaluateTimeline } from "../../scene-builder/src/director.js";
import { createInteractionDemoProject } from "../../scene-builder/src/interaction-demo.js";
import { hashProject } from "../../scene-builder/src/scene-patch-runtime.js";
import {
  assembleCouncilDraft,
  CaseSessionLedger,
  coldInspect,
  createFoundationHarness,
  durableConductorCommit,
  durableCouncilShard,
  freezeCouncilTurn,
  persistCaseSessionTransition,
} from "../src/index.js";
import {
  createFullCouncilFixtures,
  fullCouncilTurnInput,
  roleOrder,
} from "./council-fixtures.js";
import { ScriptedAdapter } from "./scripted-adapter.js";

const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
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

const shardIdentityFor = (base, turn, session) => ({
  ...base,
  caseSessionId: turn.snapshot.caseSessionId,
  turnId: turn.snapshot.turnId,
  snapshotHash: turn.snapshotHash,
  parentSceneHash: turn.snapshot.parentSceneHash,
  registryVersion: turn.snapshot.registryVersion,
  routingManifestVersion: turn.snapshot.routingManifestVersion,
  deadlineId: turn.snapshot.deadlineId,
  childSessionId: String(session.id),
});

const councilShardsForProject = ({ fixtures, turn, sessions, guardianDisposition }) => ({
  CaseConductor: {
    ...shardIdentityFor(fixtures.shards.CaseConductor, turn, sessions.CaseConductor),
    content: {
      ...fixtures.shards.CaseConductor.content,
      initialInterpretation: "Treat the registered cup movement as a reversible proposal.",
      candidateActionSequence: ["Reframe"],
      terminalIntent: null,
    },
  },
  Witness: {
    ...shardIdentityFor(fixtures.shards.Witness, turn, sessions.Witness),
    content: {
      observations: [{
        observationId: "observation_interaction_cup01",
        text: "The fictional local image reference supports only a visible cup relation.",
        inputRefIds: ["input_image01", "input_text01"],
      }],
    },
  },
  Archivist: {
    ...shardIdentityFor(fixtures.shards.Archivist, turn, sessions.Archivist),
    content: {
      requestedAssetIds: ["interaction-cup"],
      requestedSpatialBridgeIds: [],
      provenanceAnchors: [
        "input_image01",
        "interaction-backdrop",
        "interaction-floor",
      ],
      rightsRequirements: ["rights-local-scene"],
      unavailableRefs: [],
    },
  },
  Rewriter: {
    ...shardIdentityFor(fixtures.shards.Rewriter, turn, sessions.Rewriter),
    content: {
      ...fixtures.shards.Rewriter.content,
      interpretation: "Let the agent carry the registered cup as a provisional relation.",
      spatialIntent: "Approach the registered cup and perform its pickup affordance.",
      publicPoeticText: "The agent carries what the archive will not claim.",
      semanticCapabilityCalls: [{
        capability: "performRegisteredInteraction",
        arguments: {
          actorId: "interaction-actor-a",
          targetId: "interaction-cup",
          affordance: "pickup",
        },
      }],
      expectedChanges: ["interaction-actor-a", "interaction-cup"],
    },
  },
  Guardian: {
    ...shardIdentityFor(fixtures.shards.Guardian, turn, sessions.Guardian),
    content: {
      ...fixtures.shards.Guardian.content,
      disposition: guardianDisposition,
      forbiddenCapabilityIds: ["rawTransform"],
      requiredSourceLockIds: ["interaction-backdrop", "interaction-floor"],
      requiredRightsIds: ["rights-local-scene"],
      requiredRollbackCapabilityIds: ["rollback-transient-overlay"],
      contestedEvidenceIds: [],
      requiredDissentRecords: [{
        dissentId: "dissent_guardian01",
        text: "Do not present the carried cup as recovered historical fact.",
        evidenceIds: ["input_text01"],
      }],
      guardianChallenge: "Execute only after approval of this exact hash-bound proposal.",
    },
  },
});

const buildDurableCouncil = async ({
  guardianDisposition = "ALLOW",
  selectedDissentIds = ["dissent_guardian01"],
} = {}) => {
  const project = gateProject();
  const parentSceneHash = await hashProject(project);
  const fixtures = await createFullCouncilFixtures(() => 0);
  let monotonicMs = 1_000;
  const persistenceRoot = join(
    tmpdir(),
    `layered-redraw-council-ruby-${randomUUID()}`,
  );
  mkdirSync(persistenceRoot, { recursive: true });
  const harnessAdapter = new ScriptedAdapter([]);
  const harness = await createFoundationHarness({
    persistenceRoot,
    scriptedAdapter: harnessAdapter,
    toolProfile: "council-v2",
    now: () => monotonicMs,
  });
  cleanups.push(() => harness.dispose());
  if (harness.councilRegistry === undefined) {
    throw new Error("expected council-v2 registry");
  }
  const sessions = Object.fromEntries(
    roleOrder.map((role) => [
      role,
      harness.ctx.sessions.create(SessionId(randomUUID())),
    ]),
  );
  const setMonotonicMs = (value) => {
    monotonicMs = value;
  };
  const turn = await freezeCouncilTurn({
    ...fullCouncilTurnInput,
    caseSessionId: `case_ruby_${randomUUID().replaceAll("-", "")}`,
    turnId: `turn_ruby_${randomUUID().replaceAll("-", "")}`,
    parentSceneHash,
    sourceLockIds: ["interaction-backdrop", "interaction-floor"],
    registeredAssetIds: ["interaction-cup"],
    registeredSpatialBridgeIds: [],
    registeredSceneObjectIds: [
      "interaction-actor-a",
      "interaction-backdrop",
      "interaction-cup",
      "interaction-floor",
    ],
    registeredAffordanceIds: ["pickup"],
    registeredRightsIds: ["rights-local-scene"],
    supportedRollbackCapabilityIds: ["rollback-transient-overlay"],
    allowedSemanticCapabilityIds: ["performRegisteredInteraction"],
    caseActionState: {
      status: "OPEN",
      currentSceneHash: parentSceneHash,
      accumulatedActions: [],
      terminalAction: null,
    },
    deadlineId: `deadline_ruby_${randomUUID().replaceAll("-", "")}`,
    now: () => 0,
  });
  const shards = councilShardsForProject({
    fixtures,
    turn,
    sessions,
    guardianDisposition,
  });
  const submissions = harness.registry;
  for (const role of roleOrder) {
    cleanups.push(submissions.bind(sessions[role].id, role));
  }
  const registry = harness.councilRegistry;
  registry.openTurn(turn);

  const syntheticAgentDispatch = vi.fn((_request, payload) => structuredClone(payload));
  const payloadHashByRole = {};
  const durableShardReceipts = [];
  for (const role of roleOrder) {
    const shard = syntheticAgentDispatch(
      { phase: "SHARD", role },
      shards[role],
    );
    const accepted = await registry.acceptShard(sessions[role], shard);
    if (!accepted.accepted) {
      throw new Error(`expected accepted ${role} shard: ${accepted.reasonCode}`);
    }
    const durable = await durableCouncilShard({
      ctx: harness.ctx,
      registry,
      session: sessions[role],
      receipt: accepted,
    });
    durableShardReceipts.push(durable);
    payloadHashByRole[role] = accepted.payloadHash;
  }

  registry.closeSelectionBarrier(turn.snapshot.turnId);
  const commit = syntheticAgentDispatch(
    { phase: "CONDUCTOR_COMMIT", role: "CaseConductor" },
    {
      schemaVersion: "cp03-council/0.2",
      turnId: turn.snapshot.turnId,
      status: "PROPOSED",
      actionSequence: ["Reframe"],
      selectedShardHashes: roleOrder.map((role) => payloadHashByRole[role]),
      selectedDissentIds,
      terminalIntent: null,
    },
  );
  const acceptedCommit = await registry.acceptCommit(sessions.CaseConductor, commit);
  if (!acceptedCommit.accepted) {
    throw new Error(`expected accepted commit: ${acceptedCommit.reasonCode}`);
  }
  const durableCommitReceipt = await durableConductorCommit({
    ctx: harness.ctx,
    registry,
    session: sessions.CaseConductor,
    receipt: acceptedCommit,
  });

  return {
    project,
    parentSceneHash,
    turn,
    shards,
    sessions,
    harness,
    harnessAdapter,
    persistenceRoot,
    submissions,
    registry,
    proposal: registry.durableProposal(turn.snapshot.turnId),
    durableShardReceipts,
    durableCommitReceipt,
    syntheticAgentDispatch,
    setMonotonicMs,
  };
};

const assemble = (council, proposal = council.proposal, times = [2_000, 2_001]) => {
  const now = vi.fn()
    .mockReturnValueOnce(times[0])
    .mockReturnValueOnce(times[1]);
  return assembleCouncilDraft({ turn: council.turn, proposal, now });
};

const storeAssembledDraft = async (council, assembled, acceptedAtMonotonicMs = 2_100) => {
  expect(assembled.status).toBe("ASSEMBLED");
  if (assembled.status !== "ASSEMBLED") throw new Error("draft was not assembled");
  council.setMonotonicMs(acceptedAtMonotonicMs);
  const receipt = await council.submissions.acceptDraft(
    council.sessions.CaseConductor,
    assembled.draft,
  );
  expect(receipt).toMatchObject({
    accepted: true,
    payloadHash: assembled.draftHash,
    acceptedAtMonotonicMs,
  });
  const stored = council.submissions.draftPayload(receipt.payloadHash);
  expect(stored).toEqual(assembled.draft);
  return { receipt, draft: stored };
};

const approvalFor = async (draft, decision = "APPROVE", decidedAt = "2026-08-23T12:00:00.000Z") => ({
  schemaVersion: "cp03-runtime/0.1",
  approvalId: `approval_ruby_${randomUUID().replaceAll("-", "")}`,
  caseSessionId: draft.identity.caseSessionId,
  turnId: draft.identity.turnId,
  draftHash: await sha256Canonical(draft),
  parentSceneHash: draft.identity.parentSceneHash,
  decision,
  approvedBy: "viewer",
  decidedAt,
});

const caseLedgerFor = (council) => new CaseSessionLedger({
  caseSessionId: council.turn.snapshot.caseSessionId,
  mode: "checkpoint",
  rootDshSessionId: String(council.sessions.CaseConductor.id),
  initialSceneHash: council.parentSceneHash,
});

const appendCouncilState = (council, result, observedAtMonotonicMs = 2_100) => {
  council.sessions.CaseConductor.append("pact/council-state", {
    caseSessionId: council.turn.snapshot.caseSessionId,
    turnId: council.turn.snapshot.turnId,
    state: result.status,
    reasonCodes: [...result.reasonCodes],
    observedAtMonotonicMs,
  });
};

describe("assembled council draft to viewer-approved Ruby vertical slice", () => {
  it("carries five durable agent shards and one minimal commit through Ruby and the root CaseSession", async () => {
    const council = await buildDurableCouncil();
    expect(council.syntheticAgentDispatch).toHaveBeenCalledTimes(6);
    expect(council.durableShardReceipts).toHaveLength(5);
    expect(council.durableShardReceipts.every(
      (receipt) => receipt.status === "DURABLE",
    )).toBe(true);
    expect(council.durableCommitReceipt.status).toBe("DURABLE");
    expect(council.proposal.durableShards).toHaveLength(5);
    expect(council.proposal.durableCommit).not.toBeNull();
    expect(council.sessions.CaseConductor.events.filter(
      (event) => event.type === "pact/draft",
    )).toHaveLength(0);

    const assembled = await assemble(council);
    const stored = await storeAssembledDraft(council, assembled);
    expect(stored.draft.agency.contributions.map((entry) => entry.role).sort())
      .toEqual([...roleOrder].sort());
    expect(council.sessions.CaseConductor.events.filter(
      (event) => event.type === "pact/draft",
    )).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          payloadHash: stored.receipt.payloadHash,
          payload: stored.draft,
        }),
      }),
    ]);
    expect(council.syntheticAgentDispatch.mock.calls.every(([, payload]) =>
      payload.identity?.draftId === undefined
    )).toBe(true);

    const approval = await approvalFor(stored.draft);
    const plan = await compileGuardedInteractionPlan({
      draft: stored.draft,
      approval,
      project: council.project,
      frame: evaluateTimeline(council.project, 0),
      now: "2026-08-23T12:00:01.000Z",
    });
    const result = await applyGuardedInteractionPlan({
      project: council.project,
      plan,
      now: "2026-08-23T12:00:02.000Z",
    });
    const cases = caseLedgerFor(council);
    const transition = cases.recordApprovedExecution({
      caseSessionId: stored.draft.identity.caseSessionId,
      turnId: stored.draft.identity.turnId,
      draftHash: stored.receipt.payloadHash,
      approvalId: approval.approvalId,
      receiptId: result.receipt.receiptId,
      parentSceneHash: result.receipt.preconditionHash,
      resultSceneHash: result.receipt.resultSceneHash,
      actionSequence: stored.draft.decision.actionSequence,
      settledAt: result.receipt.appliedAt,
    });
    const durableTransition = await persistCaseSessionTransition({
      ctx: council.harness.ctx,
      session: council.sessions.CaseConductor,
      transition,
    });
    const finalFrame = evaluateTimeline(
      result.project,
      result.project.director.timeline.duration,
    );
    const coldRoot = await coldInspect(
      council.persistenceRoot,
      council.sessions.CaseConductor.id,
    );

    expect(council.syntheticAgentDispatch).toHaveBeenCalledTimes(6);
    expect(council.harnessAdapter.requests).toEqual([]);
    expect(await hashProject(council.project)).toBe(council.parentSceneHash);
    expect(result.receipt).toMatchObject({
      draftHash: stored.receipt.payloadHash,
      approvalId: approval.approvalId,
      preconditionHash: council.parentSceneHash,
      resultSceneHash: await hashProject(result.project),
      changedObjectIds: ["interaction-actor-a", "interaction-cup"],
      forbiddenObjectIds: ["interaction-backdrop", "interaction-floor"],
      rollbackRequirements: ["rollback-transient-overlay"],
      rollback: {
        kind: "DISCARD_TRANSIENT_DIRECTOR_OVERLAY",
        sourceProjectHash: council.parentSceneHash,
      },
    });
    expect(finalFrame.simulation.ownership["interaction-cup"])
      .toMatchObject({ status: "held", holderId: "interaction-actor-a" });
    expect(finalFrame.simulation.violations).toEqual([]);
    expect(cases.snapshot()).toMatchObject({
      status: "OPEN",
      currentSceneHash: result.receipt.resultSceneHash,
      accumulatedActions: ["Reframe"],
      terminalAction: null,
      transitions: [expect.objectContaining({ kind: "APPROVED_EXECUTION" })],
    });
    expect(durableTransition).toMatchObject({
      status: "DURABLE",
      sessionId: council.sessions.CaseConductor.id,
      transitionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(coldRoot.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "pact/case-transition",
        data: expect.objectContaining({
          kind: "APPROVED_EXECUTION",
          transitionHash: durableTransition.transitionHash,
        }),
      }),
    ]));
  });

  it.each([
    ["Guardian WITHHOLD", { guardianDisposition: "WITHHOLD" }, "WITHHELD"],
    ["omitted required dissent", { selectedDissentIds: [] }, "NEEDS_CLARIFICATION"],
  ])("keeps %s as a council-only state with no CaseSession execution", async (_label, options, expectedStatus) => {
    const council = await buildDurableCouncil(options);
    const cases = caseLedgerFor(council);
    const beforeHash = await hashProject(council.project);

    const result = await assemble(council);
    expect(result.status).toBe(expectedStatus);
    if (result.status === "ASSEMBLED") throw new Error("unexpected assembled draft");
    appendCouncilState(council, result);

    expect(await hashProject(council.project)).toBe(beforeHash);
    expect(council.syntheticAgentDispatch).toHaveBeenCalledTimes(6);
    expect(council.submissions.currentDraft(council.turn.snapshot.turnId)).toBeUndefined();
    expect(cases.snapshot()).toMatchObject({
      status: "OPEN",
      currentSceneHash: beforeHash,
      transitions: [],
    });
    expect(council.sessions.CaseConductor.events.filter(
      (event) => event.type === "pact/case-transition",
    )).toEqual([]);
    expect(council.sessions.CaseConductor.events.filter(
      (event) => event.type === "pact/council-state",
    )).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ state: expectedStatus }),
      }),
    ]);
  });

  it("rejects stale scene drift and explicit viewer rejection without mutating or approving", async () => {
    for (const mode of ["STALE_SCENE", "VIEWER_REJECTS"]) {
      const council = await buildDurableCouncil();
      const cases = caseLedgerFor(council);
      const assembled = await assemble(council);
      const stored = await storeAssembledDraft(council, assembled);
      const project = structuredClone(council.project);
      const approval = await approvalFor(
        stored.draft,
        mode === "VIEWER_REJECTS" ? "REJECT" : "APPROVE",
      );
      if (mode === "STALE_SCENE") project.name = "scene drift after durable draft";
      const hashBeforeAttempt = await hashProject(project);

      await expect(compileGuardedInteractionPlan({
        draft: stored.draft,
        approval,
        project,
        frame: evaluateTimeline(project, 0),
      })).rejects.toThrow(
        mode === "STALE_SCENE" ? /stale.*scene|scene.*stale/i : /viewer rejected/i,
      );

      expect(await hashProject(project)).toBe(hashBeforeAttempt);
      expect(council.syntheticAgentDispatch).toHaveBeenCalledTimes(6);
      expect(cases.snapshot()).toMatchObject({
        status: "OPEN",
        currentSceneHash: council.parentSceneHash,
        transitions: [],
      });
      expect(council.sessions.CaseConductor.events.filter(
        (event) => event.type === "pact/case-transition",
      )).toEqual([]);
    }
  });

  it("records a real assembly failure as FAILED_NO_MUTATION with the exact synthetic request count", async () => {
    const council = await buildDurableCouncil();
    const providerRequestsMade = council.syntheticAgentDispatch.mock.calls.length;
    const missingGuardianProposal = {
      ...council.proposal,
      durableShards: council.proposal.durableShards.filter(
        (entry) => entry.shard.role !== "Guardian",
      ),
    };
    const cases = caseLedgerFor(council);
    const beforeHash = await hashProject(council.project);

    const result = await assemble(council, missingGuardianProposal);
    expect(result).toMatchObject({ status: "FAILED_NO_MUTATION" });
    if (result.status !== "FAILED_NO_MUTATION") throw new Error("expected assembly failure");
    const transition = cases.recordFailureNoMutation({
      caseSessionId: council.turn.snapshot.caseSessionId,
      turnId: council.turn.snapshot.turnId,
      observedSceneHash: beforeHash,
      reasonCode: result.reasonCodes[0],
      providerRequestsMade,
      recordedAt: "2026-08-23T12:10:00.000Z",
    });
    const durable = await persistCaseSessionTransition({
      ctx: council.harness.ctx,
      session: council.sessions.CaseConductor,
      transition,
    });
    const coldRoot = await coldInspect(
      council.persistenceRoot,
      council.sessions.CaseConductor.id,
    );

    expect(providerRequestsMade).toBe(6);
    expect(await hashProject(council.project)).toBe(beforeHash);
    expect(council.submissions.currentDraft(council.turn.snapshot.turnId)).toBeUndefined();
    expect(cases.snapshot()).toMatchObject({
      status: "FAILED_NO_MUTATION",
      currentSceneHash: beforeHash,
      transitions: [{
        kind: "FAILED_NO_MUTATION",
        providerRequestsMade: 6,
        reasonCode: result.reasonCodes[0],
      }],
    });
    expect(durable.status).toBe("DURABLE");
    expect(coldRoot.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "pact/case-transition",
        data: expect.objectContaining({ kind: "FAILED_NO_MUTATION" }),
      }),
    ]));
  });

  it("allows approval after the deadline only for a draft accepted at 11,999ms with unchanged hashes", async () => {
    const council = await buildDurableCouncil();
    const assembled = await assemble(council, council.proposal, [11_997, 11_998]);
    const stored = await storeAssembledDraft(council, assembled, 11_999);
    council.setMonotonicMs(13_000);
    const delayedApproval = await approvalFor(
      stored.draft,
      "APPROVE",
      "2026-08-23T12:20:13.000Z",
    );
    const requestsAtViewerGate = council.syntheticAgentDispatch.mock.calls.length;

    const plan = await compileGuardedInteractionPlan({
      draft: stored.draft,
      approval: delayedApproval,
      project: council.project,
      frame: evaluateTimeline(council.project, 0),
      now: "2026-08-23T12:20:14.000Z",
    });
    const applied = await applyGuardedInteractionPlan({
      project: council.project,
      plan,
      now: "2026-08-23T12:20:15.000Z",
    });
    expect(applied.receipt.draftHash).toBe(stored.receipt.payloadHash);
    expect(council.syntheticAgentDispatch).toHaveBeenCalledTimes(requestsAtViewerGate);

    const driftedProject = structuredClone(council.project);
    driftedProject.name = "drifted after the 11,999ms draft was accepted";
    const driftedHash = await hashProject(driftedProject);
    await expect(compileGuardedInteractionPlan({
      draft: stored.draft,
      approval: delayedApproval,
      project: driftedProject,
      frame: evaluateTimeline(driftedProject, 0),
      now: "2026-08-23T12:20:16.000Z",
    })).rejects.toThrow(/stale.*scene|scene.*stale/i);
    expect(await hashProject(driftedProject)).toBe(driftedHash);
    expect(council.syntheticAgentDispatch).toHaveBeenCalledTimes(requestsAtViewerGate);
  });
});
