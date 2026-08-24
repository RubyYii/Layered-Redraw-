import { createHash } from 'node:crypto';

import {
  canonicalJson,
  CP03_COUNCIL_SCHEMA_VERSION,
  validateConductorCommitSubmission,
  validateConductorDraftCommit,
  validateCouncilRoleSubmission,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';

import type {
  ConductorDraftCommit,
  CouncilRole,
  CouncilShard,
  CouncilShardKind,
} from './contract-types.js';
import type { FrozenCouncilTurn } from './council-turn.js';
import type { CouncilToolBinding } from './council-tool-binding.js';

export interface CouncilRoleSubmission {
  readonly publicTrace: string;
  readonly uncertainties: readonly string[];
  readonly evidenceAnchors: readonly string[];
  readonly content: CouncilShard['content'];
}

export interface ConductorCommitSubmission {
  readonly actionSequence: readonly string[];
  readonly selectedShardHashes: readonly string[];
  readonly selectedDissentIds: readonly string[];
  readonly terminalIntent: 'Continue' | 'KeepOpaque' | null;
}

export interface BindCouncilRoleSubmissionInput {
  readonly binding: CouncilToolBinding;
  readonly turn: FrozenCouncilTurn;
  readonly submission: unknown;
}

export interface BindConductorCommitSubmissionInput {
  readonly binding: CouncilToolBinding;
  readonly turn: FrozenCouncilTurn;
  readonly submission: unknown;
}

const KIND_BY_ROLE: Readonly<Record<CouncilRole, CouncilShardKind>> =
  Object.freeze({
    CaseConductor: 'CONDUCTOR_INTENT',
    Witness: 'WITNESS',
    Archivist: 'ARCHIVIST',
    Rewriter: 'REWRITER',
    Guardian: 'GUARDIAN',
  });

const requireCurrentTurn = (
  binding: CouncilToolBinding,
  turn: FrozenCouncilTurn,
): void => {
  if (binding.turn !== turn) {
    throw new Error('PACT_COUNCIL_TOOL_BINDING_STALE');
  }
};

const shardIdFor = (
  binding: CouncilToolBinding,
  turn: FrozenCouncilTurn,
  submission: CouncilRoleSubmission,
): string => {
  const identity = canonicalJson({
    schemaVersion: CP03_COUNCIL_SCHEMA_VERSION,
    caseSessionId: turn.snapshot.caseSessionId,
    turnId: turn.snapshot.turnId,
    snapshotHash: turn.snapshotHash,
    role: binding.role,
    sessionId: String(binding.sessionId),
    phase: binding.phase,
    submission,
  });
  return `shard_${createHash('sha256').update(identity, 'utf8').digest('hex')}`;
};

export const bindCouncilRoleSubmission = (
  input: BindCouncilRoleSubmissionInput,
): CouncilShard => {
  requireCurrentTurn(input.binding, input.turn);
  if (input.binding.phase !== 'SHARD') {
    throw new Error('PACT_COUNCIL_TOOL_PHASE_MISMATCH');
  }
  const submission = validateCouncilRoleSubmission(
    input.submission,
  ) as CouncilRoleSubmission;
  const snapshot = input.turn.snapshot;
  return validateCouncilShard({
    schemaVersion: CP03_COUNCIL_SCHEMA_VERSION,
    shardId: shardIdFor(input.binding, input.turn, submission),
    kind: KIND_BY_ROLE[input.binding.role],
    role: input.binding.role,
    childSessionId: String(input.binding.sessionId),
    caseSessionId: snapshot.caseSessionId,
    turnId: snapshot.turnId,
    snapshotHash: input.turn.snapshotHash,
    parentSceneHash: snapshot.parentSceneHash,
    registryVersion: snapshot.registryVersion,
    routingManifestVersion: snapshot.routingManifestVersion,
    deadlineId: snapshot.deadlineId,
    ...submission,
  }) as CouncilShard;
};

export const bindConductorCommitSubmission = (
  input: BindConductorCommitSubmissionInput,
): ConductorDraftCommit => {
  requireCurrentTurn(input.binding, input.turn);
  if (
    input.binding.phase !== 'CONDUCTOR_COMMIT' ||
    input.binding.role !== 'CaseConductor'
  ) {
    throw new Error('PACT_COUNCIL_TOOL_PHASE_MISMATCH');
  }
  const submission = validateConductorCommitSubmission(
    input.submission,
  ) as ConductorCommitSubmission;
  return validateConductorDraftCommit({
    schemaVersion: CP03_COUNCIL_SCHEMA_VERSION,
    turnId: input.turn.snapshot.turnId,
    status: 'PROPOSED',
    ...submission,
  }) as ConductorDraftCommit;
};
