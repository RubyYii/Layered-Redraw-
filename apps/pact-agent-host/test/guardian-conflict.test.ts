import { describe, expect, it } from 'vitest';

import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';

import {
  evaluateGuardianConflict,
  type GuardianConflictInput,
} from '../src/guardian-conflict.js';
import type { CouncilProposalSnapshot } from '../src/council-registry.js';
import type {
  CouncilRole,
  GuardianContent,
  CouncilShard,
  ArchivistShard,
  ConductorIntentShard,
  ConductorDraftCommit,
  GuardianShard,
  RewriterShard,
  WitnessShard,
} from '../src/contract-types.js';
import { type FrozenCouncilTurn } from '../src/council-turn.js';
import {
  createFullCouncilFixtures,
  roleOrder,
} from './council-fixtures.js';

const validChildSessionIds: Readonly<Record<CouncilRole, string>> = {
  CaseConductor: '550e8400-e29b-41d4-a716-446655440001',
  Witness: '550e8400-e29b-41d4-a716-446655440002',
  Archivist: '550e8400-e29b-41d4-a716-446655440003',
  Rewriter: '550e8400-e29b-41d4-a716-446655440004',
  Guardian: '550e8400-e29b-41d4-a716-446655440005',
};

const makeProposal = async (
  turn: FrozenCouncilTurn,
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
  commitOverrides: Partial<{
    readonly status: 'NEEDS_CLARIFICATION' | 'PROPOSED' | 'WITHHELD';
    readonly selectedDissentIds: readonly string[];
  }> = {},
): Promise<CouncilProposalSnapshot> => {
  const durableShards = await Promise.all(roleOrder.map(async (role, index) => {
    const shard = {
      ...shards[role],
      childSessionId: validChildSessionIds[role],
    } as CouncilShard;
    return {
      shard,
      payloadHash: await sha256Canonical(shard),
      acceptanceSequence: index + 1,
    };
  }));
  const commit = {
    schemaVersion: 'cp03-council/0.2' as const,
    turnId: turn.snapshot.turnId,
    status: commitOverrides.status ?? 'PROPOSED',
    actionSequence: ['Reframe', 'Continue'],
    selectedShardHashes: durableShards.map((entry) => entry.payloadHash),
    selectedDissentIds: commitOverrides.selectedDissentIds ?? ['dissent_guardian01'],
    terminalIntent: 'Continue' as const,
  };
  return {
    turn,
    selectionBarrierClosed: true,
    durableShards,
    durableCommit: {
      commit,
      payloadHash: await sha256Canonical(commit),
    },
  };
};

const withGuardianContent = (
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
  content: Partial<GuardianContent>,
): Readonly<Record<CouncilRole, CouncilShard>> => ({
  ...shards,
  Guardian: {
    ...(shards.Guardian as GuardianShard),
    content: {
      ...(shards.Guardian as GuardianShard).content,
      ...content,
    },
  } as GuardianShard,
});

const makeInput = async (
  content: Partial<GuardianContent> = {},
): Promise<GuardianConflictInput> => {
  const fixtures = await createFullCouncilFixtures();
  const shards = withGuardianContent(fixtures.shards, {
    contestedEvidenceIds: [],
    ...content,
  });
  return {
    turn: fixtures.turn,
    proposal: await makeProposal(fixtures.turn, shards),
  };
};

const withDurableCommit = async (
  proposal: CouncilProposalSnapshot,
  commit: ConductorDraftCommit,
  payloadHash?: string,
): Promise<CouncilProposalSnapshot> => ({
  ...proposal,
  durableCommit: {
    commit,
    payloadHash: payloadHash ?? await sha256Canonical(commit),
  },
});

const expectSelectedShardInvalid = async (
  input: GuardianConflictInput,
): Promise<void> => {
  expect(await evaluateGuardianConflict(input)).toEqual({
    status: 'NEEDS_CLARIFICATION',
    reasonCodes: ['GUARDIAN_SELECTED_SHARD_INVALID'],
  });
};

describe('typed Guardian conflict evaluation', () => {
  it('preserves WITHHOLD as WITHHELD', async () => {
    const fixtures = await createFullCouncilFixtures();
    const shards = withGuardianContent(fixtures.shards, {
      disposition: 'WITHHOLD',
      contestedEvidenceIds: [],
    });
    const result = await evaluateGuardianConflict({
      turn: fixtures.turn,
      proposal: await makeProposal(fixtures.turn, shards),
    });

    expect(result.status).toBe('WITHHELD');
  });

  it('preserves a Guardian NEEDS_CLARIFICATION disposition', async () => {
    const input = await makeInput({ disposition: 'NEEDS_CLARIFICATION' });

    expect((await evaluateGuardianConflict(input)).status)
      .toBe('NEEDS_CLARIFICATION');
  });

  it('reports a Rewriter capability intersection without rewriting prose', async () => {
    const input = await makeInput({
      forbiddenCapabilityIds: ['performRegisteredInteraction'],
    });

    expect(await evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_FORBIDDEN_CAPABILITY'],
    });
  });

  it('reports absent Archivist rights or source-lock evidence', async () => {
    const input = await makeInput({
      requiredSourceLockIds: ['source_missing'],
      requiredRightsIds: ['rights_missing'],
    });

    expect(await evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED'],
    });
  });

  it('requires each Guardian source lock to be anchored by the Archivist', async () => {
    const fixtures = await createFullCouncilFixtures();
    const archivist = fixtures.shards.Archivist as ArchivistShard;
    const shards = withGuardianContent({
      ...fixtures.shards,
      Archivist: {
        ...archivist,
        content: {
          ...archivist.content,
          provenanceAnchors: archivist.content.provenanceAnchors
            .filter((refId) => refId !== 'source-plane'),
        },
      } as ArchivistShard,
    }, { contestedEvidenceIds: [] });

    const result = await evaluateGuardianConflict({
      turn: fixtures.turn,
      proposal: await makeProposal(fixtures.turn, shards),
    });

    expect(result).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED'],
    });
  });

  it('reports contested Witness evidence IDs', async () => {
    const input = await makeInput({
      contestedEvidenceIds: ['observation_witness01'],
    });

    expect(await evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_CONTESTED_EVIDENCE'],
    });
  });

  it('reports missing rollback support', async () => {
    const input = await makeInput({
      requiredRollbackCapabilityIds: ['rollback_missing'],
    });

    expect(await evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_ROLLBACK_REQUIREMENT_UNSATISFIED'],
    });
  });

  it('returns all conflict reason codes in the stable contract order', async () => {
    const input = await makeInput({
      forbiddenCapabilityIds: ['performRegisteredInteraction'],
      requiredSourceLockIds: ['source_missing'],
      requiredRightsIds: ['rights_missing'],
      contestedEvidenceIds: ['observation_witness01'],
      requiredRollbackCapabilityIds: ['rollback_missing'],
    });

    expect(await evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: [
        'GUARDIAN_FORBIDDEN_CAPABILITY',
        'GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED',
        'GUARDIAN_CONTESTED_EVIDENCE',
        'GUARDIAN_ROLLBACK_REQUIREMENT_UNSATISFIED',
      ],
    });
  });

  it('allows fully matching typed constraints', async () => {
    const input = await makeInput();

    expect(await evaluateGuardianConflict(input)).toEqual({
      status: 'ALLOW',
      reasonCodes: [],
    });
  });

  it('fails closed when the Conductor selects the same shard hash twice', async () => {
    const input = await makeInput();
    const durableCommit = input.proposal.durableCommit;
    if (durableCommit === null) throw new Error('expected durable commit');
    const selectedShardHashes = durableCommit.commit.selectedShardHashes;
    const commit: ConductorDraftCommit = {
      ...durableCommit.commit,
      selectedShardHashes: [
        selectedShardHashes[0]!,
        selectedShardHashes[0]!,
        ...selectedShardHashes.slice(1),
      ],
    };

    await expectSelectedShardInvalid({
      ...input,
      proposal: await withDurableCommit(input.proposal, commit),
    });
  });

  it('fails closed when a selected shard hash has no durable entry', async () => {
    const input = await makeInput();
    const durableCommit = input.proposal.durableCommit;
    if (durableCommit === null) throw new Error('expected durable commit');
    const selectedShardHashes = durableCommit.commit.selectedShardHashes;
    const commit: ConductorDraftCommit = {
      ...durableCommit.commit,
      selectedShardHashes: [
        '0'.repeat(64),
        ...selectedShardHashes.slice(1),
      ],
    };

    await expectSelectedShardInvalid({
      ...input,
      proposal: await withDurableCommit(input.proposal, commit),
    });
  });

  it('fails closed when a selected durable payload hash does not bind its shard', async () => {
    const input = await makeInput();
    const durableCommit = input.proposal.durableCommit;
    if (durableCommit === null) throw new Error('expected durable commit');
    const forgedHash = '0'.repeat(64);
    const forgedDurableShards = input.proposal.durableShards.map((entry, index) =>
      index === 0 ? { ...entry, payloadHash: forgedHash } : entry);
    const commit: ConductorDraftCommit = {
      ...durableCommit.commit,
      selectedShardHashes: [
        forgedHash,
        ...durableCommit.commit.selectedShardHashes.slice(1),
      ],
    };

    await expectSelectedShardInvalid({
      ...input,
      proposal: await withDurableCommit({
        ...input.proposal,
        durableShards: forgedDurableShards,
      }, commit),
    });
  });

  it('fails closed when one selected hash resolves to multiple durable entries', async () => {
    const input = await makeInput();
    const durableCommit = input.proposal.durableCommit;
    if (durableCommit === null) throw new Error('expected durable commit');
    const archivistEntry = input.proposal.durableShards[2]!;
    const rewriterEntry = input.proposal.durableShards[3]!;
    const guardianEntry = input.proposal.durableShards[4]!;
    const conductorEntry = input.proposal.durableShards[0]!;
    const commit: ConductorDraftCommit = {
      ...durableCommit.commit,
      selectedShardHashes: [
        archivistEntry.payloadHash,
        rewriterEntry.payloadHash,
        guardianEntry.payloadHash,
      ],
    };

    await expectSelectedShardInvalid({
      ...input,
      proposal: await withDurableCommit({
        ...input.proposal,
        durableShards: [
          ...input.proposal.durableShards,
          {
            ...conductorEntry,
            payloadHash: guardianEntry.payloadHash,
            acceptanceSequence: 99,
          },
        ],
      }, commit),
    });
  });

  it('fails closed for a malformed full Conductor commit', async () => {
    const input = await makeInput();
    const durableCommit = input.proposal.durableCommit;
    if (durableCommit === null) throw new Error('expected durable commit');
    const malformedCommit = {
      ...durableCommit.commit,
      schemaVersion: 'cp03-council/9.9',
    } as unknown as ConductorDraftCommit;

    await expectSelectedShardInvalid({
      ...input,
      proposal: await withDurableCommit(input.proposal, malformedCommit),
    });
  });

  it('fails closed when the durable commit payload hash does not bind the commit', async () => {
    const input = await makeInput();
    const durableCommit = input.proposal.durableCommit;
    if (durableCommit === null) throw new Error('expected durable commit');

    await expectSelectedShardInvalid({
      ...input,
      proposal: await withDurableCommit(
        input.proposal,
        durableCommit.commit,
        '0'.repeat(64),
      ),
    });
  });

  it('fails closed when the Conductor selects no shard hashes', async () => {
    const input = await makeInput();
    const durableCommit = input.proposal.durableCommit;
    if (durableCommit === null) throw new Error('expected durable commit');
    const commit: ConductorDraftCommit = {
      ...durableCommit.commit,
      selectedShardHashes: [],
    };

    await expectSelectedShardInvalid({
      ...input,
      proposal: await withDurableCommit(input.proposal, commit),
    });
  });

  it('fails closed for malformed durable shard metadata', async () => {
    const input = await makeInput();
    const malformedDurableShards = input.proposal.durableShards.map((entry, index) =>
      index === 0
        ? {
            ...entry,
            acceptanceSequence: 'not-a-number' as unknown as number,
          }
        : entry);

    await expectSelectedShardInvalid({
      ...input,
      proposal: {
        ...input.proposal,
        durableShards: malformedDurableShards,
      },
    });
  });

  it.each([
    ['CaseConductor', (shards: Readonly<Record<CouncilRole, CouncilShard>>) => {
      const shard = shards.CaseConductor as ConductorIntentShard;
      return {
        ...shards,
        CaseConductor: {
          ...shard,
          content: {
            ...shard.content,
            candidateActionSequence: {} as unknown as readonly string[],
          },
        } as ConductorIntentShard,
      };
    }],
    ['Witness', (shards: Readonly<Record<CouncilRole, CouncilShard>>) => {
      const shard = shards.Witness as WitnessShard;
      return {
        ...shards,
        Witness: {
          ...shard,
          content: {
            ...shard.content,
            observations: {} as unknown as WitnessShard['content']['observations'],
          },
        } as WitnessShard,
      };
    }],
    ['Archivist', (shards: Readonly<Record<CouncilRole, CouncilShard>>) => {
      const shard = shards.Archivist as ArchivistShard;
      return {
        ...shards,
        Archivist: {
          ...shard,
          content: {
            ...shard.content,
            provenanceAnchors: {} as unknown as ArchivistShard['content']['provenanceAnchors'],
          },
        } as ArchivistShard,
      };
    }],
    ['Rewriter', (shards: Readonly<Record<CouncilRole, CouncilShard>>) => {
      const shard = shards.Rewriter as RewriterShard;
      return {
        ...shards,
        Rewriter: {
          ...shard,
          content: {
            ...shard.content,
            semanticCapabilityCalls: {} as unknown as RewriterShard['content']['semanticCapabilityCalls'],
          },
        } as RewriterShard,
      };
    }],
    ['Guardian', (shards: Readonly<Record<CouncilRole, CouncilShard>>) => {
      const shard = shards.Guardian as GuardianShard;
      return {
        ...shards,
        Guardian: {
          ...shard,
          content: {
            ...shard.content,
            requiredDissentRecords: {} as unknown as GuardianShard['content']['requiredDissentRecords'],
          },
        } as GuardianShard,
      };
    }],
  ] as const)('fails closed for malformed selected %s shards', async (_role, mutate) => {
    const fixtures = await createFullCouncilFixtures();
    const result = await evaluateGuardianConflict({
      turn: fixtures.turn,
      proposal: await makeProposal(fixtures.turn, mutate(fixtures.shards)),
    });

    expect(result).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_SELECTED_SHARD_INVALID'],
    });
  });

  it('ignores prose differences when the typed IDs still match', async () => {
    const fixtures = await createFullCouncilFixtures();
    const shards = withGuardianContent(fixtures.shards, {
      contestedEvidenceIds: [],
      guardianChallenge: 'A completely different sentence.',
    });
    const witness = shards.Witness as WitnessShard;
    const rewriter = shards.Rewriter as RewriterShard;
    const changedShards = {
      ...shards,
      Witness: {
        ...witness,
        content: {
          ...witness.content,
          observations: [{
            ...witness.content.observations[0]!,
            text: 'A prose statement that contradicts the other prose.',
          }],
        },
      } as WitnessShard,
      Rewriter: {
        ...rewriter,
        content: {
          ...rewriter.content,
          interpretation: 'A prose interpretation that sounds incompatible.',
        },
      } as RewriterShard,
    };
    const result = await evaluateGuardianConflict({
      turn: fixtures.turn,
      proposal: await makeProposal(fixtures.turn, changedShards),
    });

    expect(result).toEqual({ status: 'ALLOW', reasonCodes: [] });
  });
});
