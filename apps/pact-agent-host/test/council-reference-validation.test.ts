import { describe, expect, it } from 'vitest';

import {
  validateCouncilAssemblyReferences,
  validateCouncilShardReferences,
} from '../src/council-reference-validation.js';
import type {
  ArchivistShard,
  CouncilRole,
  CouncilShard,
  GuardianShard,
  RewriterShard,
  WitnessShard,
} from '../src/contract-types.js';
import {
  createFullCouncilFixtures,
} from './council-fixtures.js';

const byRole = (
  shards: Readonly<Record<CouncilRole, CouncilShard>>,
): ReadonlyMap<CouncilRole, CouncilShard> => new Map(
  Object.entries(shards) as [CouncilRole, CouncilShard][],
);

describe('shared council reference validation', () => {
  it('accepts every known reference without changing a shard', async () => {
    const fixtures = await createFullCouncilFixtures();
    for (const shard of Object.values(fixtures.shards)) {
      expect(validateCouncilShardReferences(fixtures.turn, shard)).toBe(shard);
    }
    expect(validateCouncilAssemblyReferences(
      fixtures.turn,
      byRole(fixtures.shards),
    )).toBeUndefined();
  });

  it('rejects unknown Witness and Archivist references before durability', async () => {
    const fixtures = await createFullCouncilFixtures();
    const witness = fixtures.shards.Witness as WitnessShard;
    const archivist = fixtures.shards.Archivist as ArchivistShard;
    const invalid: CouncilShard[] = [
      { ...witness, evidenceAnchors: ['input_unknown'] },
      {
        ...witness,
        content: {
          observations: [{
            ...witness.content.observations[0]!,
            inputRefIds: ['input_unknown'],
          }],
        },
      },
      {
        ...archivist,
        content: { ...archivist.content, requestedAssetIds: ['asset_unknown'] },
      },
      {
        ...archivist,
        content: {
          ...archivist.content,
          requestedSpatialBridgeIds: ['bridge_unknown'],
        },
      },
      {
        ...archivist,
        content: { ...archivist.content, provenanceAnchors: ['source_unknown'] },
      },
      {
        ...archivist,
        content: { ...archivist.content, rightsRequirements: ['rights_unknown'] },
      },
    ];
    for (const shard of invalid) {
      expect(() => validateCouncilShardReferences(fixtures.turn, shard))
        .toThrow('PACT_COUNCIL_REFERENCE_UNKNOWN');
    }
    expect(() => validateCouncilShardReferences(fixtures.turn, {
      ...archivist,
      content: { ...archivist.content, unavailableRefs: ['asset_missing'] },
    })).toThrow('PACT_COUNCIL_REFERENCE_UNAVAILABLE');
  });

  it('rejects unregistered capability, object, affordance, and effect references', async () => {
    const fixtures = await createFullCouncilFixtures();
    const rewriter = fixtures.shards.Rewriter as RewriterShard;
    const call = rewriter.content.semanticCapabilityCalls[0]!;
    const invalid: CouncilShard[] = [
      {
        ...rewriter,
        content: {
          ...rewriter.content,
          semanticCapabilityCalls: [{
            ...call,
            arguments: { ...call.arguments, actorId: 'actor_unknown' },
          }],
        },
      },
      {
        ...rewriter,
        content: {
          ...rewriter.content,
          semanticCapabilityCalls: [{
            ...call,
            arguments: { ...call.arguments, affordance: 'teleport' },
          }],
        },
      },
    ];
    for (const shard of invalid) {
      expect(() => validateCouncilShardReferences(fixtures.turn, shard))
        .toThrow('PACT_COUNCIL_REFERENCE_UNKNOWN');
    }
    expect(() => validateCouncilShardReferences(fixtures.turn, {
      ...rewriter,
      content: { ...rewriter.content, expectedChanges: ['asset-cup01'] },
    })).toThrow('PACT_COUNCIL_EXPECTED_CHANGES_MISMATCH');

    const turnWithoutCapability = {
      ...fixtures.turn,
      snapshot: {
        ...fixtures.turn.snapshot,
        allowedSemanticCapabilityIds: [],
      },
    };
    expect(() => validateCouncilShardReferences(turnWithoutCapability, rewriter))
      .toThrow('PACT_COUNCIL_REFERENCE_UNKNOWN');
  });

  it('rejects unknown Guardian registries before durability and cross-shard evidence later', async () => {
    const fixtures = await createFullCouncilFixtures();
    const guardian = fixtures.shards.Guardian as GuardianShard;
    for (const content of [
      { ...guardian.content, requiredSourceLockIds: ['source_unknown'] },
      { ...guardian.content, requiredRightsIds: ['rights_unknown'] },
      { ...guardian.content, requiredRollbackCapabilityIds: ['rollback_unknown'] },
    ] as readonly GuardianShard['content'][]) {
      expect(() => validateCouncilShardReferences(fixtures.turn, {
        ...guardian,
        content,
      })).toThrow('PACT_COUNCIL_REFERENCE_UNKNOWN');
    }

    const unknownObservationGuardian: GuardianShard = {
      ...guardian,
      content: {
        ...guardian.content,
        contestedEvidenceIds: ['observation_missing01'],
      },
    };
    expect(validateCouncilShardReferences(
      fixtures.turn,
      unknownObservationGuardian,
    )).toBe(unknownObservationGuardian);
    expect(validateCouncilAssemblyReferences(fixtures.turn, byRole({
      ...fixtures.shards,
      Guardian: unknownObservationGuardian,
    }))).toEqual({
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_CONTESTED_EVIDENCE_UNKNOWN'],
    });
  });
});
