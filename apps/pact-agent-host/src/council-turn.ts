import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';

import type {
  CaseSessionStateSummary,
} from './case-session.js';
import type {
  CouncilRole,
  ProviderRoutingManifest,
} from './contract-types.js';

export interface CouncilTurnScope {
  readonly usesImageOrAudioClaims: boolean;
  readonly usesSceneObservationClaims: boolean;
  readonly allowsSceneMutation: boolean;
  readonly allowsAssetOrSpatialChange: boolean;
  readonly requiresProvenanceOrRights: boolean;
}

export interface CouncilTurnInputRef {
  readonly refId: string;
  readonly inputClass: 'text' | 'image' | 'audio';
}

export interface CouncilTurnSnapshot {
  readonly schemaVersion: 'cp03-council-turn/0.1';
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly parentSceneHash: string;
  readonly sourceLockIds: readonly string[];
  readonly inputRefs: readonly CouncilTurnInputRef[];
  readonly registryVersion: string;
  readonly registeredAssetIds: readonly string[];
  readonly registeredSpatialBridgeIds: readonly string[];
  readonly registeredSceneObjectIds: readonly string[];
  readonly registeredAffordanceIds: readonly string[];
  readonly registeredRightsIds: readonly string[];
  readonly supportedRollbackCapabilityIds: readonly string[];
  readonly allowedSemanticCapabilityIds: readonly string[];
  readonly caseActionState: CaseSessionStateSummary;
  readonly turnScope: CouncilTurnScope;
  readonly requiredRoles: readonly CouncilRole[];
  readonly routingManifestVersion: string;
  readonly deadlineId: string;
  readonly deadlineMs: 12_000;
}

export const COUNCIL_TIMING_LIMITS = Object.freeze({
  systemStatusTargetMs: 150,
  firstPublicTraceTargetMs: 2_500,
  requiredShardsTargetMs: 5_500,
  conductorCommitTargetMs: 7_800,
  draftTargetMs: 8_000,
  hardDeadlineMs: 12_000,
  assemblyTargetMs: 100,
} as const);

export interface FrozenCouncilTurn {
  readonly snapshot: CouncilTurnSnapshot;
  readonly snapshotHash: string;
  readonly requiredRoles: readonly CouncilRole[];
  readonly startedAtMonotonicMs: number;
  readonly deadlineAtMonotonicMs: number;
}

export interface FreezeCouncilTurnInput {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly parentSceneHash: string;
  readonly sourceLockIds: readonly string[];
  readonly inputRefs: readonly CouncilTurnInputRef[];
  readonly registryVersion: string;
  readonly registeredAssetIds: readonly string[];
  readonly registeredSpatialBridgeIds: readonly string[];
  readonly registeredSceneObjectIds: readonly string[];
  readonly registeredAffordanceIds: readonly string[];
  readonly registeredRightsIds: readonly string[];
  readonly supportedRollbackCapabilityIds: readonly string[];
  readonly allowedSemanticCapabilityIds: readonly string[];
  readonly caseActionState: CaseSessionStateSummary;
  readonly turnScope: CouncilTurnScope;
  readonly routingManifest: ProviderRoutingManifest;
  readonly deadlineId: string;
  readonly now: () => number;
}

export type CouncilTurnInput = FreezeCouncilTurnInput;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const hasDuplicates = <T>(values: readonly T[]): boolean =>
  new Set(values).size !== values.length;

export const requiredRolesForTurn = (
  scope: CouncilTurnScope,
): readonly CouncilRole[] => {
  const roles: CouncilRole[] = ['CaseConductor'];
  if (scope.usesImageOrAudioClaims || scope.usesSceneObservationClaims) {
    roles.push('Witness');
  }
  if (
    scope.allowsAssetOrSpatialChange ||
    scope.requiresProvenanceOrRights
  ) {
    roles.push('Archivist');
  }
  if (scope.allowsSceneMutation) roles.push('Rewriter', 'Guardian');
  return Object.freeze(roles);
};

export const isBeforeCouncilDeadline = (
  nowMs: number,
  deadlineAtMs: number,
): boolean => nowMs < deadlineAtMs;

export const freezeCouncilTurn = async (
  input: FreezeCouncilTurnInput,
): Promise<FrozenCouncilTurn> => {
  if (hasDuplicates(input.registeredSceneObjectIds)) {
    throw new TypeError('duplicate registered scene object ID');
  }
  if (hasDuplicates(input.registeredAffordanceIds)) {
    throw new TypeError('duplicate registered affordance ID');
  }
  const startedAtMonotonicMs = input.now();
  const turnScope: CouncilTurnScope = { ...input.turnScope };
  const requiredRoles = requiredRolesForTurn(turnScope);
  const snapshot = deepFreeze({
    schemaVersion: 'cp03-council-turn/0.1' as const,
    caseSessionId: input.caseSessionId,
    turnId: input.turnId,
    parentSceneHash: input.parentSceneHash,
    sourceLockIds: [...input.sourceLockIds],
    inputRefs: input.inputRefs.map((inputRef) => ({ ...inputRef })),
    registryVersion: input.registryVersion,
    registeredAssetIds: [...input.registeredAssetIds],
    registeredSpatialBridgeIds: [...input.registeredSpatialBridgeIds],
    registeredSceneObjectIds: [...input.registeredSceneObjectIds],
    registeredAffordanceIds: [...input.registeredAffordanceIds],
    registeredRightsIds: [...input.registeredRightsIds],
    supportedRollbackCapabilityIds: [...input.supportedRollbackCapabilityIds],
    allowedSemanticCapabilityIds: [...input.allowedSemanticCapabilityIds],
    caseActionState: {
      status: input.caseActionState.status,
      currentSceneHash: input.caseActionState.currentSceneHash,
      accumulatedActions: [...input.caseActionState.accumulatedActions],
      terminalAction: input.caseActionState.terminalAction,
    },
    turnScope,
    requiredRoles,
    routingManifestVersion: input.routingManifest.manifestVersion,
    deadlineId: input.deadlineId,
    deadlineMs: COUNCIL_TIMING_LIMITS.hardDeadlineMs,
  });
  const snapshotHash = await sha256Canonical(snapshot);
  return deepFreeze({
    snapshot,
    snapshotHash,
    requiredRoles: snapshot.requiredRoles,
    startedAtMonotonicMs,
    deadlineAtMonotonicMs:
      startedAtMonotonicMs + COUNCIL_TIMING_LIMITS.hardDeadlineMs,
  });
};
