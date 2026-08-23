import {
  sha256Canonical,
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';
import type {
  JsonValue,
  Session,
  SessionEvent,
} from '@deepseek-ai/dsh-session';

import type {
  CouncilRole,
  CouncilShard,
  ConductorDraftCommit,
} from './contract-types.js';
import {
  isBeforeCouncilDeadline,
  monotonicNowMs,
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

/**
 * This symbol is intentionally exported only from the implementation module,
 * not from the package index. Durability is the sole producer of the proof.
 */
export const COUNCIL_DURABILITY_PROOF = Symbol('council-durability-proof');

export type CouncilDurabilityProof = {
  readonly [COUNCIL_DURABILITY_PROOF]: true;
};

export interface DurableCouncilShardReceipt
  extends AcceptedCouncilShardReceipt {
  readonly accepted: true;
  readonly status: 'DURABLE';
  readonly sessionId: string;
  readonly lastSeq: number;
  readonly [COUNCIL_DURABILITY_PROOF]: true;
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
  readonly [COUNCIL_DURABILITY_PROOF]: true;
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

export interface AcceptedCouncilShardContext {
  readonly turn: FrozenCouncilTurn;
  readonly shard: CouncilShard;
  readonly receipt: AcceptedCouncilShardReceipt;
  readonly sessionId: string;
  readonly projectionAtMonotonicMs: number | null;
}

export interface AcceptedCouncilCommitContext {
  readonly turn: FrozenCouncilTurn;
  readonly commit: ConductorDraftCommit;
  readonly sessionId: string;
}

interface AcceptedShard {
  readonly shard: CouncilShard;
  receipt: AcceptedCouncilShardReceipt;
  readonly session: Session;
  readonly sessionId: string;
  projectionAtMonotonicMs: number | null;
  recoveryReservation: RecoveryTraceReservation | null;
  durable: boolean;
}

interface RecoveryTraceTarget {
  readonly turnId: string;
  readonly shardId: string;
  readonly payloadHash: string;
  readonly acceptanceSequence: number;
  readonly session: Session;
}

type RecoveryTraceReservation = object;

interface RecoveryTraceReservationState extends RecoveryTraceTarget {
  readonly projectedAtMonotonicMs: number;
  committed: boolean;
}

interface CouncilRegistryRecoveryCapability {
  assertCanonicalShardSession(
    receipt: AcceptedCouncilShardReceipt,
    session: Session,
  ): void;
  assertCanonicalCommitSession(
    receipt: AcceptedCouncilCommitReceipt,
    session: Session,
  ): void;
  canonicalShardSession(receipt: AcceptedCouncilShardReceipt): Session;
  canonicalShardSessions(turnId: string): readonly Session[];
  reserveRecoveryTrace(target: RecoveryTraceTarget): RecoveryTraceReservation;
  recoveryTimestamp(reservation: RecoveryTraceReservation): number;
  commitRecoveryTrace(
    reservation: RecoveryTraceReservation,
    session: Session,
    traceEventSeq: number,
  ): AcceptedCouncilShardContext;
}

interface AcceptedCommit {
  readonly commit: ConductorDraftCommit;
  readonly receipt: AcceptedCouncilCommitReceipt;
  readonly session: Session;
  readonly sessionId: string;
  durable: boolean;
}

interface TurnState {
  readonly turn: FrozenCouncilTurn;
  acceptanceSequence: number;
  selectionBarrierClosed: boolean;
  closed: boolean;
  firstTraceAcceptanceSequence: number | null;
  frozenDurableShardIds: ReadonlySet<string> | null;
  frozenDurableShardPayloadHashes: ReadonlyMap<string, string> | null;
  frozenDurableCommit: boolean;
  frozenDurableCommitPayloadHash: string | null;
  frozenDurableCommitSelection: readonly string[] | null;
  readonly canonicalSessionsById: Map<string, Session>;
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

const postBarrierCommitReason = (
  state: TurnState,
  selectedShardHashes: readonly string[],
): string | null => {
  if (new Set(selectedShardHashes).size !== selectedShardHashes.length) {
    return 'PACT_CONDUCTOR_COMMIT_SELECTION_DUPLICATE';
  }
  const frozenPayloadHashes = state.frozenDurableShardPayloadHashes;
  if (frozenPayloadHashes === null) {
    return 'PACT_SELECTION_BARRIER_NOT_FROZEN';
  }

  const matchingShardIdsByHash = new Map<string, string[]>();
  for (const [shardId, payloadHash] of frozenPayloadHashes.entries()) {
    const shardIds = matchingShardIdsByHash.get(payloadHash) ?? [];
    shardIds.push(shardId);
    matchingShardIdsByHash.set(payloadHash, shardIds);
  }
  for (const payloadHash of selectedShardHashes) {
    const matchingShardIds = matchingShardIdsByHash.get(payloadHash);
    if (matchingShardIds === undefined || matchingShardIds.length === 0) {
      return 'PACT_CONDUCTOR_COMMIT_SELECTION_NOT_FROZEN';
    }
    if (matchingShardIds.length !== 1) {
      return 'PACT_CONDUCTOR_COMMIT_SELECTION_NOT_UNIQUE';
    }
  }

  const selectedRoles = new Set<CouncilRole>();
  for (const payloadHash of selectedShardHashes) {
    const shardId = matchingShardIdsByHash.get(payloadHash)?.[0];
    const shard = shardId === undefined ? undefined : state.shards.get(shardId);
    if (shard === undefined) return 'PACT_CONDUCTOR_COMMIT_SELECTION_NOT_FROZEN';
    selectedRoles.add(shard.shard.role);
  }
  if (state.turn.requiredRoles.some((role) => !selectedRoles.has(role))) {
    return 'PACT_CONDUCTOR_COMMIT_REQUIRED_ROLE_MISSING';
  }
  return null;
};

const hasDurabilityProof = (
  value: unknown,
): value is CouncilDurabilityProof =>
  value !== null &&
  typeof value === 'object' &&
  (value as Partial<CouncilDurabilityProof>)[COUNCIL_DURABILITY_PROOF] === true;

const acceptedReceiptMatches = (
  expected: AcceptedCouncilShardReceipt,
  candidate: AcceptedCouncilShardReceipt,
): boolean =>
  candidate.accepted === expected.accepted &&
  candidate.turnId === expected.turnId &&
  candidate.shardId === expected.shardId &&
  candidate.payloadHash === expected.payloadHash &&
  candidate.acceptanceSequence === expected.acceptanceSequence &&
  candidate.projectedTrace === expected.projectedTrace &&
  candidate.acceptedAtMonotonicMs === expected.acceptedAtMonotonicMs &&
  candidate.shardEventSeq === expected.shardEventSeq &&
  candidate.traceEventSeq === expected.traceEventSeq;

const recoveryTraceMatches = (
  event: SessionEvent | undefined,
  state: TurnState,
  accepted: AcceptedShard,
  projectedAtMonotonicMs: number,
  traceEventSeq: number,
): boolean =>
  event !== undefined &&
  event.seq === traceEventSeq &&
  event.type === 'pact/public-trace' &&
  event.data.caseSessionId === state.turn.snapshot.caseSessionId &&
  event.data.turnId === accepted.shard.turnId &&
  event.data.role === accepted.shard.role &&
  event.data.text === accepted.shard.publicTrace &&
  event.data.sourceContributionHash === accepted.receipt.payloadHash &&
  event.data.acceptanceSequence === accepted.receipt.acceptanceSequence &&
  event.data.phase === 'COUNCIL' &&
  event.data.provisional === true &&
  event.data.projectedAtMonotonicMs === projectedAtMonotonicMs;

const recoveryCapabilities = new WeakMap<
  CouncilRegistry,
  CouncilRegistryRecoveryCapability
>();

export class CouncilRegistry {
  private readonly turns = new Map<string, TurnState>();
  private readonly now: () => number;
  private readonly recoveryReservations = new WeakMap<
    RecoveryTraceReservation,
    RecoveryTraceReservationState
  >();

  constructor(private readonly options: CouncilRegistryOptions) {
    this.now = options.now ?? monotonicNowMs;
    recoveryCapabilities.set(this, Object.freeze({
      assertCanonicalShardSession: (
        receipt: AcceptedCouncilShardReceipt,
        session: Session,
      ) => {
        this.#assertCanonicalShardSession(receipt, session);
      },
      assertCanonicalCommitSession: (
        receipt: AcceptedCouncilCommitReceipt,
        session: Session,
      ) => {
        this.#assertCanonicalCommitSession(receipt, session);
      },
      canonicalShardSession: (receipt: AcceptedCouncilShardReceipt) =>
        this.#canonicalShardSession(receipt),
      canonicalShardSessions: (turnId: string) =>
        this.#canonicalShardSessions(turnId),
      reserveRecoveryTrace: (target: RecoveryTraceTarget) =>
        this.#reserveRecoveryTrace(target),
      recoveryTimestamp: (reservation: RecoveryTraceReservation) =>
        this.#recoveryTimestamp(reservation),
      commitRecoveryTrace: (
        reservation: RecoveryTraceReservation,
        session: Session,
        traceEventSeq: number,
      ) => this.#commitRecoveryTrace(reservation, session, traceEventSeq),
    }));
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
      firstTraceAcceptanceSequence: null,
      frozenDurableShardIds: null,
      frozenDurableShardPayloadHashes: null,
      frozenDurableCommit: false,
      frozenDurableCommitPayloadHash: null,
      frozenDurableCommitSelection: null,
      canonicalSessionsById: new Map(),
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
    const canonicalSession = state.canonicalSessionsById.get(String(session.id));
    if (canonicalSession !== undefined && canonicalSession !== session) {
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
      if (existing.receipt.payloadHash === payloadHash) {
        if (
          existing.receipt.projectedTrace &&
          existing.receipt.traceEventSeq === null &&
          traceEligible(existing.shard.role)
        ) {
          return this.completeFirstTrace(state, existing, session);
        }
        return existing.receipt;
      }
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
    const projectedTrace =
      state.firstTraceAcceptanceSequence === null && traceEligible(shard.role);
    if (projectedTrace) state.firstTraceAcceptanceSequence = acceptanceSequence;
    const receipt = Object.freeze({
      accepted: true as const,
      turnId: shard.turnId,
      shardId: shard.shardId,
      payloadHash,
      acceptanceSequence,
      projectedTrace,
      acceptedAtMonotonicMs,
      shardEventSeq: shardEvent.seq,
      traceEventSeq: null,
    });
    const accepted: AcceptedShard = {
      shard: snapshot(shard),
      receipt,
      session,
      sessionId: String(session.id),
      projectionAtMonotonicMs: null,
      recoveryReservation: null,
      durable: false,
    };
    state.shards.set(shard.shardId, accepted);
    state.canonicalSessionsById.set(String(session.id), session);
    if (projectedTrace) return this.completeFirstTrace(state, accepted, session);
    return accepted.receipt;
  }

  private completeFirstTrace(
    state: TurnState,
    accepted: AcceptedShard,
    session: Session,
  ): AcceptedCouncilShardReceipt {
    if (!traceEligible(accepted.shard.role)) return accepted.receipt;
    if (accepted.receipt.traceEventSeq !== null) return accepted.receipt;

    const existingTrace = session.events.find((event) =>
      event.type === 'pact/public-trace' &&
      event.data.caseSessionId === state.turn.snapshot.caseSessionId &&
      event.data.turnId === accepted.shard.turnId &&
      event.data.role === accepted.shard.role &&
      event.data.text === accepted.shard.publicTrace &&
      event.data.sourceContributionHash === accepted.receipt.payloadHash &&
      event.data.acceptanceSequence === accepted.receipt.acceptanceSequence &&
      event.data.phase === 'COUNCIL' &&
      event.data.provisional === true
    );
    const traceEvent = existingTrace ?? session.append('pact/public-trace', {
      caseSessionId: accepted.shard.caseSessionId,
      turnId: accepted.shard.turnId,
      role: accepted.shard.role,
      text: accepted.shard.publicTrace,
      sourceContributionHash: accepted.receipt.payloadHash,
      acceptanceSequence: accepted.receipt.acceptanceSequence,
      phase: 'COUNCIL' as const,
      provisional: true as const,
      projectedAtMonotonicMs: accepted.receipt.acceptedAtMonotonicMs,
    });
    accepted.receipt = Object.freeze({
      ...accepted.receipt,
      traceEventSeq: traceEvent.seq,
    });
    accepted.projectionAtMonotonicMs = accepted.receipt.acceptedAtMonotonicMs;
    state.firstTraceAcceptanceSequence = accepted.receipt.acceptanceSequence;
    return accepted.receipt;
  }

  acceptedShardContext(
    receipt: AcceptedCouncilShardReceipt,
  ): AcceptedCouncilShardContext {
    const state = this.turns.get(receipt?.turnId);
    const accepted = state?.shards.get(receipt?.shardId);
    if (
      state === undefined ||
      accepted === undefined ||
      !acceptedReceiptMatches(accepted.receipt, receipt)
    ) {
      throw new Error('PACT_COUNCIL_ACCEPTED_SHARD_RECEIPT_MISMATCH');
    }
    return {
      turn: state.turn,
      shard: snapshot(accepted.shard),
      receipt: snapshot(accepted.receipt),
      sessionId: accepted.sessionId,
      projectionAtMonotonicMs: accepted.projectionAtMonotonicMs,
    };
  }

  acceptedCouncilShardContexts(turnId: string): readonly AcceptedCouncilShardContext[] {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    return deepFreeze(
      [...state.shards.values()]
        .sort((left, right) =>
          left.receipt.acceptanceSequence - right.receipt.acceptanceSequence)
        .map((accepted) => ({
          turn: state.turn,
          shard: snapshot(accepted.shard),
          receipt: snapshot(accepted.receipt),
          sessionId: accepted.sessionId,
          projectionAtMonotonicMs: accepted.projectionAtMonotonicMs,
        })),
    );
  }

  #acceptedShardForReceipt(
    receipt: AcceptedCouncilShardReceipt,
  ): AcceptedShard {
    const state = this.turns.get(receipt?.turnId);
    const accepted = state?.shards.get(receipt?.shardId);
    if (
      state === undefined ||
      accepted === undefined ||
      !acceptedReceiptMatches(accepted.receipt, receipt)
    ) {
      throw new Error('PACT_COUNCIL_ACCEPTED_SHARD_RECEIPT_MISMATCH');
    }
    return accepted;
  }

  #assertCanonicalShardSession(
    receipt: AcceptedCouncilShardReceipt,
    session: Session,
  ): AcceptedShard {
    const accepted = this.#acceptedShardForReceipt(receipt);
    let binding;
    try {
      binding = this.options.submissions.bindingFor(session.id);
    } catch {
      throw new Error('PACT_COUNCIL_SHARD_ROLE_OR_SESSION_MISMATCH');
    }
    if (
      accepted.session !== session ||
      accepted.sessionId !== String(session.id) ||
      String(binding.sessionId) !== accepted.sessionId ||
      binding.role !== accepted.shard.role ||
      accepted.shard.childSessionId !== String(session.id)
    ) {
      throw new Error('PACT_COUNCIL_SHARD_ROLE_OR_SESSION_MISMATCH');
    }
    return accepted;
  }

  #canonicalShardSession(receipt: AcceptedCouncilShardReceipt): Session {
    return this.#acceptedShardForReceipt(receipt).session;
  }

  #assertCanonicalCommitSession(
    receipt: AcceptedCouncilCommitReceipt,
    session: Session,
  ): AcceptedCommit {
    const state = this.turns.get(receipt?.turnId);
    const accepted = state?.commit;
    if (
      state === undefined ||
      accepted === undefined ||
      accepted.receipt.payloadHash !== receipt?.payloadHash ||
      accepted.receipt.commitEventSeq !== receipt?.commitEventSeq
    ) {
      throw new Error('PACT_COUNCIL_ACCEPTED_COMMIT_RECEIPT_MISMATCH');
    }
    let binding;
    try {
      binding = this.options.submissions.bindingFor(session.id);
    } catch {
      throw new Error('PACT_CONDUCTOR_COMMIT_ROLE_REQUIRED');
    }
    if (
      accepted.session !== session ||
      accepted.sessionId !== String(session.id) ||
      String(binding.sessionId) !== accepted.sessionId ||
      binding.role !== 'CaseConductor'
    ) {
      throw new Error('PACT_CONDUCTOR_COMMIT_ROLE_REQUIRED');
    }
    return accepted;
  }

  #canonicalShardSessions(turnId: string): readonly Session[] {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    const sessions = new Map<string, Session>();
    for (const accepted of state.shards.values()) {
      const existing = sessions.get(accepted.sessionId);
      if (existing !== undefined && existing !== accepted.session) {
        throw new Error('PACT_COUNCIL_CANONICAL_SESSION_CONFLICT');
      }
      sessions.set(accepted.sessionId, accepted.session);
    }
    return Object.freeze([...sessions.values()]);
  }

  frozenTurn(turnId: string): FrozenCouncilTurn {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    return state.turn;
  }

  #reserveRecoveryTrace(
    target: RecoveryTraceTarget,
  ): RecoveryTraceReservation {
    const state = this.turns.get(target.turnId);
    const accepted = state?.shards.get(target.shardId);
    const sessionId = String(target.session.id);
    let binding;
    try {
      binding = this.options.submissions.bindingFor(target.session.id);
    } catch {
      throw new Error('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    }
    if (
      state === undefined ||
      accepted === undefined ||
      !traceEligible(accepted.shard.role) ||
      !accepted.receipt.projectedTrace ||
      accepted.session !== target.session ||
      accepted.sessionId !== sessionId ||
      String(binding.sessionId) !== accepted.sessionId ||
      binding.role !== accepted.shard.role ||
      accepted.shard.childSessionId !== sessionId ||
      accepted.receipt.payloadHash !== target.payloadHash ||
      accepted.receipt.acceptanceSequence !== target.acceptanceSequence ||
      accepted.receipt.traceEventSeq !== null ||
      accepted.projectionAtMonotonicMs !== null ||
      state.firstTraceAcceptanceSequence !== target.acceptanceSequence ||
      accepted.recoveryReservation !== null
    ) {
      throw new Error('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    }

    const projectedAtMonotonicMs = this.now();
    if (!Number.isFinite(projectedAtMonotonicMs)) {
      throw new Error('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    }
    const reservation = Object.freeze({});
    this.recoveryReservations.set(reservation, {
      ...target,
      projectedAtMonotonicMs,
      committed: false,
    });
    accepted.recoveryReservation = reservation;
    return reservation;
  }

  #recoveryTimestamp(
    reservation: RecoveryTraceReservation,
  ): number {
    const state = this.recoveryReservations.get(reservation);
    if (state === undefined || state.committed) {
      throw new Error('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    }
    return state.projectedAtMonotonicMs;
  }

  #commitRecoveryTrace(
    reservation: RecoveryTraceReservation,
    session: Session,
    traceEventSeq: number,
  ): AcceptedCouncilShardContext {
    const reservationState = this.recoveryReservations.get(reservation);
    const state = reservationState === undefined
      ? undefined
      : this.turns.get(reservationState.turnId);
    const accepted = state?.shards.get(reservationState?.shardId ?? '');
    let canonicalSession = false;
    if (reservationState !== undefined && session !== undefined) {
      try {
        this.#assertCanonicalShardSession(
          accepted?.receipt ?? ({} as AcceptedCouncilShardReceipt),
          session,
        );
        canonicalSession = true;
      } catch {
        canonicalSession = false;
      }
    }
    if (
      reservationState === undefined ||
      reservationState.committed ||
      state === undefined ||
      accepted === undefined ||
      accepted.recoveryReservation !== reservation ||
      !canonicalSession ||
      session !== reservationState.session ||
      !Number.isInteger(traceEventSeq) ||
      traceEventSeq < 0 ||
      accepted.receipt.payloadHash !== reservationState.payloadHash ||
      accepted.receipt.acceptanceSequence !== reservationState.acceptanceSequence ||
      accepted.receipt.traceEventSeq !== null ||
      accepted.projectionAtMonotonicMs !== null ||
      !recoveryTraceMatches(
        session.events.find((event) => event.seq === traceEventSeq),
        state,
        accepted,
        reservationState.projectedAtMonotonicMs,
        traceEventSeq,
      )
    ) {
      throw new Error('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    }
    accepted.receipt = Object.freeze({
      ...accepted.receipt,
      traceEventSeq,
    });
    accepted.projectionAtMonotonicMs = reservationState.projectedAtMonotonicMs;
    reservationState.committed = true;
    return this.acceptedShardContext(accepted.receipt);
  }

  markShardDurable(receipt: DurableCouncilShardReceipt): void {
    const state = this.turns.get(receipt.turnId);
    const accepted = state?.shards.get(receipt.shardId);
    if (
      !hasDurabilityProof(receipt) ||
      state === undefined ||
      accepted === undefined ||
      receipt.accepted !== true ||
      receipt.status !== 'DURABLE' ||
      !acceptedReceiptMatches(accepted.receipt, receipt) ||
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
    const canonicalSession = state.canonicalSessionsById.get(String(session.id));
    if (canonicalSession !== undefined && canonicalSession !== session) {
      return reject('PACT_CONDUCTOR_COMMIT_ROLE_REQUIRED');
    }
    if (state.commit !== undefined) {
      if (state.commit.receipt.payloadHash === payloadHash) return state.commit.receipt;
      return reject('PACT_CONDUCTOR_COMMIT_ID_CONFLICT');
    }
    if (state.closed) {
      return reject('PACT_SELECTION_BARRIER_CLOSED');
    }
    const now = this.now();
    if (!isBeforeCouncilDeadline(now, state.turn.deadlineAtMonotonicMs)) {
      return reject('PACT_CONDUCTOR_COMMIT_DEADLINE_CLOSED');
    }
    if (state.selectionBarrierClosed) {
      const selectionReason = postBarrierCommitReason(
        state,
        commit.selectedShardHashes,
      );
      if (selectionReason !== null) return reject(selectionReason);
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
      session,
      sessionId: String(session.id),
      durable: false,
    };
    state.canonicalSessionsById.set(String(session.id), session);
    return receipt;
  }

  acceptedCommitContext(
    receipt: AcceptedCouncilCommitReceipt,
  ): AcceptedCouncilCommitContext {
    const state = this.turns.get(receipt.turnId);
    const accepted = state?.commit;
    if (
      state === undefined ||
      accepted === undefined ||
      accepted.receipt.payloadHash !== receipt.payloadHash ||
      accepted.receipt.commitEventSeq !== receipt.commitEventSeq
    ) {
      throw new Error('PACT_COUNCIL_ACCEPTED_COMMIT_RECEIPT_MISMATCH');
    }
    return {
      turn: state.turn,
      commit: snapshot(accepted.commit),
      sessionId: accepted.sessionId,
    };
  }

  markCommitDurable(receipt: DurableConductorCommitReceipt): void {
    const state = this.turns.get(receipt.turnId);
    const accepted = state?.commit;
    if (
      !hasDurabilityProof(receipt) ||
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
    if (state.selectionBarrierClosed) {
      state.frozenDurableCommit = true;
      state.frozenDurableCommitPayloadHash = accepted.receipt.payloadHash;
      state.frozenDurableCommitSelection = Object.freeze([
        ...accepted.commit.selectedShardHashes,
      ]);
    }
  }

  closeSelectionBarrier(turnId: string): void {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    if (state.selectionBarrierClosed) return;
    state.selectionBarrierClosed = true;
    const frozenDurableShardPayloadHashes = new Map(
      [...state.shards.entries()]
        .filter(([, entry]) => entry.durable)
        .map(([shardId, entry]) => [shardId, entry.receipt.payloadHash] as const),
    );
    state.frozenDurableShardIds = new Set(frozenDurableShardPayloadHashes.keys());
    state.frozenDurableShardPayloadHashes = frozenDurableShardPayloadHashes;
    state.frozenDurableCommit = state.commit?.durable ?? false;
    state.frozenDurableCommitPayloadHash = state.commit?.durable
      ? state.commit.receipt.payloadHash
      : null;
    state.frozenDurableCommitSelection = state.commit?.durable
      ? Object.freeze([...state.commit.commit.selectedShardHashes])
      : null;
  }

  durableProposal(turnId: string): CouncilProposalSnapshot {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    const durableEntries = [...state.shards.values()]
      .filter((entry) =>
        entry.durable &&
        (!state.selectionBarrierClosed ||
          (state.frozenDurableShardIds?.has(entry.shard.shardId) === true &&
            state.frozenDurableShardPayloadHashes?.get(entry.shard.shardId) ===
              entry.receipt.payloadHash)))
      .sort((left, right) =>
        left.receipt.acceptanceSequence - right.receipt.acceptanceSequence);
    const durableShards = durableEntries.map((entry) => ({
      shard: snapshot(entry.shard),
      payloadHash: entry.receipt.payloadHash,
      acceptanceSequence: entry.receipt.acceptanceSequence,
    }));
    const selectedShardHashes = state.selectionBarrierClosed
      ? state.frozenDurableCommitSelection ?? state.commit?.commit.selectedShardHashes ?? []
      : state.commit?.commit.selectedShardHashes ?? [];
    const selectedEntries = selectedShardHashes.map((payloadHash) =>
      durableEntries.find((entry) => entry.receipt.payloadHash === payloadHash));
    const selectedEntriesComplete =
      selectedShardHashes.length > 0 &&
      new Set(selectedShardHashes).size === selectedShardHashes.length &&
      selectedEntries.every((entry): entry is AcceptedShard => entry !== undefined);
    const completeSelectedEntries = selectedEntries.filter(
      (entry): entry is AcceptedShard => entry !== undefined,
    );
    const requiredRolesSelected = selectedEntriesComplete &&
      state.turn.requiredRoles.every((role) =>
        completeSelectedEntries.some((entry) => entry.shard.role === role));
    const acceptedCommit = state.commit;
    const frozenCommitAuthorityMatches =
      acceptedCommit?.durable === true &&
      state.frozenDurableCommitPayloadHash === acceptedCommit.receipt.payloadHash &&
      state.frozenDurableCommitSelection !== null;
    const durableCommit =
      frozenCommitAuthorityMatches &&
      state.selectionBarrierClosed &&
      state.frozenDurableCommit &&
      requiredRolesSelected
        ? {
            commit: snapshot(acceptedCommit.commit),
            payloadHash: acceptedCommit.receipt.payloadHash,
          }
        : null;
    return deepFreeze({
      turn: state.turn,
      selectionBarrierClosed: state.selectionBarrierClosed,
      durableShards,
      durableCommit,
    });
  }

  closeTurn(turnId: string): void {
    const state = this.turns.get(turnId);
    if (state === undefined) throw new Error('PACT_COUNCIL_TURN_NOT_OPEN');
    state.closed = true;
    this.options.submissions.closeTurn(turnId);
  }
}

/** @internal Sibling-module capability; intentionally omitted from the package root. */
export const councilRegistryRecoveryCapability = (
  registry: CouncilRegistry,
): CouncilRegistryRecoveryCapability => {
  const capability = recoveryCapabilities.get(registry);
  if (capability === undefined) {
    throw new Error('PACT_COUNCIL_RECOVERY_REGISTRY_MISMATCH');
  }
  return capability;
};
