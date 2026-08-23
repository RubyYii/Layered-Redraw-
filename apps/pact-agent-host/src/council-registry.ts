import {
  sha256Canonical,
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';
import type { JsonValue, Session } from '@deepseek-ai/dsh-session';

import type {
  CouncilRole,
  CouncilShard,
  ConductorDraftCommit,
} from './contract-types.js';
import {
  isBeforeCouncilDeadline,
  type FrozenCouncilTurn,
} from './council-turn.js';
import { SubmissionRegistry } from './submission-registry.js';

export interface AcceptedCouncilShardReceipt {
  readonly accepted: true;
  readonly turnId: string;
  readonly shardId: string;
  readonly payloadHash: string;
  readonly acceptanceSequence: number;
  readonly projectedTrace: boolean;
  readonly acceptedAtMonotonicMs: number;
  readonly shardEventSeq: number;
  readonly traceEventSeq: number | null;
}

export interface RejectedCouncilShardReceipt {
  readonly accepted: false;
  readonly turnId: string;
  readonly shardId: string;
  readonly payloadHash: string;
  readonly reasonCode: string;
  readonly acceptanceSequence: null;
  readonly projectedTrace: false;
  readonly acceptedAtMonotonicMs: null;
  readonly shardEventSeq: null;
  readonly traceEventSeq: null;
}

export type CouncilShardReceipt =
  | AcceptedCouncilShardReceipt
  | RejectedCouncilShardReceipt;

export interface DurableCouncilShardReceipt
  extends AcceptedCouncilShardReceipt {
  readonly accepted: true;
  readonly status: 'DURABLE';
  readonly sessionId: string;
  readonly lastSeq: number;
}

export interface AcceptedCouncilCommitReceipt {
  readonly accepted: true;
  readonly turnId: string;
  readonly payloadHash: string;
  readonly commitEventSeq: number;
}

export interface RejectedCouncilCommitReceipt {
  readonly accepted: false;
  readonly turnId: string;
  readonly payloadHash: string;
  readonly reasonCode: string;
  readonly commitEventSeq: null;
}

export type CouncilCommitReceipt =
  | AcceptedCouncilCommitReceipt
  | RejectedCouncilCommitReceipt;

export interface DurableConductorCommitReceipt
  extends AcceptedCouncilCommitReceipt {
  readonly accepted: true;
  readonly status: 'DURABLE';
  readonly sessionId: string;
  readonly lastSeq: number;
}

export interface CouncilProposalSnapshot {
  readonly turn: FrozenCouncilTurn;
  readonly selectionBarrierClosed: boolean;
  readonly durableShards: readonly {
    readonly shard: CouncilShard;
    readonly payloadHash: string;
    readonly acceptanceSequence: number;
  }[];
  readonly durableCommit: null | {
    readonly commit: ConductorDraftCommit;
    readonly payloadHash: string;
  };
}

export interface CouncilRegistryOptions {
  readonly submissions: SubmissionRegistry;
  readonly now?: () => number;
}

interface AcceptedShard {
  readonly shard: CouncilShard;
  readonly receipt: AcceptedCouncilShardReceipt;
  readonly sessionId: string;
  durable: boolean;
}

interface AcceptedCommit {
  readonly commit: ConductorDraftCommit;
  readonly receipt: AcceptedCouncilCommitReceipt;
  readonly sessionId: string;
  durable: boolean;
}

interface TurnState {
  readonly turn: FrozenCouncilTurn;
  acceptanceSequence: number;
  selectionBarrierClosed: boolean;
  closed: boolean;
  firstTraceProjected: boolean;
  readonly shards: Map<string, AcceptedShard>;
  commit?: AcceptedCommit;
}

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const snapshot = <T>(value: T): T =>
  deepFreeze(structuredClone(value));

const jsonPayload = (value: unknown): JsonValue => value as JsonValue;

const payloadHashOf = async (value: unknown): Promise<string> => {
  try {
    return await sha256Canonical(value);
  } catch {
    return 'invalid-payload';
  }
};

const traceEligible = (role: CouncilRole): role is 'Witness' | 'Rewriter' =>
  role === 'Witness' || role === 'Rewriter';

export class CouncilRegistry {
  private readonly turns = new Map<string, TurnState>();
  private readonly now: () => number;

  constructor(private readonly options: CouncilRegistryOptions) {
    this.now = options.now ?? Date.now;
  }

  get submissions(): SubmissionRegistry {
    return this.options.submissions;
  }

  openTurn(turn: FrozenCouncilTurn): void {
    const existing = this.turns.get(turn.snapshot.turnId);
    if (existing !== undefined) {
      if (existing.turn.snapshotHash !== turn.snapshotHash) {
        throw new Error('PACT_COUNCIL_TURN_ID_CONFLICT');
      }
      return;
    }
    this.options.submissions.openTurn(
      turn.snapshot.turnId,
      turn.deadlineAtMonotonicMs,
    );
    this.turns.set(turn.snapshot.turnId, {
      turn,
      acceptanceSequence: 0,
      selectionBarrierClosed: false,
      closed: false,
      firstTraceProjected: false,
      shards: new Map(),
    });
  }

  async acceptShard(
    session: Session,
    rawShard: CouncilShard,
  ): Promise<CouncilShardReceipt> {
    const shard = rawShard as CouncilShard;
    const payloadHash = await payloadHashOf(shard);
    const turnId = typeof shard?.turnId === 'string' ? shard.turnId : 'turn_invalid';
    const shardId = typeof shard?.shardId === 'string' ? shard.shardId : 'shard_invalid';
    const reject = (
      reasonCode: string,
      rejectionTurnId = turnId,
      rejectionShardId = shardId,
    ): RejectedCouncilShardReceipt => {
      session.append('pact/quarantine', {
        turnId: rejectionTurnId,
        reason: reasonCode,
        payloadHash,
      });
      return Object.freeze({
        accepted: false as const,
        turnId: rejectionTurnId,
        shardId: rejectionShardId,
        payloadHash,
        reasonCode,
        acceptanceSequence: null,
        projectedTrace: false as const,
        acceptedAtMonotonicMs: null,
        shardEventSeq: null,
        traceEventSeq: null,
      });
    };

    try {
      validateCouncilShard(shard);
    } catch {
      return reject('PACT_COUNCIL_SHARD_SCHEMA_INVALID');
    }
    const state = this.turns.get(shard.turnId);
    if (state === undefined) return reject('PACT_COUNCIL_TURN_NOT_OPEN');

    let binding;
    try {
      binding = this.options.submissions.bindingFor(session.id);
    } catch {
      return reject('PACT_COUNCIL_SHARD_ROLE_OR_SESSION_MISMATCH');
    }
    if (
      binding.role !== shard.role ||
      shard.childSessionId !== String(session.id)
    ) {
      return reject('PACT_COUNCIL_SHARD_ROLE_OR_SESSION_MISMATCH');
    }
    if (shard.caseSessionId !== state.turn.snapshot.caseSessionId) {
      return reject('PACT_COUNCIL_SHARD_CASE_SESSION_MISMATCH');
    }
    if (shard.snapshotHash !== state.turn.snapshotHash) {
      return reject('PACT_COUNCIL_SHARD_SNAPSHOT_MISMATCH');
    }
    if (shard.parentSceneHash !== state.turn.snapshot.parentSceneHash) {
      return reject('PACT_COUNCIL_SHARD_SCENE_MISMATCH');
    }
    if (shard.registryVersion !== state.turn.snapshot.registryVersion) {
      return reject('PACT_COUNCIL_SHARD_REGISTRY_MISMATCH');
    }
    if (
      shard.routingManifestVersion !== state.turn.snapshot.routingManifestVersion
    ) {
      return reject('PACT_COUNCIL_SHARD_MANIFEST_MISMATCH');
    }
    if (shard.deadlineId !== state.turn.snapshot.deadlineId) {
      return reject('PACT_COUNCIL_SHARD_DEADLINE_MISMATCH');
    }

    const existing = state.shards.get(shard.shardId);
    if (existing !== undefined) {
      if (existing.receipt.payloadHash === payloadHash) return existing.receipt;
      return reject('PACT_COUNCIL_SHARD_ID_CONFLICT');
    }
    if (state.closed || state.selectionBarrierClosed) {
      return reject('PACT_SELECTION_BARRIER_CLOSED');
    }
    const acceptedAtMonotonicMs = this.now();
    if (!isBeforeCouncilDeadline(
      acceptedAtMonotonicMs,
      state.turn.deadlineAtMonotonicMs,
    )) {
      return reject('PACT_COUNCIL_SHARD_DEADLINE_CLOSED');
    }

    const acceptanceSequence = ++state.acceptanceSequence;
    const shardEvent = session.append('pact/council-shard', {
      caseSessionId: shard.caseSessionId,
      turnId: shard.turnId,
      shardId: shard.shardId,
      role: shard.role,
      payload: jsonPayload(shard),
      payloadHash,
      acceptanceSequence,
    });
    const projectedTrace = !state.firstTraceProjected && traceEligible(shard.role);
    let traceEventSeq: number | null = null;
    if (projectedTrace) {
      const traceEvent = session.append('pact/public-trace', {
        caseSessionId: shard.caseSessionId,
        turnId: shard.turnId,
        role: shard.role,
        text: shard.publicTrace,
        sourceContributionHash: payloadHash,
        acceptanceSequence,
        phase: 'COUNCIL' as const,
        provisional: true as const,
        projectedAtMonotonicMs: acceptedAtMonotonicMs,
      });
      traceEventSeq = traceEvent.seq;
      state.firstTraceProjected = true;
    }
    const receipt = Object.freeze({
      accepted: true as const,
      turnId: shard.turnId,
      shardId: shard.shardId,
      payloadHash,
      acceptanceSequence,
      projectedTrace,
      acceptedAtMonotonicMs,
      shardEventSeq: shardEvent.seq,
      traceEventSeq,
    });
    state.shards.set(shard.shardId, {
      shard: snapshot(shard),
      receipt,
      sessionId: String(session.id),
      durable: false,
    });
    return receipt;
  }

  markShardDurable(receipt: DurableCouncilShardReceipt): void {
    const state = this.turns.get(receipt.turnId);
    const accepted = state?.shards.get(receipt.shardId);
    if (
      state === undefined ||
      accepted === undefined ||
      receipt.accepted !== true ||
      receipt.status !== 'DURABLE' ||
      receipt.payloadHash !== accepted.receipt.payloadHash ||
      receipt.acceptanceSequence !== accepted.receipt.acceptanceSequence ||
      receipt.shardEventSeq !== accepted.receipt.shardEventSeq ||
      receipt.traceEventSeq !== accepted.receipt.traceEventSeq ||
      receipt.sessionId !== accepted.sessionId ||
      receipt.lastSeq < accepted.receipt.shardEventSeq ||
      (accepted.receipt.traceEventSeq !== null &&
        receipt.lastSeq < accepted.receipt.traceEventSeq)
    ) {
      throw new Error('PACT_COUNCIL_DURABLE_SHARD_RECEIPT_MISMATCH');
    }
    accepted.durable = true;
  }

  async acceptCommit(
    session: Session,
    rawCommit: ConductorDraftCommit,
  ): Promise<CouncilCommitReceipt> {
    const commit = rawCommit as ConductorDraftCommit;
    const payloadHash = await payloadHashOf(commit);
    const turnId = typeof commit?.turnId === 'string' ? commit.turnId : 'turn_invalid';
    const reject = (reasonCode: string): RejectedCouncilCommitReceipt => {
      session.append('pact/quarantine', { turnId, reason: reasonCode, payloadHash });
      return Object.freeze({
        accepted: false as const,
        turnId,
        payloadHash,
        reasonCode,
        commitEventSeq: null,
      });
    };
    try {
      validateConductorDraftCommit(commit);
    } catch {
      return reject('PACT_CONDUCTOR_COMMIT_SCHEMA_INVALID');
    }
    const state = this.turns.get(commit.turnId);
    if (state === undefined) return reject('PACT_COUNCIL_TURN_NOT_OPEN');
    let binding;
    try {
      binding = this.options.submissions.bindingFor(session.id);
    } catch {
      return reject('PACT_CONDUCTOR_COMMIT_ROLE_REQUIRED');
    }
    if (binding.role !== 'CaseConductor') {
      return reject('PACT_CONDUCTOR_COMMIT_ROLE_REQUIRED');
    }
    if (state.commit !== undefined) {
      if (state.commit.receipt.payloadHash === payloadHash) return state.commit.receipt;
      return reject('PACT_CONDUCTOR_COMMIT_ID_CONFLICT');
    }
    if (state.closed || state.selectionBarrierClosed) {
      return reject('PACT_SELECTION_BARRIER_CLOSED');
    }
    const now = this.now();
    if (!isBeforeCouncilDeadline(now, state.turn.deadlineAtMonotonicMs)) {
      return reject('PACT_CONDUCTOR_COMMIT_DEADLINE_CLOSED');
    }
    const event = session.append('pact/conductor-commit', {
      turnId: commit.turnId,
      payload: jsonPayload(commit),
      payloadHash,
    });
    const receipt = Object.freeze({
      accepted: true as const,
      turnId: commit.turnId,
      payloadHash,
      commitEventSeq: event.seq,
    });
    state.commit = {
      commit: snapshot(commit),
      receipt,
      sessionId: String(session.id),
      durable: false,
    };
    return receipt;
  }

  markCommitDurable(receipt: DurableConductorCommitReceipt): void {
    const state = this.turns.get(receipt.turnId);
    const accepted = state?.commit;
    if (
      state === undefined ||
      accepted === undefined ||
      receipt.accepted !== true ||
      receipt.status !== 'DURABLE' ||
      receipt.payloadHash !== accepted.receipt.payloadHash ||
      receipt.commitEventSeq !== accepted.receipt.commitEventSeq ||
      receipt.sessionId !== accepted.sessionId ||
      receipt.lastSeq < accepted.receipt.commitEventSeq
    ) {
      throw new Error('PACT_COUNCIL_DURABLE_COMMIT_RECEIPT_MISMATCH');
    }
    accepted.durable = true;
  }

  closeSelectionBarrier(turnId: string): void {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    state.selectionBarrierClosed = true;
  }

  durableProposal(turnId: string): CouncilProposalSnapshot {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    return deepFreeze({
      turn: state.turn,
      selectionBarrierClosed: state.selectionBarrierClosed,
      durableShards: [...state.shards.values()]
        .filter((entry) => entry.durable)
        .sort((left, right) =>
          left.receipt.acceptanceSequence - right.receipt.acceptanceSequence)
        .map((entry) => ({
          shard: snapshot(entry.shard),
          payloadHash: entry.receipt.payloadHash,
          acceptanceSequence: entry.receipt.acceptanceSequence,
        })),
      durableCommit: state.commit?.durable
        ? {
            commit: snapshot(state.commit.commit),
            payloadHash: state.commit.receipt.payloadHash,
          }
        : null,
    });
  }

  closeTurn(turnId: string): void {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    state.closed = true;
    this.options.submissions.closeTurn(turnId);
  }
}
