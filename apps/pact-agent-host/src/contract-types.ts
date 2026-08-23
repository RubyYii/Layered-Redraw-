export type ContractRole =
  | 'CaseConductor'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';

export type CouncilRole =
  | 'CaseConductor'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';

export type CouncilShardKind =
  | 'CONDUCTOR_INTENT'
  | 'WITNESS'
  | 'ARCHIVIST'
  | 'REWRITER'
  | 'GUARDIAN';

export type CouncilRightsId = `rights-${string}` | `rights_${string}`;

export interface CouncilObservation {
  readonly observationId: string;
  readonly text: string;
  readonly inputRefIds: readonly string[];
}

export interface CouncilDissentRecord {
  readonly dissentId: string;
  readonly text: string;
  readonly evidenceIds: readonly string[];
}

export interface RegisteredInteractionArguments {
  readonly actorId: string;
  readonly targetId: string;
  readonly affordance: string;
  readonly recipientId?: string;
  readonly placementTargetId?: string;
}

export interface RegisteredInteractionCapabilityCall {
  readonly capability: 'performRegisteredInteraction';
  readonly arguments: RegisteredInteractionArguments;
}

export interface ConductorIntentContent {
  readonly initialInterpretation: string;
  readonly candidateActionSequence: readonly string[];
  readonly roleRelevance: Readonly<Record<CouncilRole, string>>;
  readonly terminalIntent: 'Continue' | 'KeepOpaque' | null;
}

export interface WitnessContent {
  readonly observations: readonly CouncilObservation[];
}

export interface ArchivistContent {
  readonly requestedAssetIds: readonly string[];
  readonly requestedSpatialBridgeIds: readonly string[];
  readonly provenanceAnchors: readonly string[];
  readonly rightsRequirements: readonly CouncilRightsId[];
  readonly unavailableRefs: readonly string[];
}

export interface RewriterContent {
  readonly interpretation: string;
  readonly unresolvedAmbiguities: readonly string[];
  readonly spatialIntent: string;
  readonly visualIntent: string;
  readonly cameraIntent: string;
  readonly lightIntent: string;
  readonly soundIntent: string;
  readonly publicPoeticText: string;
  readonly seamsAndContradictionsToPreserve: readonly string[];
  readonly semanticCapabilityCalls: readonly RegisteredInteractionCapabilityCall[];
  readonly expectedChanges: readonly string[];
}

export interface GuardianContent {
  readonly disposition: 'ALLOW' | 'NEEDS_CLARIFICATION' | 'WITHHOLD';
  readonly forbiddenCapabilityIds: readonly string[];
  readonly requiredSourceLockIds: readonly string[];
  readonly requiredRightsIds: readonly CouncilRightsId[];
  readonly requiredRollbackCapabilityIds: readonly string[];
  readonly contestedEvidenceIds: readonly string[];
  readonly requiredDissentRecords: readonly CouncilDissentRecord[];
  readonly guardianChallenge: string;
}

export interface CouncilShardBase {
  readonly schemaVersion: 'cp03-council/0.2';
  readonly shardId: string;
  readonly kind: CouncilShardKind;
  readonly role: CouncilRole;
  readonly childSessionId: string;
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly snapshotHash: string;
  readonly parentSceneHash: string;
  readonly registryVersion: string;
  readonly routingManifestVersion: string;
  readonly deadlineId: string;
  readonly publicTrace: string;
  readonly uncertainties: readonly string[];
  readonly evidenceAnchors: readonly string[];
}

export interface ConductorIntentShard extends CouncilShardBase {
  readonly kind: 'CONDUCTOR_INTENT';
  readonly role: 'CaseConductor';
  readonly content: ConductorIntentContent;
}

export interface WitnessShard extends CouncilShardBase {
  readonly kind: 'WITNESS';
  readonly role: 'Witness';
  readonly content: WitnessContent;
}

export interface ArchivistShard extends CouncilShardBase {
  readonly kind: 'ARCHIVIST';
  readonly role: 'Archivist';
  readonly content: ArchivistContent;
}

export interface RewriterShard extends CouncilShardBase {
  readonly kind: 'REWRITER';
  readonly role: 'Rewriter';
  readonly content: RewriterContent;
}

export interface GuardianShard extends CouncilShardBase {
  readonly kind: 'GUARDIAN';
  readonly role: 'Guardian';
  readonly content: GuardianContent;
}

export type CouncilShard =
  | ConductorIntentShard
  | WitnessShard
  | ArchivistShard
  | RewriterShard
  | GuardianShard;

export interface ConductorDraftCommit {
  readonly schemaVersion: 'cp03-council/0.2';
  readonly turnId: string;
  readonly status: 'NEEDS_CLARIFICATION' | 'PROPOSED' | 'WITHHELD';
  readonly actionSequence: readonly string[];
  readonly selectedShardHashes: readonly string[];
  readonly selectedDissentIds: readonly string[];
  readonly terminalIntent: 'Continue' | 'KeepOpaque' | null;
}

export interface ProviderRoutingAssignment {
  readonly provider: 'deepseek' | 'gemini';
  readonly route: string;
  readonly model: string;
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly promptHash: string;
  readonly toolProfile: 'council-v2';
  readonly maximumConcurrency: number;
  readonly inputClasses: readonly ('text' | 'image' | 'audio')[];
  readonly inputLimitTokens: number;
  readonly outputLimitTokens: number;
  readonly timeoutMs: number;
}

export interface ProviderRoutingManifest {
  readonly schemaVersion: 'cp03-council-routing/0.1';
  readonly manifestVersion: string;
  readonly plannedDispatches: 6;
  readonly maximumDispatches: 8;
  readonly assignments: Readonly<Record<CouncilRole, {
    readonly provider: 'deepseek' | 'gemini';
    readonly route: string;
    readonly model: string;
    readonly adapterPackage: string;
    readonly adapterVersion: string;
    readonly promptHash: string;
    readonly toolProfile: 'council-v2';
    readonly maximumConcurrency: number;
    readonly inputClasses: readonly ('text' | 'image' | 'audio')[];
    readonly inputLimitTokens: number;
    readonly outputLimitTokens: number;
    readonly timeoutMs: number;
  }>>;
}

export interface AgentContribution {
  readonly schemaVersion: 'cp03-foundation-gate/0.1';
  readonly role: ContractRole;
  readonly childSessionId: string;
  readonly turnId: string;
  readonly publicTrace: string;
  readonly proposal: string;
  readonly uncertainties: readonly string[];
  readonly evidenceAnchors: readonly string[];
  readonly assetRequests: readonly string[];
  readonly dissent: readonly string[];
  readonly toolReceiptRefs: readonly string[];
}

export interface AgentActionDraft {
  readonly identity: {
    readonly draftId: string;
    readonly schemaVersion:
      | 'cp03-foundation-gate/0.1'
      | 'cp03-runtime/0.1';
    readonly caseSessionId: string;
    readonly turnId: string;
    readonly parentSceneHash: string;
  };
  readonly decision: {
    readonly status: 'DRAFT' | 'NEEDS_CLARIFICATION' | 'PROPOSED' | 'WITHHELD';
    readonly actionSequence: readonly string[];
  };
  readonly creative: Readonly<Record<string, unknown>>;
  readonly materials: Readonly<Record<string, unknown>>;
  readonly execution: Readonly<Record<string, unknown>>;
  readonly agency: Readonly<Record<string, unknown>>;
}

export interface ProviderToolCallReceipt {
  readonly toolCallId: string;
  readonly name: string;
  readonly argumentsHash: string;
  readonly status: 'observed' | 'accepted' | 'rejected';
}

export interface ProviderCallEnvelope {
  readonly schemaVersion: 'cp03-foundation-gate/0.1';
  readonly callId: string;
  readonly providerRoute: string;
  readonly modelId: string;
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly providerKind: 'real' | 'scripted';
  readonly inputClasses: readonly ('fictional_text' | 'synthetic_image')[];
  readonly startedAt: string;
  readonly firstChunkAt: string | null;
  readonly firstPublicTraceAt: string | null;
  readonly endedAt: string | null;
  readonly latencyMs: number | null;
  readonly usage: null | {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostUsd: number | null;
  };
  readonly finish: {
    readonly kind:
      | 'pending'
      | 'stop'
      | 'tool_calls'
      | 'length'
      | 'aborted'
      | 'error';
    readonly detailCode?: string;
  };
  readonly toolCalls: readonly ProviderToolCallReceipt[];
  readonly sessionEventRange: null | {
    readonly sessionId: string;
    readonly fromSequence: number;
    readonly toSequence: number;
  };
  readonly retryOf: string | null;
  readonly lateQuarantined: boolean;
  readonly nativeResponseSchema:
    'UNSUPPORTED_ON_DSH_ROOT_CONTINUABLE_RC6';
}
