import { describe, expect, it } from 'vitest';

import {
  COUNCIL_TIMING_LIMITS,
  freezeCouncilTurn,
  isBeforeCouncilDeadline,
  requiredRolesForTurn,
  type FreezeCouncilTurnInput,
} from '../src/council-turn.js';
import {
  fullCouncilShards,
  fullCouncilSnapshot,
  fullCouncilTurnInput,
  fullTurnScope,
  proposedCouncilCommit,
  roleOrder,
  scriptedDualProviderManifest,
  textOnlyTurnScope,
  withheldGuardianShard,
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
    const turn = await freezeAt();

    expect(turn.snapshot).toMatchObject({
      ...fullCouncilSnapshot,
      deadlineMs: 12_000,
    });
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
    expect(Object.isFrozen(turn.snapshot.registeredRightsIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.supportedRollbackCapabilityIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.allowedSemanticCapabilityIds)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.inputRefs)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.inputRefs[0])).toBe(true);
    expect(Object.isFrozen(turn.snapshot.caseActionState)).toBe(true);
    expect(Object.isFrozen(turn.snapshot.turnScope)).toBe(true);

    expect(Object.keys(fullCouncilShards)).toEqual(roleOrder);
    expect(proposedCouncilCommit.status).toBe('PROPOSED');
    expect(withheldGuardianShard.content.disposition).toBe('WITHHOLD');
    expect(Object.keys(scriptedDualProviderManifest.assignments)).toEqual(roleOrder);
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
    (mutable.inputRefs as { refId: string; inputClass: 'text' | 'image' | 'audio' }[])
      .push({ refId: 'input-mutated-after-freeze', inputClass: 'text' });

    expect(turn.snapshot.sourceLockIds).toEqual(['source-plane']);
    expect(turn.snapshot.registeredAssetIds).toEqual(['asset-cup01']);
    expect(turn.snapshot.inputRefs).toHaveLength(2);
  });
});
