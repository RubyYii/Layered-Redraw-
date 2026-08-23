import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import {
  sha256Canonical,
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';

import type {
  CouncilShard,
  ConductorDraftCommit,
} from './contract-types.js';
import { PactDurabilityError } from './durable-turn.js';
import {
  COUNCIL_DURABILITY_PROOF as RECEIPT_PROOF,
} from './council-registry.js';
import type {
  AcceptedCouncilCommitReceipt,
  AcceptedCouncilCommitContext,
  AcceptedCouncilShardContext,
  AcceptedCouncilShardReceipt,
  CouncilDurabilityProof,
  CouncilRegistry,
  DurableConductorCommitReceipt,
  DurableCouncilShardReceipt,
} from './council-registry.js';
import type { FrozenCouncilTurn } from './council-turn.js';

interface CouncilDurabilityInput {
  readonly ctx: Context;
  readonly registry: CouncilRegistry;
  readonly session: Session;
}

export interface DurableCouncilShardInput extends CouncilDurabilityInput {
  readonly receipt: AcceptedCouncilShardReceipt;
}

export interface DurableConductorCommitInput extends CouncilDurabilityInput {
  readonly receipt: AcceptedCouncilCommitReceipt;
}

interface CouncilTraceRecoveryInput {
  readonly ctx: Context;
  readonly session: Session;
  readonly turn: FrozenCouncilTurn;
  readonly shard: CouncilShard;
  readonly shardPayloadHash: string;
  readonly acceptanceSequence: number;
  readonly now: () => number;
}

const inspectCold = async (
  ctx: Context,
  session: Session,
  label: string,
) => {
  try {
    return await ctx.sessionPersistence.inspect(session.id);
  } catch (error) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INSPECT_FAILED',
      `${label} could not be cold-inspected`,
      { cause: error },
    );
  }
};

const inspectAfterFlush = async (
  ctx: Context,
  session: Session,
  label: string,
) => {
  try {
    const participated = await ctx.sessions.flush(session);
    if (!participated) throw new Error('no session persistence listener participated');
  } catch (error) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_FLUSH_FAILED',
      `${label} could not cross the flush barrier`,
      { cause: error },
    );
  }
  return inspectCold(ctx, session, `${label} after flush`);
};

const incomplete = (label: string): never => {
  throw new PactDurabilityError(
    'PACT_DURABILITY_INCOMPLETE',
    `${label} is missing its accepted event or linked projection`,
  );
};

const lastSeqOf = (events: readonly SessionEvent[], label: string): number => {
  const lastEvent = events.at(-1);
  if (lastEvent === undefined) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INCOMPLETE',
      `${label} is missing its accepted event or linked projection`,
    );
  }
  return lastEvent.seq;
};

const canonicalHash = async (value: unknown): Promise<string | undefined> => {
  try {
    return await sha256Canonical(value);
  } catch {
    return undefined;
  }
};

const shardMatchesTurn = (
  shard: CouncilShard,
  turn: FrozenCouncilTurn,
  sessionId?: string,
): boolean =>
  shard.caseSessionId === turn.snapshot.caseSessionId &&
  shard.turnId === turn.snapshot.turnId &&
  shard.snapshotHash === turn.snapshotHash &&
  shard.parentSceneHash === turn.snapshot.parentSceneHash &&
  shard.registryVersion === turn.snapshot.registryVersion &&
  shard.routingManifestVersion === turn.snapshot.routingManifestVersion &&
  shard.deadlineId === turn.snapshot.deadlineId &&
  (sessionId === undefined || shard.childSessionId === sessionId);

const acceptedShardEvent = async (
  events: readonly SessionEvent[],
  receipt: AcceptedCouncilShardReceipt,
  expected: {
    readonly turn: FrozenCouncilTurn;
    readonly shard: CouncilShard;
    readonly sessionId: string;
  },
) => {
  const event = events.find(
    (candidate) => candidate.seq === receipt.shardEventSeq,
  );
  if (
    event === undefined ||
    event.type !== 'pact/council-shard' ||
    event.data.caseSessionId !== expected.turn.snapshot.caseSessionId ||
    event.data.turnId !== expected.turn.snapshot.turnId ||
    event.data.shardId !== expected.shard.shardId ||
    event.data.role !== expected.shard.role ||
    event.data.payloadHash !== receipt.payloadHash ||
    event.data.acceptanceSequence !== receipt.acceptanceSequence
  ) {
    return undefined;
  }
  try {
    validateCouncilShard(event.data.payload);
  } catch {
    return undefined;
  }
  const persistedShard = event.data.payload as unknown as CouncilShard;
  const [persistedHash, expectedHash] = await Promise.all([
    canonicalHash(persistedShard),
    canonicalHash(expected.shard),
  ]);
  if (
    persistedHash === undefined ||
    expectedHash === undefined ||
    persistedHash !== event.data.payloadHash ||
    persistedHash !== receipt.payloadHash ||
    expectedHash !== receipt.payloadHash ||
    !shardMatchesTurn(persistedShard, expected.turn, expected.sessionId) ||
    !shardMatchesTurn(expected.shard, expected.turn, expected.sessionId)
  ) {
    return undefined;
  }
  return event;
};

const linkedTraceEvent = (
  events: readonly SessionEvent[],
  receipt: AcceptedCouncilShardReceipt,
  expected: {
    readonly turn: FrozenCouncilTurn;
    readonly shard: CouncilShard;
  },
): boolean => {
  if (!receipt.projectedTrace) return true;
  if (receipt.traceEventSeq === null) return false;
  const event = events.find(
    (candidate) => candidate.seq === receipt.traceEventSeq,
  );
  return event !== undefined &&
    event.type === 'pact/public-trace' &&
    event.data.caseSessionId === expected.turn.snapshot.caseSessionId &&
    event.data.turnId === expected.turn.snapshot.turnId &&
    event.data.role === expected.shard.role &&
    event.data.text === expected.shard.publicTrace &&
    event.data.sourceContributionHash === receipt.payloadHash &&
    event.data.acceptanceSequence === receipt.acceptanceSequence &&
    event.data.phase === 'COUNCIL' &&
    event.data.provisional === true;
};

const brandDurableReceipt = <T extends object>(
  receipt: T,
): T & CouncilDurabilityProof => {
  Object.defineProperty(receipt, RECEIPT_PROOF, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return Object.freeze(receipt) as T & CouncilDurabilityProof;
};

export const durableCouncilShard = async (
  input: DurableCouncilShardInput,
): Promise<DurableCouncilShardReceipt> => {
  let expected: AcceptedCouncilShardContext | undefined;
  try {
    expected = input.registry.acceptedShardContext(input.receipt);
  } catch {
    incomplete(`council shard ${input.receipt.shardId}`);
  }
  if (expected === undefined) {
    return incomplete(`council shard ${input.receipt.shardId}`);
  }
  if (expected.sessionId !== String(input.session.id)) {
    incomplete(`council shard ${input.receipt.shardId}`);
  }
  const inspected = await inspectAfterFlush(
    input.ctx,
    input.session,
    `council shard ${input.receipt.shardId}`,
  );
  const shardEvent = await acceptedShardEvent(
    inspected.events,
    input.receipt,
    expected,
  );
  if (
    shardEvent === undefined ||
    !linkedTraceEvent(inspected.events, input.receipt, expected)
  ) {
    incomplete(`council shard ${input.receipt.shardId}`);
  }
  const lastSeq = lastSeqOf(
    inspected.events,
    `council shard ${input.receipt.shardId}`,
  );
  const durable = brandDurableReceipt({
    ...input.receipt,
    status: 'DURABLE' as const,
    sessionId: String(input.session.id),
    lastSeq,
  });
  input.registry.markShardDurable(durable);
  return durable;
};

const acceptedCommitEvent = async (
  events: readonly SessionEvent[],
  receipt: AcceptedCouncilCommitReceipt,
  expected: {
    readonly turn: FrozenCouncilTurn;
    readonly commit: ConductorDraftCommit;
  },
) => {
  const event = events.find(
    (candidate) => candidate.seq === receipt.commitEventSeq,
  );
  if (
    event === undefined ||
    event.type !== 'pact/conductor-commit' ||
    event.data.turnId !== expected.turn.snapshot.turnId ||
    event.data.payloadHash !== receipt.payloadHash
  ) {
    return undefined;
  }
  try {
    validateConductorDraftCommit(event.data.payload);
  } catch {
    return undefined;
  }
  const [persistedHash, expectedHash] = await Promise.all([
    canonicalHash(event.data.payload),
    canonicalHash(expected.commit),
  ]);
  if (
    persistedHash === undefined ||
    expectedHash === undefined ||
    persistedHash !== event.data.payloadHash ||
    persistedHash !== receipt.payloadHash ||
    expectedHash !== receipt.payloadHash ||
    (event.data.payload as unknown as ConductorDraftCommit).turnId !==
      expected.turn.snapshot.turnId
  ) {
    return undefined;
  }
  return event;
};

export const durableConductorCommit = async (
  input: DurableConductorCommitInput,
): Promise<DurableConductorCommitReceipt> => {
  let expected: AcceptedCouncilCommitContext | undefined;
  try {
    expected = input.registry.acceptedCommitContext(input.receipt);
  } catch {
    incomplete(`conductor commit ${input.receipt.turnId}`);
  }
  if (expected === undefined) {
    return incomplete(`conductor commit ${input.receipt.turnId}`);
  }
  if (expected.sessionId !== String(input.session.id)) {
    incomplete(`conductor commit ${input.receipt.turnId}`);
  }
  const inspected = await inspectAfterFlush(
    input.ctx,
    input.session,
    `conductor commit ${input.receipt.turnId}`,
  );
  if (
    await acceptedCommitEvent(inspected.events, input.receipt, expected) ===
    undefined
  ) {
    incomplete(`conductor commit ${input.receipt.turnId}`);
  }
  const lastSeq = lastSeqOf(
    inspected.events,
    `conductor commit ${input.receipt.turnId}`,
  );
  const durable = brandDurableReceipt({
    ...input.receipt,
    status: 'DURABLE' as const,
    sessionId: String(input.session.id),
    lastSeq,
  });
  input.registry.markCommitDurable(durable);
  return durable;
};

interface RecoveryCandidate {
  readonly event: SessionEvent<'pact/council-shard'>;
  readonly shard: CouncilShard;
}

const councilShardCandidate = async (
  event: SessionEvent,
  turn: FrozenCouncilTurn,
): Promise<RecoveryCandidate | undefined> => {
  if (
    event.type !== 'pact/council-shard' ||
    event.data.caseSessionId !== turn.snapshot.caseSessionId ||
    event.data.turnId !== turn.snapshot.turnId
  ) {
    return undefined;
  }
  try {
    validateCouncilShard(event.data.payload);
  } catch {
    return undefined;
  }
  const shard = event.data.payload as unknown as CouncilShard;
  const payloadHash = await canonicalHash(shard);
  if (
    payloadHash === undefined ||
    payloadHash !== event.data.payloadHash ||
    event.data.shardId !== shard.shardId ||
    event.data.role !== shard.role ||
    event.data.caseSessionId !== shard.caseSessionId ||
    event.data.turnId !== shard.turnId ||
    !shardMatchesTurn(shard, turn)
  ) {
    return undefined;
  }
  return { event, shard };
};

const exactCouncilTrace = (
  event: SessionEvent,
  turn: FrozenCouncilTurn,
  shard: CouncilShard,
  payloadHash: string,
  acceptanceSequence: number,
): boolean =>
  event.type === 'pact/public-trace' &&
  event.data.caseSessionId === turn.snapshot.caseSessionId &&
  event.data.turnId === turn.snapshot.turnId &&
  event.data.role === shard.role &&
  event.data.text === shard.publicTrace &&
  event.data.sourceContributionHash === payloadHash &&
  event.data.acceptanceSequence === acceptanceSequence &&
  event.data.phase === 'COUNCIL' &&
  event.data.provisional === true;

const assertRecoveryIdentity = async (
  input: CouncilTraceRecoveryInput,
): Promise<void> => {
  try {
    validateCouncilShard(input.shard);
  } catch {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const computedShardPayloadHash = await canonicalHash(input.shard);
  if (
    computedShardPayloadHash !== input.shardPayloadHash ||
    !shardMatchesTurn(input.shard, input.turn, String(input.session.id)) ||
    !input.turn.requiredRoles.includes(input.shard.role)
  ) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
};

const recoveryTraceAfterFlush = async (
  input: CouncilTraceRecoveryInput,
  label: string,
  shard: CouncilShard,
  payloadHash: string,
  acceptanceSequence: number,
): Promise<number> => {
  const inspected = await inspectAfterFlush(input.ctx, input.session, label);
  const persisted = inspected.events.find((event) =>
    exactCouncilTrace(
      event,
      input.turn,
      shard,
      payloadHash,
      acceptanceSequence,
    ));
  if (persisted === undefined) return incomplete(label);
  return persisted.seq;
};

export const recoverCouncilTraceProjection = async (
  input: CouncilTraceRecoveryInput,
): Promise<{ readonly appended: boolean; readonly traceEventSeq: number }> => {
  if (input.ctx === undefined) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INCOMPLETE',
      `recovery shard ${input.shard.shardId} requires DSH persistence context`,
    );
  }
  await assertRecoveryIdentity(input);
  const cold = await inspectCold(
    input.ctx,
    input.session,
    `recovery shard ${input.shard.shardId}`,
  );
  const candidates = (await Promise.all(
    cold.events.map((event) => councilShardCandidate(event, input.turn)),
  ))
    .filter((candidate): candidate is RecoveryCandidate => candidate !== undefined)
    .sort((left, right) =>
      left.event.data.acceptanceSequence - right.event.data.acceptanceSequence ||
      left.event.seq - right.event.seq);
  let caller: RecoveryCandidate | undefined;
  for (const candidate of candidates) {
    if (
      candidate.event.data.shardId === input.shard.shardId &&
      candidate.event.data.payloadHash === input.shardPayloadHash &&
      candidate.event.data.acceptanceSequence === input.acceptanceSequence &&
      candidate.shard.childSessionId === String(input.session.id) &&
      (await canonicalHash(candidate.shard)) === input.shardPayloadHash
    ) {
      caller = candidate;
      break;
    }
  }
  if (caller === undefined) {
    return incomplete(`recovery shard ${input.shard.shardId}`);
  }
  if (input.shard.role !== 'Witness' && input.shard.role !== 'Rewriter') {
    return { appended: false, traceEventSeq: -1 };
  }
  const eligibleCandidates = candidates.filter((candidate) =>
    candidate.shard.role === 'Witness' || candidate.shard.role === 'Rewriter');
  const earliest = eligibleCandidates[0];
  if (earliest === undefined) {
    return { appended: false, traceEventSeq: -1 };
  }
  const councilTraces = cold.events.filter((event) =>
    event.type === 'pact/public-trace' &&
    event.data.caseSessionId === input.turn.snapshot.caseSessionId &&
    event.data.turnId === input.turn.snapshot.turnId &&
    event.data.phase === 'COUNCIL' &&
    event.data.provisional === true,
  );
  const earliestTrace = councilTraces.find((event) =>
    exactCouncilTrace(
      event,
      input.turn,
      earliest.shard,
      earliest.event.data.payloadHash,
      earliest.event.data.acceptanceSequence,
    ));

  if (caller.event.seq !== earliest.event.seq) {
    if (earliestTrace !== undefined) {
      const traceEventSeq = await recoveryTraceAfterFlush(
        input,
        `recovery trace ${earliest.shard.shardId}`,
        earliest.shard,
        earliest.event.data.payloadHash,
        earliest.event.data.acceptanceSequence,
      );
      return { appended: false, traceEventSeq };
    }
    return { appended: false, traceEventSeq: -1 };
  }
  if (earliestTrace !== undefined) {
    const traceEventSeq = await recoveryTraceAfterFlush(
      input,
      `recovery trace ${input.shard.shardId}`,
      input.shard,
      input.shardPayloadHash,
      input.acceptanceSequence,
    );
    return { appended: false, traceEventSeq };
  }
  const conflictingTrace = councilTraces.at(0);
  if (conflictingTrace !== undefined) {
    return { appended: false, traceEventSeq: conflictingTrace.seq };
  }

  const projectedAtMonotonicMs = input.now();
  input.session.append('pact/public-trace', {
    caseSessionId: input.turn.snapshot.caseSessionId,
    turnId: input.turn.snapshot.turnId,
    role: input.shard.role,
    text: input.shard.publicTrace,
    sourceContributionHash: input.shardPayloadHash,
    acceptanceSequence: input.acceptanceSequence,
    phase: 'COUNCIL' as const,
    provisional: true as const,
    projectedAtMonotonicMs,
  });
  const traceEventSeq = await recoveryTraceAfterFlush(
    input,
    `recovery trace ${input.shard.shardId}`,
    input.shard,
    input.shardPayloadHash,
    input.acceptanceSequence,
  );
  return { appended: true, traceEventSeq };
};
