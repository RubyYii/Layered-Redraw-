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
  GuardianShard,
  RewriterShard,
  WitnessShard,
} from '../src/contract-types.js';
import { type FrozenCouncilTurn } from '../src/council-turn.js';
import {
  createFullCouncilFixtures,
  roleOrder,
} from './council-fixtures.js';

const makeProposal = async (
  turn: FrozenCouncilTurn,
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
  commitOverrides: Partial<{
    readonly status: 'NEEDS_CLARIFICATION' | 'PROPOSED' | 'WITHHELD';
    readonly selectedDissentIds: readonly string[];
  }> = {},
): Promise<CouncilProposalSnapshot> => {
  const durableShards = await Promise.all(roleOrder.map(async (role, index) => ({
    shard: shards[role],
    payloadHash: await sha256Canonical(shards[role]),
    acceptanceSequence: index + 1,
  })));
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

describe('typed Guardian conflict evaluation', () => {
  it('preserves WITHHOLD as WITHHELD', async () => {
    const fixtures = await createFullCouncilFixtures();
    const shards = withGuardianContent(fixtures.shards, {
      disposition: 'WITHHOLD',
      contestedEvidenceIds: [],
    });
    const result = evaluateGuardianConflict({
      turn: fixtures.turn,
      proposal: await makeProposal(fixtures.turn, shards),
    });

    expect(result.status).toBe('WITHHELD');
  });

  it('preserves a Guardian NEEDS_CLARIFICATION disposition', async () => {
    const input = await makeInput({ disposition: 'NEEDS_CLARIFICATION' });

    expect(evaluateGuardianConflict(input).status).toBe('NEEDS_CLARIFICATION');
  });

  it('reports a Rewriter capability intersection without rewriting prose', async () => {
    const input = await makeInput({
      forbiddenCapabilityIds: ['performRegisteredInteraction'],
    });

    expect(evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_FORBIDDEN_CAPABILITY'],
    });
  });

  it('reports absent Archivist rights or source-lock evidence', async () => {
    const input = await makeInput({
      requiredSourceLockIds: ['source_missing'],
      requiredRightsIds: ['rights_missing'],
    });

    expect(evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED'],
    });
  });

  it('reports contested Witness evidence IDs', async () => {
    const input = await makeInput({
      contestedEvidenceIds: ['observation_witness01'],
    });

    expect(evaluateGuardianConflict(input)).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['GUARDIAN_CONTESTED_EVIDENCE'],
    });
  });

  it('reports missing rollback support', async () => {
    const input = await makeInput({
      requiredRollbackCapabilityIds: ['rollback_missing'],
    });

    expect(evaluateGuardianConflict(input)).toEqual({
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

    expect(evaluateGuardianConflict(input)).toEqual({
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

    expect(evaluateGuardianConflict(input)).toEqual({
      status: 'ALLOW',
      reasonCodes: [],
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
    const result = evaluateGuardianConflict({
      turn: fixtures.turn,
      proposal: await makeProposal(fixtures.turn, changedShards),
    });

    expect(result).toEqual({ status: 'ALLOW', reasonCodes: [] });
  });
});
