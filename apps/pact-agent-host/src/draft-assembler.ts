import {
  sha256Canonical,
  validateAgentActionDraft,
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';
import type {
  AgentActionDraft,
  CouncilRole,
  CouncilShard,
  ConductorDraftCommit,
  GuardianShard,
} from './contract-types.js';
import {
  type CouncilProposalSnapshot,
} from './council-registry.js';
import {
  evaluateGuardianConflict,
  type GuardianConflictResult,
} from './guardian-conflict.js';
import type { FrozenCouncilTurn } from './council-turn.js';

export type AssembleCouncilDraftResult =
  | {
      readonly status: 'ASSEMBLED';
      readonly draft: AgentActionDraft;
      readonly draftHash: string;
      readonly assemblyLatencyMs: number;
    }
  | {
      readonly status:
        | 'NEEDS_CLARIFICATION'
        | 'WITHHELD'
        | 'FAILED_NO_MUTATION';
      readonly reasonCodes: readonly string[];
      readonly assemblyLatencyMs: number;
    };

export interface AssembleCouncilDraftInput {
  readonly turn: FrozenCouncilTurn;
  readonly proposal: CouncilProposalSnapshot;
  readonly now: () => number;
}

const ROLE_ORDER: readonly CouncilRole[] = [
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
];

const EXECUTABLE_RUNTIME_ROLES: readonly CouncilRole[] = ROLE_ORDER;

const FAIL = 'FAILED_NO_MUTATION' as const;
const NEEDS = 'NEEDS_CLARIFICATION' as const;
const WITHHELD = 'WITHHELD' as const;

interface SelectedShard {
  readonly shard: CouncilShard;
  readonly payloadHash: string;
  readonly acceptanceSequence: number;
}

interface ValidatedAssemblyInput {
  readonly turn: FrozenCouncilTurn;
  readonly proposal: CouncilProposalSnapshot;
  readonly commit: ConductorDraftCommit;
  readonly commitHash: string;
  readonly selected: readonly SelectedShard[];
  readonly byRole: ReadonlyMap<CouncilRole, CouncilShard>;
  readonly guardian: GuardianShard;
}

interface ValidationFailure {
  readonly status: typeof FAIL | typeof NEEDS | typeof WITHHELD;
  readonly reasonCodes: readonly string[];
}

type ValidationResult =
  | { readonly ok: true; readonly value: ValidatedAssemblyInput }
  | { readonly ok: false; readonly failure: ValidationFailure };

const failure = (
  status: ValidationFailure['status'],
  reasonCodes: readonly string[],
  assemblyLatencyMs = 0,
): AssembleCouncilDraftResult => ({
  status,
  reasonCodes: [...new Set(reasonCodes)],
  assemblyLatencyMs,
});

const validationFailure = (
  reasonCode: string,
  status: ValidationFailure['status'] = FAIL,
): ValidationResult => ({
  ok: false,
  failure: { status, reasonCodes: [reasonCode] },
});

const safeHash = async (value: unknown): Promise<string | undefined> => {
  try {
    return await sha256Canonical(value);
  } catch {
    return undefined;
  }
};

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

const actionTerminal = (
  actionSequence: readonly string[],
): 'Continue' | 'KeepOpaque' | null => {
  const terminalActions = actionSequence.filter(
    (action): action is 'Continue' | 'KeepOpaque' =>
      action === 'Continue' || action === 'KeepOpaque',
  );
  return terminalActions.at(-1) ?? null;
};

const matchesTurn = (
  shard: CouncilShard,
  turn: FrozenCouncilTurn,
): boolean =>
  shard.caseSessionId === turn.snapshot.caseSessionId &&
  shard.turnId === turn.snapshot.turnId &&
  shard.snapshotHash === turn.snapshotHash &&
  shard.parentSceneHash === turn.snapshot.parentSceneHash &&
  shard.registryVersion === turn.snapshot.registryVersion &&
  shard.routingManifestVersion === turn.snapshot.routingManifestVersion &&
  shard.deadlineId === turn.snapshot.deadlineId;

const mapByRole = (
  selected: readonly SelectedShard[],
): ReadonlyMap<CouncilRole, CouncilShard> => {
  const byRole = new Map<CouncilRole, CouncilShard>();
  for (const entry of selected) byRole.set(entry.shard.role, entry.shard);
  return byRole;
};

const selectedInStableRoleOrder = (
  selected: readonly SelectedShard[],
): readonly SelectedShard[] => [...selected].sort((left, right) => {
  const leftRole = ROLE_ORDER.indexOf(left.shard.role);
  const rightRole = ROLE_ORDER.indexOf(right.shard.role);
  return leftRole - rightRole ||
    left.acceptanceSequence - right.acceptanceSequence ||
    left.payloadHash.localeCompare(right.payloadHash);
});

const selectedDissentRecords = (
  commit: ConductorDraftCommit,
  guardian: GuardianShard,
): readonly GuardianShard['content']['requiredDissentRecords'][number][] => {
  const records = new Map(
    guardian.content.requiredDissentRecords.map((record) => [record.dissentId, record]),
  );
  return commit.selectedDissentIds.map((dissentId) => records.get(dissentId)!);
};

const isStableReference = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);

const validateReferences = (
  turn: FrozenCouncilTurn,
  byRole: ReadonlyMap<CouncilRole, CouncilShard>,
): ValidationFailure | undefined => {
  const archivist = byRole.get('Archivist');
  const rewriter = byRole.get('Rewriter');
  const guardian = byRole.get('Guardian');
  if (
    archivist?.kind !== 'ARCHIVIST' ||
    rewriter?.kind !== 'REWRITER' ||
    guardian?.kind !== 'GUARDIAN'
  ) {
    return {
      status: FAIL,
      reasonCodes: ['ASSEMBLY_REQUIRED_ROLE_MISSING'],
    };
  }

  const registeredAssetIds = new Set(turn.snapshot.registeredAssetIds);
  const registeredSpatialBridgeIds = new Set(
    turn.snapshot.registeredSpatialBridgeIds,
  );
  const registeredRightsIds = new Set(turn.snapshot.registeredRightsIds);
  const inputRefIds = new Set(turn.snapshot.inputRefs.map((inputRef) => inputRef.refId));
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
    !hasEvery(archivist.content.requestedSpatialBridgeIds, registeredSpatialBridgeIds) ||
    !hasEvery(archivist.content.rightsRequirements, registeredRightsIds) ||
    !hasEvery(archivist.content.provenanceAnchors, knownMaterialRefs)
  ) {
    return {
      status: NEEDS,
      reasonCodes: ['ASSEMBLY_REFERENCE_UNKNOWN'],
    };
  }
  if (archivist.content.unavailableRefs.length > 0) {
    return {
      status: NEEDS,
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
        status: NEEDS,
        reasonCodes: ['ASSEMBLY_CAPABILITY_REFERENCE_UNKNOWN'],
      };
    }
    if (!isStableReference(call.arguments.actorId) ||
      !isStableReference(call.arguments.targetId) ||
      !isStableReference(call.arguments.affordance) ||
      (call.arguments.recipientId !== undefined &&
        !isStableReference(call.arguments.recipientId)) ||
      (call.arguments.placementTargetId !== undefined &&
        !isStableReference(call.arguments.placementTargetId))) {
      return {
        status: FAIL,
        reasonCodes: ['ASSEMBLY_CAPABILITY_ARGUMENT_INVALID'],
      };
    }
    if (!registeredAffordanceIds.has(call.arguments.affordance)) {
      return {
        status: NEEDS,
        reasonCodes: ['ASSEMBLY_AFFORDANCE_REFERENCE_UNKNOWN'],
      };
    }
    const objectIds = [
      call.arguments.actorId,
      call.arguments.targetId,
      ...(call.arguments.recipientId === undefined ? [] : [call.arguments.recipientId]),
      ...(call.arguments.placementTargetId === undefined
        ? []
        : [call.arguments.placementTargetId]),
    ];
    if (objectIds.some((objectId) => !registeredSceneObjectIds.has(objectId))) {
      return {
        status: NEEDS,
        reasonCodes: ['ASSEMBLY_SCENE_OBJECT_REFERENCE_UNKNOWN'],
      };
    }
    for (const objectId of objectIds) affectedObjectIds.add(objectId);
  }

  if (!exactStringSet(rewriter.content.expectedChanges, [...affectedObjectIds])) {
    return {
      status: NEEDS,
      reasonCodes: ['ASSEMBLY_EXPECTED_CHANGES_MISMATCH'],
    };
  }

  const witness = byRole.get('Witness');
  const witnessEvidenceIds = new Set(
    witness?.kind === 'WITNESS'
      ? witness.content.observations.map((observation) => observation.observationId)
      : [],
  );
  const dissentEvidenceRefs = new Set([
    ...inputRefIds,
    ...witnessEvidenceIds,
  ]);
  for (const record of guardian.content.requiredDissentRecords) {
    if (!hasEvery(record.evidenceIds, dissentEvidenceRefs)) {
      return {
        status: NEEDS,
        reasonCodes: ['ASSEMBLY_DISSENT_EVIDENCE_UNKNOWN'],
      };
    }
  }
  return undefined;
};

const validateDissentSelection = (
  commit: ConductorDraftCommit,
  guardian: GuardianShard,
): ValidationFailure | undefined => {
  if (hasDuplicates(commit.selectedDissentIds)) {
    return {
      status: FAIL,
      reasonCodes: ['ASSEMBLY_DUPLICATE_DISSENT_ID'],
    };
  }
  if (hasDuplicates(guardian.content.requiredDissentRecords.map((record) => record.dissentId))) {
    return {
      status: FAIL,
      reasonCodes: ['ASSEMBLY_DUPLICATE_DISSENT_ID'],
    };
  }
  const records = new Map(
    guardian.content.requiredDissentRecords.map((record) => [record.dissentId, record]),
  );
  if (commit.selectedDissentIds.some((dissentId) => !records.has(dissentId))) {
    return {
      status: NEEDS,
      reasonCodes: ['GUARDIAN_DISSENT_UNKNOWN'],
    };
  }
  const requiredRecords = guardian.content.requiredDissentRecords.filter(
    (record) => (record as unknown as { readonly required?: boolean }).required !== false,
  );
  if (requiredRecords.some((record) => !commit.selectedDissentIds.includes(record.dissentId))) {
    return {
      status: NEEDS,
      reasonCodes: ['GUARDIAN_REQUIRED_DISSENT_MISSING'],
    };
  }
  return undefined;
};

const validateBeforeAssembly = async (
  input: AssembleCouncilDraftInput,
): Promise<ValidationResult> => {
  const { turn, proposal } = input;
  const snapshotHash = await safeHash(turn.snapshot);
  const proposalSnapshotHash = await safeHash(proposal.turn.snapshot);
  const turnHash = await safeHash(turn);
  const proposalTurnHash = await safeHash(proposal.turn);
  if (
    snapshotHash === undefined ||
    proposalSnapshotHash === undefined ||
    turnHash === undefined ||
    proposalTurnHash === undefined ||
    snapshotHash !== turn.snapshotHash ||
    proposalSnapshotHash !== turn.snapshotHash ||
    turnHash !== proposalTurnHash ||
    proposal.turn.snapshotHash !== turn.snapshotHash
  ) {
    return validationFailure('ASSEMBLY_SNAPSHOT_HASH_MISMATCH');
  }
  if (
    turn.snapshot.caseActionState.currentSceneHash !== turn.snapshot.parentSceneHash ||
    turn.snapshot.caseActionState.status !== 'OPEN' ||
    turn.snapshot.caseActionState.terminalAction !== null
  ) {
    return validationFailure('ASSEMBLY_PARENT_SCENE_STALE');
  }
  if (!proposal.selectionBarrierClosed) {
    return validationFailure('ASSEMBLY_SELECTION_BARRIER_OPEN');
  }
  if (hasDuplicates(turn.requiredRoles) ||
    turn.requiredRoles.length !== turn.snapshot.requiredRoles.length ||
    turn.requiredRoles.some((role, index) => role !== turn.snapshot.requiredRoles[index])) {
    return validationFailure('ASSEMBLY_REQUIRED_ROLE_POLICY_MISMATCH');
  }

  const durableCommit = proposal.durableCommit;
  if (durableCommit === null) {
    return validationFailure('ASSEMBLY_COMMIT_MISSING');
  }
  let commit: ConductorDraftCommit;
  try {
    commit = validateConductorDraftCommit(durableCommit.commit);
  } catch {
    return validationFailure('ASSEMBLY_COMMIT_INVALID');
  }
  const computedCommitHash = await safeHash(commit);
  if (computedCommitHash === undefined || computedCommitHash !== durableCommit.payloadHash) {
    return validationFailure('ASSEMBLY_COMMIT_HASH_MISMATCH');
  }
  if (commit.turnId !== turn.snapshot.turnId) {
    return validationFailure('ASSEMBLY_COMMIT_TURN_MISMATCH');
  }
  if (hasDuplicates(commit.selectedShardHashes) || commit.selectedShardHashes.length === 0) {
    return validationFailure('ASSEMBLY_DUPLICATE_SELECTED_HASH');
  }

  if (!Array.isArray(proposal.durableShards) || proposal.durableShards.some((entry) =>
    entry === null || typeof entry !== 'object' ||
    entry.shard === null || typeof entry.shard !== 'object')) {
    return validationFailure('ASSEMBLY_SHARD_INVALID');
  }
  const allPayloadHashes = proposal.durableShards.map((entry) => entry.payloadHash);
  const allShardIds = proposal.durableShards.map((entry) => entry.shard.shardId);
  const allRoles = proposal.durableShards.map((entry) => entry.shard.role);
  if (hasDuplicates(allPayloadHashes) || hasDuplicates(allShardIds) || hasDuplicates(allRoles)) {
    return validationFailure('ASSEMBLY_DUPLICATE_DURABLE_SHARD');
  }
  const selected: SelectedShard[] = [];
  for (const payloadHash of commit.selectedShardHashes) {
    const matches = proposal.durableShards.filter((entry) => entry.payloadHash === payloadHash);
    if (matches.length !== 1) {
      return validationFailure('ASSEMBLY_SELECTED_SHARD_MISSING');
    }
    const entry = matches[0]!;
    const computedShardHash = await safeHash(entry.shard);
    if (computedShardHash === undefined || computedShardHash !== entry.payloadHash) {
      return validationFailure('ASSEMBLY_SHARD_HASH_MISMATCH');
    }
    if (!matchesTurn(entry.shard, turn)) {
      return validationFailure('ASSEMBLY_SHARD_SNAPSHOT_MISMATCH');
    }
    selected.push(entry);
  }
  for (const entry of selected) {
    try {
      validateCouncilShard(entry.shard);
    } catch {
      return validationFailure('ASSEMBLY_SHARD_INVALID');
    }
  }
  const selectedRoles = selected.map((entry) => entry.shard.role);
  if (hasDuplicates(selectedRoles)) {
    return validationFailure('ASSEMBLY_DUPLICATE_SELECTED_ROLE');
  }
  if (turn.requiredRoles.some((role) => !selectedRoles.includes(role))) {
    return validationFailure('ASSEMBLY_REQUIRED_ROLE_MISSING');
  }

  const byRole = mapByRole(selected);
  const conductor = byRole.get('CaseConductor');
  const rewriter = byRole.get('Rewriter');
  const guardian = byRole.get('Guardian');
  if (conductor?.kind !== 'CONDUCTOR_INTENT') {
    return validationFailure('ASSEMBLY_REQUIRED_ROLE_MISSING');
  }

  const commitTerminal = actionTerminal(commit.actionSequence);
  if (
    commit.terminalIntent !== commitTerminal ||
    conductor.content.terminalIntent !== commitTerminal
  ) {
    return validationFailure('ASSEMBLY_TERMINAL_INTENT_MISMATCH');
  }
  if (commit.status === 'WITHHELD') {
    return {
      ok: false,
      failure: { status: WITHHELD, reasonCodes: ['CONDUCTOR_WITHHELD'] },
    };
  }
  if (commit.status === 'NEEDS_CLARIFICATION') {
    return {
      ok: false,
      failure: { status: NEEDS, reasonCodes: ['CONDUCTOR_NEEDS_CLARIFICATION'] },
    };
  }

  if (!EXECUTABLE_RUNTIME_ROLES.every((role) => turn.requiredRoles.includes(role))) {
    return {
      ok: false,
      failure: {
        status: NEEDS,
        reasonCodes: ['ASSEMBLY_EXECUTABLE_BOUNDARY_REQUIRES_FULL_COUNCIL'],
      },
    };
  }
  if (
    guardian?.kind !== 'GUARDIAN' ||
    rewriter?.kind !== 'REWRITER' ||
    byRole.get('Witness')?.kind !== 'WITNESS'
  ) {
    return validationFailure('ASSEMBLY_REQUIRED_ROLE_MISSING');
  }

  const dissentFailure = validateDissentSelection(commit, guardian);
  if (dissentFailure !== undefined) {
    return { ok: false, failure: dissentFailure };
  }
  const referenceFailure = validateReferences(turn, byRole);
  if (referenceFailure !== undefined) {
    return { ok: false, failure: referenceFailure };
  }
  const guardianResult: GuardianConflictResult = evaluateGuardianConflict({
    turn,
    proposal,
  });
  if (guardianResult.status !== 'ALLOW') {
    return {
      ok: false,
      failure: {
        status: guardianResult.status === 'WITHHELD' ? WITHHELD : NEEDS,
        reasonCodes: guardianResult.reasonCodes,
      },
    };
  }
  return {
    ok: true,
    value: {
      turn,
      proposal,
      commit,
      commitHash: durableCommit.payloadHash,
      selected,
      byRole,
      guardian,
    },
  };
};

const buildDraft = async (
  validated: ValidatedAssemblyInput,
): Promise<AgentActionDraft> => {
  const { turn, commit, commitHash, selected, byRole, guardian } = validated;
  const conductor = byRole.get('CaseConductor');
  const witness = byRole.get('Witness');
  const archivist = byRole.get('Archivist');
  const rewriter = byRole.get('Rewriter');
  if (
    conductor?.kind !== 'CONDUCTOR_INTENT' ||
    witness?.kind !== 'WITNESS' ||
    archivist?.kind !== 'ARCHIVIST' ||
    rewriter?.kind !== 'REWRITER'
  ) {
    throw new Error('ASSEMBLY_REQUIRED_ROLE_MISSING');
  }
  const draftIdentityHash = await sha256Canonical({
    snapshotHash: turn.snapshotHash,
    commitHash,
  });
  const orderedSelected = selectedInStableRoleOrder(selected);
  const contributions = orderedSelected.map((entry) => ({
    role: entry.shard.role,
    childSessionId: entry.shard.childSessionId,
    contributionHash: entry.payloadHash,
  }));
  const draft: AgentActionDraft = {
    identity: {
      draftId: `draft_${draftIdentityHash}`,
      schemaVersion: 'cp03-runtime/0.1',
      caseSessionId: turn.snapshot.caseSessionId,
      turnId: turn.snapshot.turnId,
      parentSceneHash: turn.snapshot.parentSceneHash,
    },
    decision: {
      status: 'PROPOSED',
      actionSequence: [...commit.actionSequence],
    },
    creative: {
      interpretation: conductor.content.initialInterpretation,
      unresolvedAmbiguities: [...rewriter.content.unresolvedAmbiguities],
      spatialIntent: rewriter.content.spatialIntent,
      visualIntent: rewriter.content.visualIntent,
      cameraIntent: rewriter.content.cameraIntent,
      lightIntent: rewriter.content.lightIntent,
      soundIntent: rewriter.content.soundIntent,
      publicPoeticText: rewriter.content.publicPoeticText,
      seamsAndContradictionsToPreserve: [
        ...rewriter.content.seamsAndContradictionsToPreserve,
      ],
    },
    materials: {
      requestedAssetIds: [...archivist.content.requestedAssetIds],
      requestedSpatialBridgeIds: [...archivist.content.requestedSpatialBridgeIds],
      provenanceAnchors: [...archivist.content.provenanceAnchors],
      rightsRequirements: [...archivist.content.rightsRequirements],
    },
    execution: {
      executionMode: 'EXECUTABLE_PROPOSAL',
      semanticCapabilityCalls: rewriter.content.semanticCapabilityCalls.map((call) => ({
        capability: call.capability,
        arguments: { ...call.arguments },
      })),
      expectedChanges: [...rewriter.content.expectedChanges],
      forbiddenChanges: [...guardian.content.requiredSourceLockIds],
      forbiddenCapabilityIds: [...guardian.content.forbiddenCapabilityIds],
      rollbackRequirements: [...guardian.content.requiredRollbackCapabilityIds],
      terminalIntent: commit.terminalIntent,
    },
    agency: {
      contributions,
      disagreements: selectedDissentRecords(commit, guardian).map((record) => record.text),
      guardianChallenge: guardian.content.guardianChallenge,
      witnessEvidence: {
        observations: witness.content.observations.map((observation) => ({
          observationId: observation.observationId,
          text: observation.text,
          inputRefIds: [...observation.inputRefIds],
        })),
        uncertainties: [...witness.uncertainties],
        evidenceAnchors: [...witness.evidenceAnchors],
      },
      dissentRecords: selectedDissentRecords(commit, guardian).map((record) => ({
        dissentId: record.dissentId,
        text: record.text,
        evidenceIds: [...record.evidenceIds],
      })),
    },
  };
  return validateAgentActionDraft(draft);
};

export const assembleCouncilDraft = async (
  input: AssembleCouncilDraftInput,
): Promise<AssembleCouncilDraftResult> => {
  let validation: ValidationResult;
  try {
    validation = await validateBeforeAssembly(input);
  } catch {
    return failure(FAIL, ['ASSEMBLY_INPUT_INVALID']);
  }
  if (!validation.ok) {
    return failure(
      validation.failure.status,
      validation.failure.reasonCodes,
    );
  }

  const startedAt = input.now();
  if (!Number.isFinite(startedAt) || startedAt >= input.turn.deadlineAtMonotonicMs) {
    return failure(FAIL, ['ASSEMBLY_DEADLINE_EXCEEDED']);
  }

  let draft: AgentActionDraft;
  let draftHash: string;
  try {
    draft = await buildDraft(validation.value);
    draftHash = await sha256Canonical(draft);
  } catch {
    return failure(FAIL, ['ASSEMBLY_DRAFT_INVALID']);
  }

  const finishedAt = input.now();
  const assemblyLatencyMs = finishedAt - startedAt;
  if (
    !Number.isFinite(finishedAt) ||
    !Number.isFinite(assemblyLatencyMs) ||
    assemblyLatencyMs < 0 ||
    finishedAt >= input.turn.deadlineAtMonotonicMs
  ) {
    return failure(
      FAIL,
      ['ASSEMBLY_DEADLINE_EXCEEDED'],
      Number.isFinite(assemblyLatencyMs) && assemblyLatencyMs >= 0
        ? assemblyLatencyMs
        : 0,
    );
  }
  return {
    status: 'ASSEMBLED',
    draft,
    draftHash,
    assemblyLatencyMs,
  };
};
