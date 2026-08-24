import type {
  CouncilRole,
  CouncilShard,
} from './contract-types.js';
import type { FrozenCouncilTurn } from './council-turn.js';

export interface AllowedCouncilReferences {
  readonly registeredAssetIds: readonly string[];
  readonly registeredSpatialBridgeIds: readonly string[];
  readonly registeredRightsIds: readonly string[];
  readonly registeredSceneObjectIds: readonly string[];
  readonly registeredAffordanceIds: readonly string[];
  readonly supportedRollbackCapabilityIds: readonly string[];
  readonly allowedSemanticCapabilityIds: readonly string[];
  readonly sourceLockIds: readonly string[];
  readonly inputRefIds: readonly string[];
}

const frozenList = (values: readonly string[]): readonly string[] =>
  Object.freeze([...values]);

export const allowedCouncilReferences = (
  turn: FrozenCouncilTurn,
): AllowedCouncilReferences => Object.freeze({
  registeredAssetIds: frozenList(turn.snapshot.registeredAssetIds),
  registeredSpatialBridgeIds: frozenList(
    turn.snapshot.registeredSpatialBridgeIds,
  ),
  registeredRightsIds: frozenList(turn.snapshot.registeredRightsIds),
  registeredSceneObjectIds: frozenList(turn.snapshot.registeredSceneObjectIds),
  registeredAffordanceIds: frozenList(turn.snapshot.registeredAffordanceIds),
  supportedRollbackCapabilityIds: frozenList(
    turn.snapshot.supportedRollbackCapabilityIds,
  ),
  allowedSemanticCapabilityIds: frozenList(
    turn.snapshot.allowedSemanticCapabilityIds,
  ),
  sourceLockIds: frozenList(turn.snapshot.sourceLockIds),
  inputRefIds: frozenList(turn.snapshot.inputRefs.map(({ refId }) => refId)),
});

export type CouncilReferenceErrorCode =
  | 'PACT_COUNCIL_REFERENCE_UNKNOWN'
  | 'PACT_COUNCIL_REFERENCE_UNAVAILABLE'
  | 'PACT_COUNCIL_EXPECTED_CHANGES_MISMATCH';

export class CouncilReferenceValidationError extends Error {
  constructor(readonly code: CouncilReferenceErrorCode) {
    super(code);
    this.name = 'CouncilReferenceValidationError';
  }
}

export interface CouncilAssemblyReferenceFailure {
  readonly status: 'FAILED_NO_MUTATION' | 'NEEDS_CLARIFICATION';
  readonly reasonCodes: readonly string[];
}

const hasDuplicates = <T>(values: readonly T[]): boolean =>
  new Set(values).size !== values.length;

const hasEvery = (
  required: readonly string[],
  available: ReadonlySet<string>,
): boolean => required.every((value) => available.has(value));

const sortedUnique = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const exactStringSet = (
  actual: readonly string[],
  expected: readonly string[],
): boolean => {
  const actualSorted = sortedUnique(actual);
  const expectedSorted = sortedUnique(expected);
  return actualSorted.length === expectedSorted.length &&
    actualSorted.every((value, index) => value === expectedSorted[index]);
};

const isStableReference = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);

const isCrossShardObservationReference = (value: string): boolean =>
  /^observation_[A-Za-z0-9_-]{8,80}$/.test(value);

const unknown = (): never => {
  throw new CouncilReferenceValidationError('PACT_COUNCIL_REFERENCE_UNKNOWN');
};

const unavailable = (): never => {
  throw new CouncilReferenceValidationError(
    'PACT_COUNCIL_REFERENCE_UNAVAILABLE',
  );
};

export const validateCouncilShardReferences = <T extends CouncilShard>(
  turn: FrozenCouncilTurn,
  shard: T,
): T => {
  const snapshot = turn.snapshot;
  const inputRefIds = new Set(snapshot.inputRefs.map(({ refId }) => refId));
  const assetIds = new Set(snapshot.registeredAssetIds);
  const spatialBridgeIds = new Set(snapshot.registeredSpatialBridgeIds);
  const rightsIds = new Set(snapshot.registeredRightsIds);
  const sourceLockIds = new Set(snapshot.sourceLockIds);
  const sceneObjectIds = new Set(snapshot.registeredSceneObjectIds);
  const affordanceIds = new Set(snapshot.registeredAffordanceIds);
  const rollbackIds = new Set(snapshot.supportedRollbackCapabilityIds);
  const semanticCapabilityIds = new Set(snapshot.allowedSemanticCapabilityIds);
  const allFrozenReferences = new Set([
    ...inputRefIds,
    ...assetIds,
    ...spatialBridgeIds,
    ...rightsIds,
    ...sourceLockIds,
    ...sceneObjectIds,
    ...affordanceIds,
    ...rollbackIds,
    ...semanticCapabilityIds,
  ]);
  if (!hasEvery(shard.evidenceAnchors, allFrozenReferences)) unknown();

  switch (shard.kind) {
    case 'CONDUCTOR_INTENT':
      return shard;
    case 'WITNESS':
      if (
        !hasEvery(shard.evidenceAnchors, inputRefIds) ||
        shard.content.observations.some(({ inputRefIds: refs }) =>
          !hasEvery(refs, inputRefIds))
      ) unknown();
      return shard;
    case 'ARCHIVIST': {
      const knownMaterialRefs = new Set([
        ...assetIds,
        ...spatialBridgeIds,
        ...rightsIds,
        ...inputRefIds,
        ...sourceLockIds,
      ]);
      if (
        !hasEvery(shard.content.requestedAssetIds, assetIds) ||
        !hasEvery(shard.content.requestedSpatialBridgeIds, spatialBridgeIds) ||
        !hasEvery(shard.content.provenanceAnchors, knownMaterialRefs) ||
        !hasEvery(shard.content.rightsRequirements, rightsIds)
      ) unknown();
      if (shard.content.unavailableRefs.length > 0) unavailable();
      return shard;
    }
    case 'REWRITER': {
      const affectedObjectIds = new Set<string>();
      for (const call of shard.content.semanticCapabilityCalls) {
        if (!semanticCapabilityIds.has(call.capability)) unknown();
        const objectIds = [
          call.arguments.actorId,
          call.arguments.targetId,
          ...(call.arguments.recipientId === undefined
            ? []
            : [call.arguments.recipientId]),
          ...(call.arguments.placementTargetId === undefined
            ? []
            : [call.arguments.placementTargetId]),
        ];
        if (
          !affordanceIds.has(call.arguments.affordance) ||
          objectIds.some((objectId) => !sceneObjectIds.has(objectId))
        ) unknown();
        for (const objectId of objectIds) affectedObjectIds.add(objectId);
      }
      if (!exactStringSet(
        shard.content.expectedChanges,
        [...affectedObjectIds],
      )) {
        throw new CouncilReferenceValidationError(
          'PACT_COUNCIL_EXPECTED_CHANGES_MISMATCH',
        );
      }
      return shard;
    }
    case 'GUARDIAN': {
      if (
        !hasEvery(shard.content.requiredSourceLockIds, sourceLockIds) ||
        !hasEvery(shard.content.requiredRightsIds, rightsIds) ||
        !hasEvery(shard.content.requiredRollbackCapabilityIds, rollbackIds)
      ) unknown();
      const localOrCrossShardEvidence = (value: string): boolean =>
        inputRefIds.has(value) || isCrossShardObservationReference(value);
      if (
        shard.content.contestedEvidenceIds.some((value) =>
          !localOrCrossShardEvidence(value)) ||
        shard.content.requiredDissentRecords.some(({ evidenceIds }) =>
          evidenceIds.some((value) => !localOrCrossShardEvidence(value)))
      ) unknown();
      return shard;
    }
  }
};

export const validateCouncilAssemblyReferences = (
  turn: FrozenCouncilTurn,
  byRole: ReadonlyMap<CouncilRole, CouncilShard>,
): CouncilAssemblyReferenceFailure | undefined => {
  const witness = byRole.get('Witness');
  const archivist = byRole.get('Archivist');
  const rewriter = byRole.get('Rewriter');
  const guardian = byRole.get('Guardian');
  if (
    witness?.kind !== 'WITNESS' ||
    archivist?.kind !== 'ARCHIVIST' ||
    rewriter?.kind !== 'REWRITER' ||
    guardian?.kind !== 'GUARDIAN'
  ) {
    return {
      status: 'FAILED_NO_MUTATION',
      reasonCodes: ['ASSEMBLY_REQUIRED_ROLE_MISSING'],
    };
  }

  const registeredAssetIds = new Set(turn.snapshot.registeredAssetIds);
  const registeredSpatialBridgeIds = new Set(
    turn.snapshot.registeredSpatialBridgeIds,
  );
  const registeredRightsIds = new Set(turn.snapshot.registeredRightsIds);
  const inputRefIds = new Set(turn.snapshot.inputRefs.map(({ refId }) => refId));
  const sourceLockIds = new Set(turn.snapshot.sourceLockIds);
  const registeredSceneObjectIds = new Set(turn.snapshot.registeredSceneObjectIds);
  const registeredAffordanceIds = new Set(turn.snapshot.registeredAffordanceIds);
  const knownMaterialRefs = new Set([
    ...registeredAssetIds,
    ...registeredSpatialBridgeIds,
    ...registeredRightsIds,
    ...inputRefIds,
    ...sourceLockIds,
  ]);
  if (
    !hasEvery(archivist.content.requestedAssetIds, registeredAssetIds) ||
    !hasEvery(
      archivist.content.requestedSpatialBridgeIds,
      registeredSpatialBridgeIds,
    ) ||
    !hasEvery(archivist.content.rightsRequirements, registeredRightsIds) ||
    !hasEvery(archivist.content.provenanceAnchors, knownMaterialRefs)
  ) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_REFERENCE_UNKNOWN'],
    };
  }
  if (archivist.content.unavailableRefs.length > 0) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_REFERENCE_UNAVAILABLE'],
    };
  }

  const allowedCapabilityIds = new Set(
    turn.snapshot.allowedSemanticCapabilityIds,
  );
  const affectedObjectIds = new Set<string>();
  for (const call of rewriter.content.semanticCapabilityCalls) {
    if (!allowedCapabilityIds.has(call.capability)) {
      return {
        status: 'NEEDS_CLARIFICATION',
        reasonCodes: ['ASSEMBLY_CAPABILITY_REFERENCE_UNKNOWN'],
      };
    }
    if (
      !isStableReference(call.arguments.actorId) ||
      !isStableReference(call.arguments.targetId) ||
      !isStableReference(call.arguments.affordance) ||
      (call.arguments.recipientId !== undefined &&
        !isStableReference(call.arguments.recipientId)) ||
      (call.arguments.placementTargetId !== undefined &&
        !isStableReference(call.arguments.placementTargetId))
    ) {
      return {
        status: 'FAILED_NO_MUTATION',
        reasonCodes: ['ASSEMBLY_CAPABILITY_ARGUMENT_INVALID'],
      };
    }
    if (!registeredAffordanceIds.has(call.arguments.affordance)) {
      return {
        status: 'NEEDS_CLARIFICATION',
        reasonCodes: ['ASSEMBLY_AFFORDANCE_REFERENCE_UNKNOWN'],
      };
    }
    const objectIds = [
      call.arguments.actorId,
      call.arguments.targetId,
      ...(call.arguments.recipientId === undefined
        ? []
        : [call.arguments.recipientId]),
      ...(call.arguments.placementTargetId === undefined
        ? []
        : [call.arguments.placementTargetId]),
    ];
    if (objectIds.some((objectId) => !registeredSceneObjectIds.has(objectId))) {
      return {
        status: 'NEEDS_CLARIFICATION',
        reasonCodes: ['ASSEMBLY_SCENE_OBJECT_REFERENCE_UNKNOWN'],
      };
    }
    for (const objectId of objectIds) affectedObjectIds.add(objectId);
  }

  if (!exactStringSet(rewriter.content.expectedChanges, [...affectedObjectIds])) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_EXPECTED_CHANGES_MISMATCH'],
    };
  }

  const witnessObservationIds = witness.content.observations.map(
    ({ observationId }) => observationId,
  );
  if (hasDuplicates(witnessObservationIds)) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_WITNESS_OBSERVATION_DUPLICATE'],
    };
  }
  if (witness.content.observations.some(({ inputRefIds: refs }) =>
    !hasEvery(refs, inputRefIds))) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_WITNESS_OBSERVATION_INPUT_UNKNOWN'],
    };
  }
  if (!hasEvery(witness.evidenceAnchors, inputRefIds)) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_WITNESS_EVIDENCE_ANCHOR_UNKNOWN'],
    };
  }
  const dissentEvidenceRefs = new Set([
    ...inputRefIds,
    ...witnessObservationIds,
  ]);
  if (!hasEvery(guardian.content.contestedEvidenceIds, dissentEvidenceRefs)) {
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCodes: ['ASSEMBLY_CONTESTED_EVIDENCE_UNKNOWN'],
    };
  }
  for (const record of guardian.content.requiredDissentRecords) {
    if (!hasEvery(record.evidenceIds, dissentEvidenceRefs)) {
      return {
        status: 'NEEDS_CLARIFICATION',
        reasonCodes: ['ASSEMBLY_DISSENT_EVIDENCE_UNKNOWN'],
      };
    }
  }
  return undefined;
};
