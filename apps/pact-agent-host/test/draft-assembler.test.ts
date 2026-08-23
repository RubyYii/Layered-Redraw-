import { describe, expect, it, vi } from 'vitest';

import {
  canonicalJson,
  sha256Canonical,
} from '@layered-redraw/pact-cp03-contracts';

import {
  assembleCouncilDraft,
  type AssembleCouncilDraftInput,
} from '../src/draft-assembler.js';
import type { CouncilProposalSnapshot } from '../src/council-registry.js';
import type {
  CouncilRole,
  CouncilShard,
  ConductorIntentShard,
  ConductorDraftCommit,
  GuardianShard,
  RewriterShard,
} from '../src/contract-types.js';
import {
  type FrozenCouncilTurn,
} from '../src/council-turn.js';
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

const validShards = (
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
): Readonly<Record<CouncilRole, CouncilShard>> => {
  const guardian = shards.Guardian as GuardianShard;
  return {
    ...shards,
    CaseConductor: {
      ...shards.CaseConductor,
      childSessionId: validChildSessionIds.CaseConductor,
    },
    Witness: {
      ...shards.Witness,
      childSessionId: validChildSessionIds.Witness,
    },
    Archivist: {
      ...shards.Archivist,
      childSessionId: validChildSessionIds.Archivist,
    },
    Rewriter: {
      ...shards.Rewriter,
      childSessionId: validChildSessionIds.Rewriter,
    },
    Guardian: {
      ...guardian,
      childSessionId: validChildSessionIds.Guardian,
      content: {
        ...guardian.content,
        contestedEvidenceIds: [],
      },
    },
  };
};

const makeProposal = async (
  turn: FrozenCouncilTurn,
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
  commitOverrides: Partial<ConductorDraftCommit> = {},
  proposalOverrides: Partial<CouncilProposalSnapshot> = {},
): Promise<CouncilProposalSnapshot> => {
  const durableShards = await Promise.all(roleOrder.map(async (role, index) => ({
    shard: shards[role],
    payloadHash: await sha256Canonical(shards[role]),
    acceptanceSequence: index + 1,
  })));
  const commit: ConductorDraftCommit = {
    schemaVersion: 'cp03-council/0.2',
    turnId: turn.snapshot.turnId,
    status: 'PROPOSED',
    actionSequence: ['Reframe', 'Continue'],
    selectedShardHashes: durableShards.map((entry) => entry.payloadHash),
    selectedDissentIds: ['dissent_guardian01'],
    terminalIntent: 'Continue',
    ...commitOverrides,
  };
  return {
    turn,
    selectionBarrierClosed: true,
    durableShards,
    durableCommit: {
      commit,
      payloadHash: await sha256Canonical(commit),
    },
    ...proposalOverrides,
  };
};

const makeInput = async (
  commitOverrides: Partial<ConductorDraftCommit> = {},
  shardOverrides: Partial<Readonly<Record<CouncilRole, CouncilShard>>> = {},
  proposalOverrides: Partial<CouncilProposalSnapshot> = {},
): Promise<AssembleCouncilDraftInput> => {
  const fixtures = await createFullCouncilFixtures();
  const shards = {
    ...validShards(fixtures.shards),
    ...shardOverrides,
  } as Readonly<Record<CouncilRole, CouncilShard>>;
  return {
    turn: fixtures.turn,
    proposal: await makeProposal(fixtures.turn, shards, commitOverrides, proposalOverrides),
    now: () => 2_000,
  };
};

const makeInputWithShards = async (
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
  commitOverrides: Partial<ConductorDraftCommit> = {},
): Promise<AssembleCouncilDraftInput> => {
  const fixtures = await createFullCouncilFixtures();
  return {
    turn: fixtures.turn,
    proposal: await makeProposal(fixtures.turn, shards, commitOverrides),
    now: () => 2_000,
  };
};

const reorderObject = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reorderObject);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .reverse()
    .map(([key, child]) => [key, reorderObject(child)] as const);
  return Object.fromEntries(entries);
};

describe('deterministic council draft assembler', () => {
  it('copies the typed council fields into a schema-valid runtime draft', async () => {
    const input = await makeInput();
    const result = await assembleCouncilDraft(input);

    expect(result.status).toBe('ASSEMBLED');
    if (result.status !== 'ASSEMBLED') return;

    expect(result.draft.identity).toMatchObject({
      schemaVersion: 'cp03-runtime/0.1',
      caseSessionId: input.turn.snapshot.caseSessionId,
      turnId: input.turn.snapshot.turnId,
      parentSceneHash: input.turn.snapshot.parentSceneHash,
    });
    expect(result.draft.decision).toEqual({
      status: 'PROPOSED',
      actionSequence: ['Reframe', 'Continue'],
    });
    const conductor = input.proposal.durableShards[0]!.shard as ConductorIntentShard;
    expect(result.draft.creative).toEqual({
      interpretation: conductor.content.initialInterpretation,
      unresolvedAmbiguities: ['The exact spatial relation remains uncertain.'],
      spatialIntent: 'Use the registered bridge without replacing the source.',
      visualIntent: 'Preserve the seam between source and proposal.',
      cameraIntent: 'Hold a readable lateral relation.',
      lightIntent: 'Keep one restrained edge light.',
      soundIntent: 'Use only fictional room tone.',
      publicPoeticText: 'The grid leans; the source does not.',
      seamsAndContradictionsToPreserve: ['Near and not-near remain visible.'],
    });
    expect(result.draft.materials).toEqual({
      requestedAssetIds: ['asset-cup01'],
      requestedSpatialBridgeIds: ['bridge-window01'],
      provenanceAnchors: ['input_image01'],
      rightsRequirements: ['rights-local-scene'],
    });
    expect(result.draft.execution).toEqual({
      executionMode: 'EXECUTABLE_PROPOSAL',
      semanticCapabilityCalls: [{
        capability: 'performRegisteredInteraction',
        arguments: {
          actorId: 'interaction-actor-a',
          targetId: 'asset-cup01',
          affordance: 'pickup',
        },
      }],
      expectedChanges: ['interaction-actor-a', 'asset-cup01'],
      forbiddenChanges: ['rawTransform'],
      rollbackRequirements: ['rollback-transient-overlay'],
      terminalIntent: 'Continue',
    });
    expect(result.draft.agency).toEqual({
      contributions: roleOrder.map((role, index) => ({
        role,
        childSessionId: validChildSessionIds[role],
        contributionHash: input.proposal.durableShards[index]!.payloadHash,
      })),
      disagreements: ['Do not treat the spatial relation as historical fact.'],
      guardianChallenge: 'Execute only after approval of this exact hash-bound proposal.',
    });
    expect(result.draft.identity.draftId).toMatch(/^draft_[A-Za-z0-9_-]{8,80}$/);
    expect(result.draftHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces byte-identical canonical drafts and hashes for insertion-order variants', async () => {
    const first = await makeInput();
    const secondBase = await makeInput();
    const second = {
      ...secondBase,
      proposal: reorderObject(secondBase.proposal) as CouncilProposalSnapshot,
    };
    const [firstResult, secondResult] = await Promise.all([
      assembleCouncilDraft(first),
      assembleCouncilDraft(second),
    ]);

    expect(firstResult.status).toBe('ASSEMBLED');
    expect(secondResult.status).toBe('ASSEMBLED');
    if (firstResult.status !== 'ASSEMBLED' || secondResult.status !== 'ASSEMBLED') return;
    expect(canonicalJson(firstResult.draft)).toBe(canonicalJson(secondResult.draft));
    expect(firstResult.draftHash).toBe(secondResult.draftHash);
  });

  it('rejects duplicate selected hashes and duplicate required roles before reading the clock', async () => {
    const input = await makeInput();
    const commit = input.proposal.durableCommit!.commit;
    const duplicateHashInput = {
      ...input,
      now: vi.fn(() => 2_000),
      proposal: {
        ...input.proposal,
        durableCommit: {
          commit: {
            ...commit,
            selectedShardHashes: [
              commit.selectedShardHashes[0]!,
              commit.selectedShardHashes[0]!,
              ...commit.selectedShardHashes.slice(2),
            ],
          },
          payloadHash: await sha256Canonical({
            ...commit,
            selectedShardHashes: [
              commit.selectedShardHashes[0]!,
              commit.selectedShardHashes[0]!,
              ...commit.selectedShardHashes.slice(2),
            ],
          }),
        },
      },
    };
    const duplicateHashResult = await assembleCouncilDraft(duplicateHashInput);
    expect(duplicateHashResult.status).toBe('FAILED_NO_MUTATION');
    expect(duplicateHashInput.now).not.toHaveBeenCalled();

    const duplicateRoleShards = [
      ...input.proposal.durableShards,
      {
        shard: input.proposal.durableShards[3]!.shard,
        payloadHash: input.proposal.durableShards[3]!.payloadHash,
        acceptanceSequence: 99,
      },
    ];
    const duplicateRoleInput = {
      ...input,
      now: vi.fn(() => 2_000),
      proposal: { ...input.proposal, durableShards: duplicateRoleShards },
    };
    const duplicateRoleResult = await assembleCouncilDraft(duplicateRoleInput);
    expect(duplicateRoleResult.status).toBe('FAILED_NO_MUTATION');
    expect(duplicateRoleInput.now).not.toHaveBeenCalled();
  });

  it('rejects missing required roles and an unselected required shard', async () => {
    const input = await makeInput();
    const commit = input.proposal.durableCommit!.commit;
    const withoutGuardian = {
      ...input,
      proposal: {
        ...input.proposal,
        durableCommit: {
          commit: {
            ...commit,
            selectedShardHashes: commit.selectedShardHashes.slice(0, -1),
          },
          payloadHash: await sha256Canonical({
            ...commit,
            selectedShardHashes: commit.selectedShardHashes.slice(0, -1),
          }),
        },
      },
    };
    expect((await assembleCouncilDraft(withoutGuardian)).status)
      .toBe('FAILED_NO_MUTATION');

    const unselectedRequired = await makeInput();
    const unselectedCommit = unselectedRequired.proposal.durableCommit!.commit;
    const rewriterHash = unselectedCommit.selectedShardHashes[3]!;
    const unselected = {
      ...unselectedRequired,
      proposal: {
        ...unselectedRequired.proposal,
        durableCommit: {
          commit: {
            ...unselectedCommit,
            selectedShardHashes: unselectedCommit.selectedShardHashes.filter(
              (hash) => hash !== rewriterHash,
            ),
          },
          payloadHash: await sha256Canonical({
            ...unselectedCommit,
            selectedShardHashes: unselectedCommit.selectedShardHashes.filter(
              (hash) => hash !== rewriterHash,
            ),
          }),
        },
      },
    };
    expect((await assembleCouncilDraft(unselected)).status)
      .toBe('FAILED_NO_MUTATION');
  });

  it('rejects unknown dissent IDs and omitted required dissent IDs', async () => {
    const unknown = await makeInput({ selectedDissentIds: ['dissent_unknown'] });
    expect((await assembleCouncilDraft(unknown)).status)
      .toBe('NEEDS_CLARIFICATION');

    const omitted = await makeInput({ selectedDissentIds: [] });
    expect((await assembleCouncilDraft(omitted)).status)
      .toBe('NEEDS_CLARIFICATION');
  });

  it('rejects stale snapshot/hash and unknown asset or capability references', async () => {
    const stale = await makeInput();
    const staleShard = stale.proposal.durableShards[3]!.shard;
    const staleShards = stale.proposal.durableShards.map((entry) =>
      entry.shard === staleShard
        ? { ...entry, shard: { ...entry.shard, snapshotHash: 'a'.repeat(64) } }
        : entry);
    expect((await assembleCouncilDraft({
      ...stale,
      proposal: { ...stale.proposal, durableShards: staleShards },
    })).status).toBe('FAILED_NO_MUTATION');

    const unknownAssetFixtures = await createFullCouncilFixtures();
    const shards = validShards(unknownAssetFixtures.shards);
    const rewriter = shards.Rewriter as RewriterShard;
    const unknownAssetShards = {
      ...shards,
      Rewriter: {
        ...rewriter,
        content: {
          ...rewriter.content,
          semanticCapabilityCalls: [{
            ...rewriter.content.semanticCapabilityCalls[0]!,
            arguments: {
              ...rewriter.content.semanticCapabilityCalls[0]!.arguments,
              targetId: 'asset_unknown',
            },
          }],
        },
      } as RewriterShard,
    } as Readonly<Record<CouncilRole, CouncilShard>>;
    const unknownAssetInput = await makeInputWithShards(unknownAssetShards);
    expect((await assembleCouncilDraft(unknownAssetInput)).status)
      .toBe('NEEDS_CLARIFICATION');

    const unknownCapabilityInput = await makeInputWithShards({
      ...shards,
      Rewriter: {
        ...rewriter,
        content: {
          ...rewriter.content,
          semanticCapabilityCalls: [{
            ...rewriter.content.semanticCapabilityCalls[0]!,
            capability: 'unregisteredCapability' as 'performRegisteredInteraction',
          }],
        },
      } as RewriterShard,
    } as Readonly<Record<CouncilRole, CouncilShard>>);
    expect((await assembleCouncilDraft(unknownCapabilityInput)).status)
      .toBe('NEEDS_CLARIFICATION');
  });

  it('rejects terminal-action mismatch without changing the commit sequence', async () => {
    const input = await makeInput({ terminalIntent: 'KeepOpaque' });
    const result = await assembleCouncilDraft(input);

    expect(result.status).toBe('FAILED_NO_MUTATION');
    expect(input.proposal.durableCommit!.commit.actionSequence)
      .toEqual(['Reframe', 'Continue']);
    expect('draft' in result).toBe(false);
  });

  it('propagates Guardian WITHHOLD without returning an executable draft', async () => {
    const fixtures = await createFullCouncilFixtures();
    const shards = validShards({
      ...fixtures.shards,
      Guardian: {
        ...(fixtures.shards.Guardian as GuardianShard),
        childSessionId: validChildSessionIds.Guardian,
        content: {
          ...(fixtures.shards.Guardian as GuardianShard).content,
          disposition: 'WITHHOLD',
          contestedEvidenceIds: [],
        },
      } as GuardianShard,
    });
    const result = await assembleCouncilDraft(await makeInputWithShards(shards));

    expect(result.status).toBe('WITHHELD');
    expect('draft' in result).toBe(false);
  });

  it('fails without a draft when assembly ends at the hard deadline', async () => {
    const input = await makeInput();
    const now = vi.fn()
      .mockReturnValueOnce(input.turn.startedAtMonotonicMs + 1)
      .mockReturnValueOnce(input.turn.deadlineAtMonotonicMs);
    const result = await assembleCouncilDraft({ ...input, now });

    expect(result.status).toBe('FAILED_NO_MUTATION');
    if (result.status !== 'FAILED_NO_MUTATION') return;
    expect(result.reasonCodes).toContain('ASSEMBLY_DEADLINE_EXCEEDED');
    expect('draft' in result).toBe(false);
    expect(now).toHaveBeenCalledTimes(2);
  });
});
