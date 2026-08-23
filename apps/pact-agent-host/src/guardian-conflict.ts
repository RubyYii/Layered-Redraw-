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

const selectedShardsByRole = (
  proposal: CouncilProposalSnapshot,
): ReadonlyMap<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']> => {
  const selectedHashes = new Set(
    proposal.durableCommit?.commit.selectedShardHashes ?? [],
  );
  const byRole = new Map<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']>();
  for (const entry of proposal.durableShards) {
    if (!selectedHashes.has(entry.payloadHash)) continue;
    if (!byRole.has(entry.shard.role)) byRole.set(entry.shard.role, entry.shard);
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
  const shards = selectedShardsByRole(input.proposal);
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
  const requiresArchivistEvidence =
    guardian.requiredSourceLockIds.length > 0 ||
    guardian.requiredRightsIds.length > 0;
  if (
    requiresArchivistEvidence &&
    (archivist === undefined ||
      archivist.provenanceAnchors.length === 0 ||
      !hasEvery(guardian.requiredSourceLockIds, snapshotSourceLockIds) ||
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
};
