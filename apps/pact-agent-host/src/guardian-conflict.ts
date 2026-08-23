import { validateCouncilShard } from '@layered-redraw/pact-cp03-contracts';
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

const selectedShardFailure = (): GuardianConflictResult => ({
  status: 'NEEDS_CLARIFICATION',
  reasonCodes: ['GUARDIAN_SELECTED_SHARD_INVALID'],
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

const selectedShardsByRole = (
  proposal: CouncilProposalSnapshot,
): {
  readonly selected: readonly CouncilProposalSnapshot['durableShards'][number]['shard'][];
  readonly byRole: ReadonlyMap<
    CouncilRole,
    CouncilProposalSnapshot['durableShards'][number]['shard']
  >;
} | undefined => {
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
  const selected: CouncilProposalSnapshot['durableShards'][number]['shard'][] = [];
  const byRole = new Map<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']>();
  for (const entry of proposal.durableShards) {
    if (!isRecord(entry) || !isRecord(entry.shard) || typeof entry.payloadHash !== 'string') {
      return undefined;
    }
    if (!selectedHashes.has(entry.payloadHash)) continue;
    const shard = entry.shard as unknown as CouncilProposalSnapshot['durableShards'][number]['shard'];
    const role = shard.role;
    if (!isCouncilRole(role)) return undefined;
    selected.push(shard);
    if (byRole.has(role)) return undefined;
    byRole.set(role, shard);
  }
  return { selected, byRole };
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
    const selected = selectedShardsByRole(input.proposal);
    if (selected === undefined) {
      return selectedShardFailure();
    }
    for (const shard of selected.selected) {
      validateCouncilShard(shard);
    }
    const shards = selected.byRole;
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
    return selectedShardFailure();
  }
};
