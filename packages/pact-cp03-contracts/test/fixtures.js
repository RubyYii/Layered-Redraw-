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

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

export const kindByRole = Object.freeze({
  CaseConductor: "CONDUCTOR_INTENT",
  Witness: "WITNESS",
  Archivist: "ARCHIVIST",
  Rewriter: "REWRITER",
  Guardian: "GUARDIAN",
});

const councilShardBase = (role, kind, shardId, childSessionId, content) => ({
  schemaVersion: "cp03-council/0.2",
  shardId,
  kind,
  role,
  childSessionId,
  caseSessionId: "case_council01",
  turnId: "turn_council01",
  snapshotHash: "a".repeat(64),
  parentSceneHash: "b".repeat(64),
  registryVersion: "cp03-registry/0.1",
  routingManifestVersion: "cp03-council-routing/manifest-0.1",
  deadlineId: "deadline_council01",
  publicTrace: `${role} reports a bounded council contribution.`,
  uncertainties: ["The spatial relation remains interpretive."],
  evidenceAnchors: ["input_scene01"],
  content,
});

export const validCouncilShards = deepFreeze({
  CaseConductor: councilShardBase(
    "CaseConductor",
    kindByRole.CaseConductor,
    "shard_conductor01",
    "550e8400-e29b-41d4-a716-446655440001",
    {
      initialInterpretation: "Treat the remembered distance as a relation, not a recovered fact.",
      candidateActionSequence: ["Reframe", "Continue"],
      roleRelevance: {
        CaseConductor: "Selects the admissible trajectory.",
        Witness: "Checks the multimodal observation.",
        Archivist: "Locks provenance and rights.",
        Rewriter: "Provides bounded creative composition.",
        Guardian: "Challenges unsafe or unsupported changes.",
      },
      terminalIntent: "Continue",
    },
  ),
  Witness: councilShardBase(
    "Witness",
    kindByRole.Witness,
    "shard_witness01",
    "550e8400-e29b-41d4-a716-446655440002",
    {
      observations: [{
        observationId: "observation_witness01",
        text: "The chair is visible near the source plane, but its remembered distance is uncertain.",
        inputRefIds: ["input_scene01", "input_text01"],
      }],
    },
  ),
  Archivist: councilShardBase(
    "Archivist",
    kindByRole.Archivist,
    "shard_archivist01",
    "550e8400-e29b-41d4-a716-446655440003",
    {
      requestedAssetIds: ["asset_cup01"],
      requestedSpatialBridgeIds: ["bridge_window01"],
      provenanceAnchors: ["input_scene01"],
      rightsRequirements: ["Use only the registered local scene and cleared fixtures."],
      unavailableRefs: [],
    },
  ),
  Rewriter: councilShardBase(
    "Rewriter",
    kindByRole.Rewriter,
    "shard_rewriter01",
    "550e8400-e29b-41d4-a716-446655440004",
    {
      interpretation: "Distance is treated as a relation of looking, not a recovered fact.",
      unresolvedAmbiguities: ["The exact chair position remains uncertain."],
      spatialIntent: "Keep the source plane fixed and shift only the mutable viewing relation.",
      visualIntent: "Preserve the seam between archive and mutable proposal.",
      cameraIntent: "Move the camera relation laterally without cropping the source record.",
      lightIntent: "Let the mutable layer receive a colder edge light.",
      soundIntent: "Hold a low room tone without claiming a recorded memory.",
      publicPoeticText: "The room leans; the photograph does not.",
      seamsAndContradictionsToPreserve: ["The chair may be near and not-near at once."],
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
  ),
  Guardian: councilShardBase(
    "Guardian",
    kindByRole.Guardian,
    "shard_guardian01",
    "550e8400-e29b-41d4-a716-446655440005",
    {
      disposition: "ALLOW",
      forbiddenCapabilityIds: ["rawTransform"],
      requiredSourceLockIds: ["source-plane"],
      requiredRightsIds: ["rights-local-scene"],
      requiredRollbackCapabilityIds: ["rollback-transient-overlay"],
      contestedEvidenceIds: ["evidence_uncertain_chair"],
      requiredDissentRecords: [{
        dissentId: "dissent_guardian01",
        text: "Do not treat the chair distance as historical fact.",
        evidenceIds: ["input_text01"],
      }],
      guardianChallenge: "Execute only after approval of this exact hash-bound proposal.",
    },
  ),
});

export const validConductorDraftCommit = deepFreeze({
  schemaVersion: "cp03-council/0.2",
  turnId: "turn_council01",
  status: "PROPOSED",
  actionSequence: ["Reframe", "Continue"],
  selectedShardHashes: ["c".repeat(64), "d".repeat(64)],
  selectedDissentIds: ["dissent_guardian01"],
  terminalIntent: "Continue",
});

const routingAssignment = (provider, route, model, adapterPackage, promptHash) => ({
  provider,
  route,
  model,
  adapterPackage,
  adapterVersion: "0.1.0-rc.6",
  promptHash,
  toolProfile: "council-v2",
  maximumConcurrency: 1,
  inputClasses: ["text", "image"],
  inputLimitTokens: 4096,
  outputLimitTokens: 2048,
  timeoutMs: 12000,
});

export const validProviderRoutingManifest = deepFreeze({
  schemaVersion: "cp03-council-routing/0.1",
  manifestVersion: "cp03-council-routing/manifest-0.1",
  plannedDispatches: 6,
  maximumDispatches: 8,
  assignments: {
    CaseConductor: routingAssignment(
      "deepseek",
      "deepseek-official",
      "deepseek-v4-pro",
      "@deepseek-ai/dsh-llm-deepseek",
      "e".repeat(64),
    ),
    Witness: routingAssignment(
      "gemini",
      "gemini-official",
      "gemini-3.5-flash",
      "@google/generative-ai",
      "f".repeat(64),
    ),
    Archivist: routingAssignment(
      "deepseek",
      "deepseek-official",
      "deepseek-v4-pro",
      "@deepseek-ai/dsh-llm-deepseek",
      "1".repeat(64),
    ),
    Rewriter: routingAssignment(
      "gemini",
      "gemini-official",
      "gemini-3.5-flash",
      "@google/generative-ai",
      "2".repeat(64),
    ),
    Guardian: routingAssignment(
      "deepseek",
      "deepseek-official",
      "deepseek-v4-pro",
      "@deepseek-ai/dsh-llm-deepseek",
      "3".repeat(64),
    ),
  },
});
