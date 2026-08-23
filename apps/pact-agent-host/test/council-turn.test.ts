import { describe, expect, it, vi } from 'vitest';

import {
  COUNCIL_TIMING_LIMITS,
  freezeCouncilTurn,
  isBeforeCouncilDeadline,
  requiredRolesForTurn,
  type FreezeCouncilTurnInput,
} from '../src/council-turn.js';
import {
  fullCouncilTurnInput,
  fullTurnScope,
  fullCouncilFixture,
  roleOrder,
  scriptedDualProviderManifest,
  textOnlyTurnScope,
  createFullCouncilFixtures,
} from './council-fixtures.js';

type TurnFacts = Omit<FreezeCouncilTurnInput, 'now'>;

const freezeAt = (
  input: TurnFacts = fullCouncilTurnInput,
  now = 1_000,
) => freezeCouncilTurn({ ...input, now: () => now });

describe('council turn snapshot and required-role policy', () => {
  it('uses deterministic required roles and a strict hard deadline', () => {
    expect(requiredRolesForTurn(fullTurnScope)).toEqual([
      'CaseConductor',
      'Witness',
      'Archivist',
      'Rewriter',
      'Guardian',
    ]);
    expect(requiredRolesForTurn(textOnlyTurnScope)).toEqual(['CaseConductor']);

    expect(isBeforeCouncilDeadline(11_999, 12_000)).toBe(true);
    expect(isBeforeCouncilDeadline(12_000, 12_000)).toBe(false);
    expect(isBeforeCouncilDeadline(12_001, 12_000)).toBe(false);
  });

  it('keeps the exact shared timing contract', () => {
    expect(COUNCIL_TIMING_LIMITS).toEqual({
      systemStatusTargetMs: 150,
      firstPublicTraceTargetMs: 2_500,
      requiredShardsTargetMs: 5_500,
      conductorCommitTargetMs: 7_800,
      draftTargetMs: 8_000,
      hardDeadlineMs: 12_000,
      assemblyTargetMs: 100,
    });
    expect(Object.isFrozen(COUNCIL_TIMING_LIMITS)).toBe(true);
  });

  it('freezes a representative multimodal turn with locally derived roles', async () => {
    const fixtures = await fullCouncilFixture;
    const turn = fixtures.turn;

    expect(turn.snapshot).toMatchObject({
      schemaVersion: 'cp03-council-turn/0.1',
      caseSessionId: 'case_council01',
      turnId: 'turn_council01',
      parentSceneHash: 'b'.repeat(64),
      sourceLockIds: ['source-plane'],
      inputRefs: [
        { refId: 'input_text01', inputClass: 'text' },
        { refId: 'input_image01', inputClass: 'image' },
      ],
      registryVersion: 'cp03-registry/0.1',
      registeredAssetIds: ['asset-cup01'],
      registeredSpatialBridgeIds: ['bridge-window01'],
      registeredSceneObjectIds: [
        'asset-cup01',
        'interaction-actor-a',
        'interaction-placement-a',
        'interaction-recipient-a',
      ],
      registeredAffordanceIds: ['pickup', 'place'],
      registeredRightsIds: ['rights-local-scene'],
      supportedRollbackCapabilityIds: ['rollback-transient-overlay'],
      allowedSemanticCapabilityIds: ['performRegisteredInteraction'],
      caseActionState: {
        status: 'OPEN',
        currentSceneHash: 'b'.repeat(64),
        accumulatedActions: ['Reframe'],
        terminalAction: null,
      },
      turnScope: fullTurnScope,
      requiredRoles: roleOrder,
      routingManifestVersion: 'cp03-council-routing/manifest-0.1',
      deadlineId: 'deadline_council01',
      deadlineMs: 12_000,
    });
    expect(fixtures.snapshot).toBe(turn.snapshot);
    expect(turn.snapshot.requiredRoles).toEqual(roleOrder);
    expect(turn.requiredRoles).toBe(turn.snapshot.requiredRoles);
    expect(turn.startedAtMonotonicMs).toBe(1_000);
    expect(turn.deadlineAtMonotonicMs).toBe(13_000);
    expect(Object.isFrozen(turn)).toBe(true);
    expect(Object.isFrozen(turn.snapshot)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.requiredRoles)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.sourceLockIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.registeredAssetIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.registeredSpatialBridgeIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.registeredSceneObjectIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.registeredAffordanceIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.registeredRightsIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.supportedRollbackCapabilityIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.allowedSemanticCapabilityIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.inputRefs)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.inputRefs[0])).toBe(true);
    expect(Object.isFrozen(turn.snapshot.caseActionState)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.turnScope)).toBe(true);

    expect(Object.keys(fixtures.shards)).toEqual(roleOrder);
    expect(fixtures.proposedCommit.status).toBe('PROPOSED');
    expect(fixtures.withheldGuardianShard.content.disposition).toBe('WITHHOLD');
    expect(Object.keys(scriptedDualProviderManifest.assignments)).toEqual(roleOrder);
  });

  it('binds every role shard to the computed frozen turn hash and identity', async () => {
    const fixtures = await createFullCouncilFixtures();

    expect(fixtures.snapshot).toBe(fixtures.turn.snapshot);
    for (const role of roleOrder) {
      const shard = fixtures.shards[role];
      expect(shard.snapshotHash, role).toBe(fixtures.turn.snapshotHash);
      expect(shard.caseSessionId, role).toBe(fixtures.snapshot.caseSessionId);
      expect(shard.turnId, role).toBe(fixtures.snapshot.turnId);
      expect(shard.parentSceneHash, role).toBe(fixtures.snapshot.parentSceneHash);
      expect(shard.registryVersion, role).toBe(fixtures.snapshot.registryVersion);
      expect(shard.routingManifestVersion, role)
        .toBe(fixtures.snapshot.routingManifestVersion);
      expect(shard.deadlineId, role).toBe(fixtures.snapshot.deadlineId);
    }
  });

  it('reads the monotonic epoch once and derives the deadline from the first value', async () => {
    const now = vi.fn(() => 4_000);
    now.mockReturnValueOnce(4_000).mockReturnValueOnce(99_000);

    const turn = await freezeCouncilTurn({ ...fullCouncilTurnInput, now });

    expect(now).toHaveBeenCalledTimes(1);
    expect(turn.startedAtMonotonicMs).toBe(4_000);
    expect(turn.deadlineAtMonotonicMs).toBe(16_000);
  });

  it('hashes identical JSON inputs identically and binds scene and routing versions', async () => {
    const first = await freezeAt();
    const second = await freezeAt();
    expect(second.snapshotHash).toBe(first.snapshotHash);

    const differentScene = await freezeAt({
      ...fullCouncilTurnInput,
      parentSceneHash: 'c'.repeat(64),
    });
    expect(differentScene.snapshotHash).not.toBe(first.snapshotHash);

    const differentRoutingVersion = await freezeAt({
      ...fullCouncilTurnInput,
      routingManifest: {
        ...scriptedDualProviderManifest,
        manifestVersion: 'cp03-council-routing/manifest-0.2',
      },
    });
    expect(differentRoutingVersion.snapshotHash).not.toBe(first.snapshotHash);

    const differentModelOnly = await freezeAt({
      ...fullCouncilTurnInput,
      routingManifest: {
        ...scriptedDualProviderManifest,
        assignments: {
          ...scriptedDualProviderManifest.assignments,
          CaseConductor: {
            ...scriptedDualProviderManifest.assignments.CaseConductor,
            model: 'deepseek-final-model-selected-by-task-6',
          },
        },
      },
    });
    expect(differentModelOnly.snapshotHash).toBe(first.snapshotHash);
  });

  it('includes derived roles and bounded registry, capability, rights, and rollback facts in the hash', async () => {
    const baseline = await freezeAt();
    const variants: readonly [string, TurnFacts][] = [
      ['required roles', {
        ...fullCouncilTurnInput,
        turnScope: { ...fullTurnScope, allowsSceneMutation: false },
      }],
      ['source locks', {
        ...fullCouncilTurnInput,
        sourceLockIds: [...fullCouncilTurnInput.sourceLockIds, 'source-overlay'],
      }],
      ['assets', {
        ...fullCouncilTurnInput,
        registeredAssetIds: [...fullCouncilTurnInput.registeredAssetIds, 'asset-lamp01'],
      }],
      ['spatial bridges', {
        ...fullCouncilTurnInput,
        registeredSpatialBridgeIds: [
          ...fullCouncilTurnInput.registeredSpatialBridgeIds,
          'bridge-door01',
        ],
      }],
      ['scene objects', {
        ...fullCouncilTurnInput,
        registeredSceneObjectIds: [
          ...fullCouncilTurnInput.registeredSceneObjectIds,
          'interaction-source-a',
        ],
      }],
      ['affordances', {
        ...fullCouncilTurnInput,
        registeredAffordanceIds: [
          ...fullCouncilTurnInput.registeredAffordanceIds,
          'release',
        ],
      }],
      ['rights', {
        ...fullCouncilTurnInput,
        registeredRightsIds: [...fullCouncilTurnInput.registeredRightsIds, 'rights-lamp'],
      }],
      ['rollback capabilities', {
        ...fullCouncilTurnInput,
        supportedRollbackCapabilityIds: [
          ...fullCouncilTurnInput.supportedRollbackCapabilityIds,
          'rollback-camera-state',
        ],
      }],
      ['semantic capabilities', {
        ...fullCouncilTurnInput,
        allowedSemanticCapabilityIds: [
          ...fullCouncilTurnInput.allowedSemanticCapabilityIds,
          'placeRegisteredAsset',
        ],
      }],
      ['input classes', {
        ...fullCouncilTurnInput,
        inputRefs: [
          ...fullCouncilTurnInput.inputRefs,
          { refId: 'input_text02', inputClass: 'text' as const },
        ],
      }],
      ['case session id', {
        ...fullCouncilTurnInput,
        caseSessionId: 'case_council02',
      }],
      ['turn id', {
        ...fullCouncilTurnInput,
        turnId: 'turn_council02',
      }],
      ['registry version', {
        ...fullCouncilTurnInput,
        registryVersion: 'cp03-registry/0.2',
      }],
      ['deadline id', {
        ...fullCouncilTurnInput,
        deadlineId: 'deadline_council02',
      }],
      ['same-class input reference id', {
        ...fullCouncilTurnInput,
        inputRefs: fullCouncilTurnInput.inputRefs.map((inputRef, index) =>
          index === 0
            ? { ...inputRef, refId: 'input_text02' }
            : inputRef
        ),
      }],
      ['case action state', {
        ...fullCouncilTurnInput,
        caseActionState: {
          ...fullCouncilTurnInput.caseActionState,
          accumulatedActions: ['Reframe', 'Merge'],
        },
      }],
    ];

    for (const [label, variant] of variants) {
      const changed = await freezeAt(variant);
      expect(changed.snapshotHash, label).not.toBe(baseline.snapshotHash);
    }
  });

  it('detaches caller-owned arrays before freezing the authority', async () => {
    const mutable = structuredClone(fullCouncilTurnInput) as unknown as TurnFacts;
    const turn = await freezeAt(mutable);

    (mutable.sourceLockIds as string[]).push('source-mutated-after-freeze');
    (mutable.registeredAssetIds as string[]).push('asset-mutated-after-freeze');
    (mutable.registeredSceneObjectIds as string[]).push('scene-mutated-after-freeze');
    (mutable.registeredAffordanceIds as string[]).push('affordance-mutated-after-freeze');
    (mutable.inputRefs as { refId: string; inputClass: 'text' | 'image' | 'audio' }[])
      .push({ refId: 'input-mutated-after-freeze', inputClass: 'text' });

    expect(turn.snapshot.sourceLockIds).toEqual(['source-plane']);
    expect(turn.snapshot.registeredAssetIds).toEqual(['asset-cup01']);
    expect(turn.snapshot.registeredSceneObjectIds).toEqual([
      'asset-cup01',
      'interaction-actor-a',
      'interaction-placement-a',
      'interaction-recipient-a',
    ]);
    expect(turn.snapshot.registeredAffordanceIds).toEqual(['pickup', 'place']);
    expect(turn.snapshot.inputRefs).toHaveLength(2);
  });

  it('rejects duplicate registered scene objects before reading the clock', async () => {
    const now = vi.fn(() => 1_000);
    const input = {
      ...fullCouncilTurnInput,
      registeredSceneObjectIds: [
        ...fullCouncilTurnInput.registeredSceneObjectIds,
        fullCouncilTurnInput.registeredSceneObjectIds[0]!,
      ],
      now,
    };

    await expect(freezeCouncilTurn(input)).rejects.toThrow(/duplicate.*scene object/i);
    expect(now).not.toHaveBeenCalled();
  });

  it('rejects duplicate registered affordances before reading the clock', async () => {
    const now = vi.fn(() => 1_000);
    const input = {
      ...fullCouncilTurnInput,
      registeredAffordanceIds: [
        ...fullCouncilTurnInput.registeredAffordanceIds,
        fullCouncilTurnInput.registeredAffordanceIds[0]!,
      ],
      now,
    };

    await expect(freezeCouncilTurn(input)).rejects.toThrow(/duplicate.*affordance/i);
    expect(now).not.toHaveBeenCalled();
  });
});
