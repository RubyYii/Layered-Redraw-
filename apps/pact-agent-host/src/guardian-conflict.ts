import type { CouncilProposalSnapshot } from './council-registry.js';
import type {
  ArchivistShard,
  CouncilRole,
  GuardianShard,
  RewriterShard,
} from './contract-types.js';
import type { FrozenCouncilTurn } from './council-turn.js';

export type GuardianConflictResult =
  | { readonly status: 'ALLOW'; readonly reasonCodes: readonly [] }
  | {
      readonly status: 'NEEDS_CLARIFICATION' | 'WITHHELD';
      readonly reasonCodes: readonly string[];
    };

export interface GuardianConflictInput {
  readonly turn: FrozenCouncilTurn;
  readonly proposal: CouncilProposalSnapshot;
}

const GUARDIAN_REASON_ORDER = [
  'GUARDIAN_FORBIDDEN_CAPABILITY',
  'GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED',
  'GUARDIAN_CONTESTED_EVIDENCE',
  'GUARDIAN_ROLLBACK_REQUIREMENT_UNSATISFIED',
] as const;

type GuardianReasonCode = (typeof GUARDIAN_REASON_ORDER)[number];

const reasonIndex = new Map<GuardianReasonCode, number>(
  GUARDIAN_REASON_ORDER.map((reasonCode, index) => [reasonCode, index]),
);

const orderedReasons = (
  reasons: ReadonlySet<GuardianReasonCode>,
): readonly string[] => [...reasons].sort((left, right) =>
  reasonIndex.get(left)! - reasonIndex.get(right)!) as readonly string[];

const typedInputFailure = (): GuardianConflictResult => ({
  status: 'NEEDS_CLARIFICATION',
  reasonCodes: ['GUARDIAN_TYPED_INPUT_INVALID'],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isCouncilRole = (value: unknown): value is CouncilRole =>
  value === 'CaseConductor' ||
  value === 'Witness' ||
  value === 'Archivist' ||
  value === 'Rewriter' ||
  value === 'Guardian';

const isDissentRecord = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.dissentId === 'string' &&
  typeof value.text === 'string' &&
  isStringArray(value.evidenceIds);

const isGuardianContent = (
  value: unknown,
): value is GuardianShard['content'] =>
  isRecord(value) &&
  (value.disposition === 'ALLOW' ||
    value.disposition === 'NEEDS_CLARIFICATION' ||
    value.disposition === 'WITHHOLD') &&
  isStringArray(value.forbiddenCapabilityIds) &&
  isStringArray(value.requiredSourceLockIds) &&
  isStringArray(value.requiredRightsIds) &&
  isStringArray(value.requiredRollbackCapabilityIds) &&
  isStringArray(value.contestedEvidenceIds) &&
  Array.isArray(value.requiredDissentRecords) &&
  value.requiredDissentRecords.every(isDissentRecord) &&
  typeof value.guardianChallenge === 'string';

const isArchivistContent = (
  value: unknown,
): value is ArchivistShard['content'] =>
  isRecord(value) &&
  isStringArray(value.requestedAssetIds) &&
  isStringArray(value.requestedSpatialBridgeIds) &&
  isStringArray(value.provenanceAnchors) &&
  isStringArray(value.rightsRequirements) &&
  isStringArray(value.unavailableRefs);

const isRewriterContent = (
  value: unknown,
): value is RewriterShard['content'] =>
  isRecord(value) &&
  isStringArray(value.unresolvedAmbiguities) &&
  isStringArray(value.seamsAndContradictionsToPreserve) &&
  isStringArray(value.expectedChanges) &&
  Array.isArray(value.semanticCapabilityCalls) &&
  value.semanticCapabilityCalls.every((call) =>
    isRecord(call) &&
    typeof call.capability === 'string' &&
    isRecord(call.arguments) &&
    typeof call.arguments.actorId === 'string' &&
    typeof call.arguments.targetId === 'string' &&
    typeof call.arguments.affordance === 'string' &&
    (call.arguments.recipientId === undefined ||
      typeof call.arguments.recipientId === 'string') &&
    (call.arguments.placementTargetId === undefined ||
      typeof call.arguments.placementTargetId === 'string')
  );

const typedShardContentIsValid = (
  shard: CouncilProposalSnapshot['durableShards'][number]['shard'],
): boolean => {
  if (shard.role === 'Guardian') {
    return shard.kind === 'GUARDIAN' && isGuardianContent(shard.content);
  }
  if (shard.role === 'Archivist') {
    return shard.kind === 'ARCHIVIST' && isArchivistContent(shard.content);
  }
  if (shard.role === 'Rewriter') {
    return shard.kind === 'REWRITER' && isRewriterContent(shard.content);
  }
  return true;
};

const selectedShardsByRole = (
  proposal: CouncilProposalSnapshot,
): ReadonlyMap<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']> | undefined => {
  if (!isRecord(proposal) || !Array.isArray(proposal.durableShards)) return undefined;
  const rawCommit = proposal.durableCommit?.commit as unknown;
  if (rawCommit !== null && rawCommit !== undefined && !isRecord(rawCommit)) {
    return undefined;
  }
  const rawSelectedHashes = rawCommit?.selectedShardHashes;
  if (rawSelectedHashes !== undefined && !isStringArray(rawSelectedHashes)) {
    return undefined;
  }
  const selectedHashes = new Set(rawSelectedHashes ?? []);
  const byRole = new Map<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']>();
  for (const entry of proposal.durableShards) {
    if (!isRecord(entry) || !isRecord(entry.shard) || typeof entry.payloadHash !== 'string') {
      return undefined;
    }
    if (!selectedHashes.has(entry.payloadHash)) continue;
    const shard = entry.shard as unknown as CouncilProposalSnapshot['durableShards'][number]['shard'];
    const role = shard.role;
    if (!isCouncilRole(role)) return undefined;
    if (!byRole.has(role)) byRole.set(role, shard);
  }
  return byRole;
};

const hasEvery = (
  required: readonly string[],
  available: ReadonlySet<string>,
): boolean => required.every((value) => available.has(value));

const guardianContent = (
  shards: ReadonlyMap<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']>,
): GuardianShard['content'] | undefined => {
  const shard = shards.get('Guardian');
  return shard?.kind === 'GUARDIAN' && shard.role === 'Guardian'
    ? shard.content
    : undefined;
};

const rewriterContent = (
  shards: ReadonlyMap<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']>,
): RewriterShard['content'] | undefined => {
  const shard = shards.get('Rewriter');
  return shard?.kind === 'REWRITER' && shard.role === 'Rewriter'
    ? shard.content
    : undefined;
};

const archivistContent = (
  shards: ReadonlyMap<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']>,
): ArchivistShard['content'] | undefined => {
  const shard = shards.get('Archivist');
  return shard?.kind === 'ARCHIVIST' && shard.role === 'Archivist'
    ? shard.content
    : undefined;
};

export const evaluateGuardianConflict = (
  input: GuardianConflictInput,
): GuardianConflictResult => {
  try {
    const shards = selectedShardsByRole(input.proposal);
    if (shards === undefined ||
      [...shards.values()].some((shard) => !typedShardContentIsValid(shard))) {
      return typedInputFailure();
    }
    const guardian = guardianContent(shards);
    const rewriter = rewriterContent(shards);
    const archivist = archivistContent(shards);
    const reasons = new Set<GuardianReasonCode>();

    if (guardian === undefined) {
      return {
        status: 'NEEDS_CLARIFICATION',
        reasonCodes: ['GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED'],
      };
    }

    const rewriterCapabilityIds = new Set(
      rewriter?.semanticCapabilityCalls.map((call) => call.capability) ?? [],
    );
    const forbiddenCapabilityIds = new Set(guardian.forbiddenCapabilityIds);
    if ([...rewriterCapabilityIds].some((capabilityId) =>
      forbiddenCapabilityIds.has(capabilityId))) {
      reasons.add('GUARDIAN_FORBIDDEN_CAPABILITY');
    }

    const snapshotSourceLockIds = new Set(input.turn.snapshot.sourceLockIds);
    const snapshotRightsIds = new Set(input.turn.snapshot.registeredRightsIds);
    const archivistRightsIds = new Set(archivist?.rightsRequirements ?? []);
    const archivistProvenanceAnchorIds = new Set(archivist?.provenanceAnchors ?? []);
    const requiresArchivistEvidence =
      guardian.requiredSourceLockIds.length > 0 ||
      guardian.requiredRightsIds.length > 0;
    if (
      requiresArchivistEvidence &&
      (archivist === undefined ||
        !hasEvery(guardian.requiredSourceLockIds, snapshotSourceLockIds) ||
        !hasEvery(guardian.requiredSourceLockIds, archivistProvenanceAnchorIds) ||
        !hasEvery(guardian.requiredRightsIds, snapshotRightsIds) ||
        !hasEvery(guardian.requiredRightsIds, archivistRightsIds))
    ) {
      reasons.add('GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED');
    }

    if (guardian.contestedEvidenceIds.length > 0) {
      reasons.add('GUARDIAN_CONTESTED_EVIDENCE');
    }

    const supportedRollbackIds = new Set(
      input.turn.snapshot.supportedRollbackCapabilityIds,
    );
    if (!hasEvery(guardian.requiredRollbackCapabilityIds, supportedRollbackIds)) {
      reasons.add('GUARDIAN_ROLLBACK_REQUIREMENT_UNSATISFIED');
    }

    const reasonCodes = orderedReasons(reasons);
    if (guardian.disposition === 'WITHHOLD') {
      return { status: 'WITHHELD', reasonCodes };
    }
    if (guardian.disposition === 'NEEDS_CLARIFICATION' || reasonCodes.length > 0) {
      return { status: 'NEEDS_CLARIFICATION', reasonCodes };
    }
    return { status: 'ALLOW', reasonCodes: [] };
  } catch {
    return typedInputFailure();
  }
};
