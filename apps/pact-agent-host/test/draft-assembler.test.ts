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
  ArchivistShard,
  CouncilRole,
  CouncilShard,
  ConductorIntentShard,
  ConductorDraftCommit,
  GuardianShard,
  RewriterShard,
  WitnessShard,
} from '../src/contract-types.js';
import {
  freezeCouncilTurn,
  type FrozenCouncilTurn,
} from '../src/council-turn.js';
import {
  createFullCouncilFixtures,
  fullCouncilTurnInput,
  roleOrder,
  textOnlyTurnScope,
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

const retargetShards = (
  turn: FrozenCouncilTurn,
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
): Readonly<Record<CouncilRole, CouncilShard>> => Object.fromEntries(
  roleOrder.map((role) => [role, {
    ...shards[role],
    snapshotHash: turn.snapshotHash,
    parentSceneHash: turn.snapshot.parentSceneHash,
    registryVersion: turn.snapshot.registryVersion,
    routingManifestVersion: turn.snapshot.routingManifestVersion,
    deadlineId: turn.snapshot.deadlineId,
  }]),
) as Readonly<Record<CouncilRole, CouncilShard>>;

const makeTextOnlyInput = async (): Promise<AssembleCouncilDraftInput> => {
  const fixtures = await createFullCouncilFixtures();
  const turn = await freezeCouncilTurn({
    ...fullCouncilTurnInput,
    turnScope: textOnlyTurnScope,
    now: () => 1_000,
  });
  const source = fixtures.shards.CaseConductor as ConductorIntentShard;
  const conductor: ConductorIntentShard = {
    ...source,
    childSessionId: validChildSessionIds.CaseConductor,
    snapshotHash: turn.snapshotHash,
    parentSceneHash: turn.snapshot.parentSceneHash,
    registryVersion: turn.snapshot.registryVersion,
    routingManifestVersion: turn.snapshot.routingManifestVersion,
    deadlineId: turn.snapshot.deadlineId,
  };
  const payloadHash = await sha256Canonical(conductor);
  const commit: ConductorDraftCommit = {
    schemaVersion: 'cp03-council/0.2',
    turnId: turn.snapshot.turnId,
    status: 'PROPOSED',
    actionSequence: ['Reframe', 'Continue'],
    selectedShardHashes: [payloadHash],
    selectedDissentIds: [],
    terminalIntent: 'Continue',
  };
  return {
    turn,
    proposal: {
      turn,
      selectionBarrierClosed: true,
      durableShards: [{ shard: conductor, payloadHash, acceptanceSequence: 1 }],
      durableCommit: {
        commit,
        payloadHash: await sha256Canonical(commit),
      },
    },
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
      provenanceAnchors: ['input_image01', 'source-plane'],
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
      forbiddenChanges: ['source-plane'],
      forbiddenCapabilityIds: ['rawTransform'],
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
      witnessEvidence: {
        observations: [{
          observationId: 'observation_witness01',
          text: 'The synthetic image contains a visible source plane.',
          inputRefIds: ['input_image01', 'input_text01'],
        }],
        uncertainties: ['The spatial relation remains interpretive.'],
        evidenceAnchors: ['input_image01', 'input_text01'],
      },
      dissentRecords: [{
        dissentId: 'dissent_guardian01',
        text: 'Do not treat the spatial relation as historical fact.',
        evidenceIds: ['input_text01'],
      }],
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

  it('binds every nested interaction reference to the frozen registries and exact effects', async () => {
    const fixtures = await createFullCouncilFixtures();
    const rewriter = fixtures.shards.Rewriter as RewriterShard;
    const call = rewriter.content.semanticCapabilityCalls[0]!;
    const nestedArguments = {
      ...call.arguments,
      recipientId: 'interaction-recipient-a',
      placementTargetId: 'interaction-placement-a',
    };
    const nestedShards = validShards({
      ...fixtures.shards,
      Rewriter: {
        ...rewriter,
        content: {
          ...rewriter.content,
          semanticCapabilityCalls: [{ ...call, arguments: nestedArguments }],
          expectedChanges: [
            'asset-cup01',
            'interaction-actor-a',
            'interaction-placement-a',
            'interaction-recipient-a',
          ],
        },
      } as RewriterShard,
    });
    const result = await assembleCouncilDraft(await makeInputWithShards(nestedShards));

    expect(result.status).toBe('ASSEMBLED');
  });

  it('requires the semantic capability to be allowed by the frozen turn', async () => {
    const fixtures = await createFullCouncilFixtures();
    const turn = await freezeCouncilTurn({
      ...fullCouncilTurnInput,
      allowedSemanticCapabilityIds: [],
      now: () => 1_000,
    });
    const shards = retargetShards(turn, validShards(fixtures.shards));
    const result = await assembleCouncilDraft({
      turn,
      proposal: await makeProposal(turn, shards),
      now: () => 2_000,
    });

    expect(result).toMatchObject({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_CAPABILITY_REFERENCE_UNKNOWN'],
    });
  });

  it('rejects unknown nested scene objects, affordances, and exact-effect mismatches', async () => {
    const fixtures = await createFullCouncilFixtures();
    const rewriter = fixtures.shards.Rewriter as RewriterShard;
    const call = rewriter.content.semanticCapabilityCalls[0]!;
    const baseArguments = {
      ...call.arguments,
      recipientId: 'interaction-recipient-a',
      placementTargetId: 'interaction-placement-a',
    };
    const expectedChanges = [
      'asset-cup01',
      'interaction-actor-a',
      'interaction-placement-a',
      'interaction-recipient-a',
    ];
    const cases: readonly [
      string,
      typeof baseArguments,
      string,
    ][] = [
      ['actor', { ...baseArguments, actorId: 'scene-unknown-actor' }, 'ASSEMBLY_SCENE_OBJECT_REFERENCE_UNKNOWN'],
      ['target', { ...baseArguments, targetId: 'scene-unknown-target' }, 'ASSEMBLY_SCENE_OBJECT_REFERENCE_UNKNOWN'],
      ['recipient', { ...baseArguments, recipientId: 'scene-unknown-recipient' }, 'ASSEMBLY_SCENE_OBJECT_REFERENCE_UNKNOWN'],
      ['placement', { ...baseArguments, placementTargetId: 'scene-unknown-placement' }, 'ASSEMBLY_SCENE_OBJECT_REFERENCE_UNKNOWN'],
      ['affordance', { ...baseArguments, affordance: 'affordance-unknown' }, 'ASSEMBLY_AFFORDANCE_REFERENCE_UNKNOWN'],
    ];

    for (const [_label, argumentsOverride, reasonCode] of cases) {
      const shards = validShards({
        ...fixtures.shards,
        Rewriter: {
          ...rewriter,
          content: {
            ...rewriter.content,
            semanticCapabilityCalls: [{ ...call, arguments: argumentsOverride }],
            expectedChanges,
          },
        } as RewriterShard,
      });
      const result = await assembleCouncilDraft(await makeInputWithShards(shards));
      expect(result.status).toBe('NEEDS_CLARIFICATION');
      if (result.status === 'NEEDS_CLARIFICATION') {
        expect(result.reasonCodes).toContain(reasonCode);
      }
    }

    const mismatchShards = validShards({
      ...fixtures.shards,
      Rewriter: {
        ...rewriter,
        content: {
          ...rewriter.content,
          semanticCapabilityCalls: [{ ...call, arguments: baseArguments }],
          expectedChanges: ['asset-cup01'],
        },
      } as RewriterShard,
    });
    const mismatch = await assembleCouncilDraft(await makeInputWithShards(mismatchShards));
    expect(mismatch.status).toBe('NEEDS_CLARIFICATION');
    if (mismatch.status === 'NEEDS_CLARIFICATION') {
      expect(mismatch.reasonCodes).toContain('ASSEMBLY_EXPECTED_CHANGES_MISMATCH');
    }
  });

  it('rejects duplicate and conflicting Guardian dissent records before map selection', async () => {
    const fixtures = await createFullCouncilFixtures();
    const guardian = fixtures.shards.Guardian as GuardianShard;
    const record = guardian.content.requiredDissentRecords[0]!;
    const duplicateShards = validShards({
      ...fixtures.shards,
      Guardian: {
        ...guardian,
        content: {
          ...guardian.content,
          requiredDissentRecords: [
            record,
            { ...record, text: 'A conflicting record with the same stable ID.' },
          ],
        },
      } as GuardianShard,
    });
    const result = await assembleCouncilDraft(await makeInputWithShards(duplicateShards));

    expect(result).toMatchObject({
      status: 'FAILED_NO_MUTATION',
      reasonCodes: ['ASSEMBLY_DUPLICATE_DISSENT_ID'],
    });
  });

  it('preserves selected structured dissent records in commit-selected order', async () => {
    const fixtures = await createFullCouncilFixtures();
    const guardian = fixtures.shards.Guardian as GuardianShard;
    const first = guardian.content.requiredDissentRecords[0]!;
    const second = {
      dissentId: 'dissent_guardian02',
      text: 'Keep the source plane visibly unchanged.',
      evidenceIds: ['input_image01'],
    };
    const shards = validShards({
      ...fixtures.shards,
      Guardian: {
        ...guardian,
        content: {
          ...guardian.content,
          requiredDissentRecords: [first, second],
        },
      } as GuardianShard,
    });
    const result = await assembleCouncilDraft(await makeInputWithShards(
      shards,
      { selectedDissentIds: [second.dissentId, first.dissentId] },
    ));

    expect(result.status).toBe('ASSEMBLED');
    if (result.status !== 'ASSEMBLED') return;
    expect(result.draft.agency.dissentRecords).toEqual([second, first]);
    expect(result.draft.agency.disagreements).toEqual([second.text, first.text]);
  });

  it('allows empty runtime restriction and rollback sets without fallback strings', async () => {
    const fixtures = await createFullCouncilFixtures();
    const guardian = fixtures.shards.Guardian as GuardianShard;
    const shards = validShards({
      ...fixtures.shards,
      Guardian: {
        ...guardian,
        content: {
          ...guardian.content,
          forbiddenCapabilityIds: [],
          requiredSourceLockIds: [],
          requiredRollbackCapabilityIds: [],
        },
      } as GuardianShard,
    });
    const result = await assembleCouncilDraft(await makeInputWithShards(shards));

    expect(result.status).toBe('ASSEMBLED');
    if (result.status !== 'ASSEMBLED') return;
    expect(result.draft.execution.forbiddenChanges).toEqual([]);
    expect(result.draft.execution.forbiddenCapabilityIds).toEqual([]);
    expect(result.draft.execution.rollbackRequirements).toEqual([]);
  });

  it('validates every selected shard before any kind-specific nested access', async () => {
    type ShardMap = Readonly<Record<CouncilRole, CouncilShard>>;
    type Mutator = (shards: ShardMap) => ShardMap;
    const malformedCases: readonly [string, Mutator][] = [
      ['CaseConductor', (shards) => {
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
      ['Witness', (shards) => {
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
      ['Archivist', (shards) => {
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
      ['Rewriter', (shards) => {
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
      ['Guardian', (shards) => {
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
    ];

    for (const [_role, mutate] of malformedCases) {
      const fixtures = await createFullCouncilFixtures();
      const input = await makeInputWithShards(mutate(validShards(fixtures.shards)));
      const now = vi.fn(() => 2_000);
      const result = await assembleCouncilDraft({ ...input, now });
      expect(result).toMatchObject({
        status: 'FAILED_NO_MUTATION',
        reasonCodes: ['ASSEMBLY_SHARD_INVALID'],
      });
      expect(now).not.toHaveBeenCalled();
    }
  });

  it('does not report an optional role as missing when a text-only turn cannot form an executable draft', async () => {
    const input = await makeTextOnlyInput();
    const result = await assembleCouncilDraft(input);

    expect(result).toMatchObject({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_EXECUTABLE_BOUNDARY_REQUIRES_FULL_COUNCIL'],
    });
    expect('draft' in result).toBe(false);
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
    const unknownCapabilityResult = await assembleCouncilDraft(unknownCapabilityInput);
    expect(unknownCapabilityResult.status).toBe('FAILED_NO_MUTATION');
    if (unknownCapabilityResult.status === 'FAILED_NO_MUTATION') {
      expect(unknownCapabilityResult.reasonCodes).toContain('ASSEMBLY_SHARD_INVALID');
    }
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
