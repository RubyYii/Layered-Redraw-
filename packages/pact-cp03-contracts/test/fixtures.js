export const validViewerTurn = Object.freeze({
  schemaVersion: "cp03-foundation-gate/0.1",
  caseSessionId: "case_example01",
  turnId: "turn_example01",
  text: "I remember the chair nearer the window, but I am not certain.",
  parentSceneHash: "a".repeat(64),
  submittedAt: "2026-08-22T00:00:00.000Z",
});

export const validAgentContribution = Object.freeze({
  schemaVersion: "cp03-foundation-gate/0.1",
  role: "Rewriter",
  childSessionId: "550e8400-e29b-41d4-a716-446655440000",
  turnId: "turn_example01",
  publicTrace: "The frame moves, but the source remains fixed.",
  proposal: "Treat the camera relation as uncertain rather than replacing the image.",
  uncertainties: ["The described distance is interpretive."],
  evidenceAnchors: ["synthetic-checkerboard"],
  assetRequests: [],
  dissent: [],
  toolReceiptRefs: [],
});

export const validAgentActionDraft = Object.freeze({
  identity: {
    draftId: "draft_example01",
    schemaVersion: "cp03-foundation-gate/0.1",
    caseSessionId: "case_example01",
    turnId: "turn_example01",
    parentSceneHash: "a".repeat(64),
  },
  decision: {
    status: "PROPOSED",
    actionSequence: ["Reframe"],
  },
  creative: {
    interpretation: "Distance is treated as a relation of looking, not a recovered fact.",
    unresolvedAmbiguities: ["The exact chair position remains uncertain."],
    spatialIntent: "Keep the source plane fixed and shift only the mutable viewing relation.",
    visualIntent: "Preserve the seam between archive and mutable proposal.",
    cameraIntent: "Move the camera relation laterally without cropping the source record.",
    lightIntent: "Let the mutable layer receive a colder edge light.",
    soundIntent: "Hold a low room tone without claiming a recorded memory.",
    publicPoeticText: "The room leans; the photograph does not.",
    seamsAndContradictionsToPreserve: ["The chair may be near and not-near at once."],
  },
  materials: {
    requestedAssetIds: [],
    requestedSpatialBridgeIds: [],
    provenanceAnchors: ["synthetic-checkerboard"],
    rightsRequirements: ["Use only locally registered, cleared gate fixtures."],
  },
  execution: {
    executionMode: "NON_EXECUTABLE_COMPATIBILITY",
    semanticCapabilityCalls: [],
    expectedChanges: [],
    forbiddenChanges: ["no scene mutation in provider gate"],
    rollbackRequirements: [],
    terminalIntent: null,
  },
  agency: {
    contributions: [{
      role: "Rewriter",
      childSessionId: "550e8400-e29b-41d4-a716-446655440000",
      contributionHash: "b".repeat(64),
    }],
    disagreements: [],
    guardianChallenge: "Confirm that no source or scene mutation is encoded.",
  },
});

export const validRuntimeAgentActionDraft = Object.freeze({
  ...validAgentActionDraft,
  identity: {
    ...validAgentActionDraft.identity,
    draftId: "draft_runtime01",
    schemaVersion: "cp03-runtime/0.1",
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
    forbiddenChanges: ["source-plane", "evidence-overlay"],
    rollbackRequirements: ["Discard the transient director overlay."],
    terminalIntent: null,
  },
});

export const validApprovalRecord = Object.freeze({
  schemaVersion: "cp03-runtime/0.1",
  approvalId: "approval_example01",
  caseSessionId: "case_example01",
  turnId: "turn_example01",
  draftHash: "d".repeat(64),
  parentSceneHash: "a".repeat(64),
  decision: "APPROVE",
  approvedBy: "viewer",
  decidedAt: "2026-08-22T00:00:00.000Z",
});

export const validProviderCallEnvelope = Object.freeze({
  schemaVersion: "cp03-foundation-gate/0.1",
  callId: "call_example01",
  providerRoute: "deepseek-official",
  modelId: "configured-at-authorised-run",
  adapterPackage: "@deepseek-ai/dsh-llm-deepseek",
  adapterVersion: "0.1.0-rc.6",
  providerKind: "real",
  inputClasses: ["fictional_text"],
  startedAt: "2026-08-22T00:00:00.000Z",
  firstChunkAt: null,
  firstPublicTraceAt: null,
  endedAt: null,
  latencyMs: null,
  usage: null,
  finish: { kind: "pending" },
  toolCalls: [],
  sessionEventRange: null,
  retryOf: null,
  lateQuarantined: false,
  nativeResponseSchema: "UNSUPPORTED_ON_DSH_ROOT_CONTINUABLE_RC6",
});
