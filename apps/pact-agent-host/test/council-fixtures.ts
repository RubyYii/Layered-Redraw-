import type {
  CouncilRole,
  CouncilShard,
  ConductorDraftCommit,
  GuardianShard,
  ProviderRoutingAssignment,
  ProviderRoutingManifest,
} from '../src/contract-types.js';
import type {
  CouncilTurnSnapshot,
  CouncilTurnScope,
  FreezeCouncilTurnInput,
  FrozenCouncilTurn,
} from '../src/council-turn.js';
import { freezeCouncilTurn } from '../src/council-turn.js';

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

export const fullTurnScope: CouncilTurnScope = deepFreeze({
  usesImageOrAudioClaims: true,
  usesSceneObservationClaims: true,
  allowsSceneMutation: true,
  allowsAssetOrSpatialChange: true,
  requiresProvenanceOrRights: true,
});

export const textOnlyTurnScope: CouncilTurnScope = deepFreeze({
  usesImageOrAudioClaims: false,
  usesSceneObservationClaims: false,
  allowsSceneMutation: false,
  allowsAssetOrSpatialChange: false,
  requiresProvenanceOrRights: false,
});

const routingAssignment = (
  provider: 'deepseek' | 'gemini',
  route: string,
  model: string,
  adapterPackage: string,
  promptHash: string,
): ProviderRoutingAssignment => ({
  provider,
  route,
  model,
  adapterPackage,
  adapterVersion: '0.1.0-rc.6',
  promptHash,
  toolProfile: 'council-v2',
  maximumConcurrency: provider === 'deepseek' ? 3 : 2,
  inputClasses: ['text', 'image'],
  inputLimitTokens: 4096,
  outputLimitTokens: 2048,
  timeoutMs: 12_000,
});

export const scriptedDualProviderManifest = deepFreeze({
  schemaVersion: 'cp03-council-routing/0.1',
  manifestVersion: 'cp03-council-routing/manifest-0.1',
  plannedDispatches: 6,
  maximumDispatches: 8,
  assignments: {
    CaseConductor: routingAssignment(
      'deepseek',
      'deepseek-official',
      'deepseek-model-pending-bakeoff',
      '@deepseek-ai/dsh-llm-deepseek',
      'e'.repeat(64),
    ),
    Witness: routingAssignment(
      'gemini',
      'gemini-official',
      'gemini-model-pending-bakeoff',
      '@google/generative-ai',
      'f'.repeat(64),
    ),
    Archivist: routingAssignment(
      'deepseek',
      'deepseek-official',
      'deepseek-model-pending-bakeoff',
      '@deepseek-ai/dsh-llm-deepseek',
      '1'.repeat(64),
    ),
    Rewriter: routingAssignment(
      'gemini',
      'gemini-official',
      'gemini-model-pending-bakeoff',
      '@google/generative-ai',
      '2'.repeat(64),
    ),
    Guardian: routingAssignment(
      'deepseek',
      'deepseek-official',
      'deepseek-model-pending-bakeoff',
      '@deepseek-ai/dsh-llm-deepseek',
      '3'.repeat(64),
    ),
  },
} satisfies ProviderRoutingManifest);

export const fullCouncilTurnInput: Omit<FreezeCouncilTurnInput, 'now'> = deepFreeze({
  caseSessionId: 'case_council01',
  turnId: 'turn_council01',
  parentSceneHash: 'b'.repeat(64),
  sourceLockIds: ['source-plane'],
  inputRefs: [
    { refId: 'input_text01', inputClass: 'text' },
    { refId: 'input_image01', inputClass: 'image' },
  ],
  registryVersion: 'cp03-registry/0.1',
  registeredAssetIds: ['asset-cup01'],
  registeredSpatialBridgeIds: ['bridge-window01'],
  registeredSceneObjectIds: [
    'asset-cup01',
    'interaction-actor-a',
    'interaction-placement-a',
    'interaction-recipient-a',
  ],
  registeredAffordanceIds: ['pickup', 'place'],
  registeredRightsIds: ['rights-local-scene'],
  supportedRollbackCapabilityIds: ['rollback-transient-overlay'],
  allowedSemanticCapabilityIds: ['performRegisteredInteraction'],
  caseActionState: {
    status: 'OPEN',
    currentSceneHash: 'b'.repeat(64),
    accumulatedActions: ['Reframe'],
    terminalAction: null,
  },
  turnScope: fullTurnScope,
  routingManifest: scriptedDualProviderManifest,
  deadlineId: 'deadline_council01',
});

const councilShardBase = (
  snapshot: CouncilTurnSnapshot,
  snapshotHash: string,
) => ({
  schemaVersion: 'cp03-council/0.2' as const,
  caseSessionId: snapshot.caseSessionId,
  turnId: snapshot.turnId,
  snapshotHash,
  parentSceneHash: snapshot.parentSceneHash,
  registryVersion: snapshot.registryVersion,
  routingManifestVersion: snapshot.routingManifestVersion,
  deadlineId: snapshot.deadlineId,
  publicTrace: 'A bounded synthetic council contribution.',
  uncertainties: ['The spatial relation remains interpretive.'],
  evidenceAnchors: ['input_image01', 'input_text01'],
});

const buildCouncilShards = (
  snapshot: CouncilTurnSnapshot,
  snapshotHash: string,
) => deepFreeze({
  CaseConductor: {
    ...councilShardBase(snapshot, snapshotHash),
    shardId: 'shard_conductor01',
    kind: 'CONDUCTOR_INTENT',
    role: 'CaseConductor',
    childSessionId: 'child_conductor01',
    content: {
      initialInterpretation: 'Treat distance as a relation, not a recovered fact.',
      candidateActionSequence: ['Reframe', 'Continue'],
      roleRelevance: {
        CaseConductor: 'Selects the admissible trajectory.',
        Witness: 'Checks multimodal observation claims.',
        Archivist: 'Locks provenance and rights.',
        Rewriter: 'Provides bounded composition.',
        Guardian: 'Challenges unsupported changes.',
      },
      terminalIntent: 'Continue',
    },
  },
  Witness: {
    ...councilShardBase(snapshot, snapshotHash),
    shardId: 'shard_witness01',
    kind: 'WITNESS',
    role: 'Witness',
    childSessionId: 'child_witness01',
    content: {
      observations: [{
        observationId: 'observation_witness01',
        text: 'The synthetic image contains a visible source plane.',
        inputRefIds: ['input_image01', 'input_text01'],
      }],
    },
  },
  Archivist: {
    ...councilShardBase(snapshot, snapshotHash),
    shardId: 'shard_archivist01',
    kind: 'ARCHIVIST',
    role: 'Archivist',
    childSessionId: 'child_archivist01',
    content: {
      requestedAssetIds: ['asset-cup01'],
      requestedSpatialBridgeIds: ['bridge-window01'],
      provenanceAnchors: ['input_image01', 'source-plane'],
      rightsRequirements: ['rights-local-scene'],
      unavailableRefs: [],
    },
  },
  Rewriter: {
    ...councilShardBase(snapshot, snapshotHash),
    shardId: 'shard_rewriter01',
    kind: 'REWRITER',
    role: 'Rewriter',
    childSessionId: 'child_rewriter01',
    content: {
      interpretation: 'Keep the source plane fixed and shift the viewing relation.',
      unresolvedAmbiguities: ['The exact spatial relation remains uncertain.'],
      spatialIntent: 'Use the registered bridge without replacing the source.',
      visualIntent: 'Preserve the seam between source and proposal.',
      cameraIntent: 'Hold a readable lateral relation.',
      lightIntent: 'Keep one restrained edge light.',
      soundIntent: 'Use only fictional room tone.',
      publicPoeticText: 'The grid leans; the source does not.',
      seamsAndContradictionsToPreserve: ['Near and not-near remain visible.'],
      semanticCapabilityCalls: [{
        capability: 'performRegisteredInteraction',
        arguments: {
          actorId: 'interaction-actor-a',
          targetId: 'asset-cup01',
          affordance: 'pickup',
        },
      }],
      expectedChanges: ['interaction-actor-a', 'asset-cup01'],
    },
  },
  Guardian: {
    ...councilShardBase(snapshot, snapshotHash),
    shardId: 'shard_guardian01',
    kind: 'GUARDIAN',
    role: 'Guardian',
    childSessionId: 'child_guardian01',
    content: {
      disposition: 'ALLOW',
      forbiddenCapabilityIds: ['rawTransform'],
      requiredSourceLockIds: ['source-plane'],
      requiredRightsIds: ['rights-local-scene'],
      requiredRollbackCapabilityIds: ['rollback-transient-overlay'],
      contestedEvidenceIds: ['observation_witness01'],
      requiredDissentRecords: [{
        dissentId: 'dissent_guardian01',
        text: 'Do not treat the spatial relation as historical fact.',
        evidenceIds: ['input_text01'],
      }],
      guardianChallenge: 'Execute only after approval of this exact hash-bound proposal.',
    },
  },
} satisfies Record<CouncilRole, CouncilShard>);

const buildWithheldGuardianShard = (guardian: GuardianShard): GuardianShard => deepFreeze({
  ...guardian,
  shardId: 'shard_guardian_withheld01',
  content: {
    ...guardian.content,
    disposition: 'WITHHOLD' as const,
    guardianChallenge: 'Withhold because the synthetic rights fixture is not cleared for mutation.',
  },
} satisfies GuardianShard);

export const proposedCouncilCommit = deepFreeze({
  schemaVersion: 'cp03-council/0.2',
  turnId: 'turn_council01',
  status: 'PROPOSED',
  actionSequence: ['Reframe', 'Continue'],
  selectedShardHashes: ['c'.repeat(64), 'd'.repeat(64)],
  selectedDissentIds: ['dissent_guardian01'],
  terminalIntent: 'Continue',
} satisfies ConductorDraftCommit);

export const roleOrder = deepFreeze([
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
] as const);

export interface FullCouncilFixtures {
  readonly turn: FrozenCouncilTurn;
  readonly snapshot: CouncilTurnSnapshot;
  readonly shards: Readonly<Record<CouncilRole, CouncilShard>>;
  readonly proposedCommit: ConductorDraftCommit;
  readonly withheldGuardianShard: GuardianShard;
  readonly routingManifest: ProviderRoutingManifest;
}

export const createFullCouncilFixtures = async (
  now: () => number = () => 1_000,
): Promise<FullCouncilFixtures> => {
  const turn = await freezeCouncilTurn({ ...fullCouncilTurnInput, now });
  const shards = buildCouncilShards(turn.snapshot, turn.snapshotHash);
  const withheldGuardianShard = buildWithheldGuardianShard(shards.Guardian);
  return deepFreeze({
    turn,
    snapshot: turn.snapshot,
    shards,
    proposedCommit: proposedCouncilCommit,
    withheldGuardianShard,
    routingManifest: scriptedDualProviderManifest,
  });
};

export const fullCouncilFixture = createFullCouncilFixtures();
