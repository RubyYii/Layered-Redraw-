import {
  sha256Canonical,
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';
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

const isHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const hasDuplicates = <T>(values: readonly T[]): boolean =>
  new Set(values).size !== values.length;

const selectedShardsByRole = async (
  proposal: CouncilProposalSnapshot,
): Promise<ReadonlyMap<
  CouncilRole,
  CouncilProposalSnapshot['durableShards'][number]['shard']
> | undefined> => {
  if (!isRecord(proposal) || !Array.isArray(proposal.durableShards)) return undefined;
  const rawDurableCommit = proposal.durableCommit as unknown;
  if (!isRecord(rawDurableCommit) || !isHash(rawDurableCommit.payloadHash)) {
    return undefined;
  }
  const commit = validateConductorDraftCommit(rawDurableCommit.commit);
  if (await sha256Canonical(commit) !== rawDurableCommit.payloadHash) {
    return undefined;
  }
  if (
    commit.selectedShardHashes.length === 0 ||
    hasDuplicates(commit.selectedShardHashes)
  ) {
    return undefined;
  }

  const durableEntries: CouncilProposalSnapshot['durableShards'][number][] = [];
  for (const rawEntry of proposal.durableShards) {
    if (
      !isRecord(rawEntry) ||
      !isRecord(rawEntry.shard) ||
      !isHash(rawEntry.payloadHash) ||
      !Number.isSafeInteger(rawEntry.acceptanceSequence) ||
      (rawEntry.acceptanceSequence as number) <= 0
    ) {
      return undefined;
    }
    durableEntries.push(
      rawEntry as unknown as CouncilProposalSnapshot['durableShards'][number],
    );
  }
  if (hasDuplicates(durableEntries.map((entry) => entry.payloadHash))) {
    return undefined;
  }

  const byRole = new Map<CouncilRole, CouncilProposalSnapshot['durableShards'][number]['shard']>();
  for (const payloadHash of commit.selectedShardHashes) {
    const matches = durableEntries.filter((entry) => entry.payloadHash === payloadHash);
    if (matches.length !== 1) {
      return undefined;
    }
    const entry = matches[0]!;
    const shard = validateCouncilShard(entry.shard);
    if (await sha256Canonical(entry.shard) !== entry.payloadHash) {
      return undefined;
    }
    if (byRole.has(shard.role)) return undefined;
    byRole.set(shard.role, shard);
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

export const evaluateGuardianConflict = async (
  input: GuardianConflictInput,
): Promise<GuardianConflictResult> => {
  try {
    const shards = await selectedShardsByRole(input.proposal);
    if (shards === undefined) {
      return selectedShardFailure();
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
    return selectedShardFailure();
  }
};
