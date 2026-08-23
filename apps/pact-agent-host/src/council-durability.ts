import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';

import type { CouncilShard } from './contract-types.js';
import {
  PactDurabilityError,
} from './durable-turn.js';
import type {
  AcceptedCouncilCommitReceipt,
  AcceptedCouncilShardReceipt,
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
  readonly session: Session;
  readonly turn: FrozenCouncilTurn;
  readonly shard: CouncilShard;
  readonly shardPayloadHash: string;
  readonly acceptanceSequence: number;
  readonly now: () => number;
  /** Optional persistence scope for callers that need a flush/inspect barrier. */
  readonly ctx?: Context;
}

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
  try {
    return await ctx.sessionPersistence.inspect(session.id);
  } catch (error) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INSPECT_FAILED',
      `${label} could not be inspected after flush`,
      { cause: error },
    );
  }
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

const acceptedShardEvent = (
  events: readonly SessionEvent[],
  receipt: AcceptedCouncilShardReceipt,
) => {
  const event = events.find(
    (candidate) => candidate.seq === receipt.shardEventSeq,
  );
  if (
    event === undefined ||
    event.type !== 'pact/council-shard' ||
    event.data.turnId !== receipt.turnId ||
    event.data.shardId !== receipt.shardId ||
    event.data.payloadHash !== receipt.payloadHash ||
    event.data.acceptanceSequence !== receipt.acceptanceSequence
  ) {
    return undefined;
  }
  return event;
};

const linkedTraceEvent = (
  events: readonly SessionEvent[],
  receipt: AcceptedCouncilShardReceipt,
) => {
  if (!receipt.projectedTrace || receipt.traceEventSeq === null) return true;
  const event = events.find(
    (candidate) => candidate.seq === receipt.traceEventSeq,
  );
  if (
    event === undefined ||
    event.type !== 'pact/public-trace' ||
    event.data.turnId !== receipt.turnId ||
    event.data.sourceContributionHash !== receipt.payloadHash ||
    event.data.acceptanceSequence !== receipt.acceptanceSequence ||
    event.data.phase !== 'COUNCIL' ||
    event.data.provisional !== true
  ) {
    return false;
  }
  return true;
};

export const durableCouncilShard = async (
  input: DurableCouncilShardInput,
): Promise<DurableCouncilShardReceipt> => {
  const inspected = await inspectAfterFlush(
    input.ctx,
    input.session,
    `council shard ${input.receipt.shardId}`,
  );
  if (
    acceptedShardEvent(inspected.events, input.receipt) === undefined ||
    !linkedTraceEvent(inspected.events, input.receipt)
  ) {
    incomplete(`council shard ${input.receipt.shardId}`);
  }
  const lastSeq = lastSeqOf(
    inspected.events,
    `council shard ${input.receipt.shardId}`,
  );
  const durable = Object.freeze({
    ...input.receipt,
    status: 'DURABLE' as const,
    sessionId: String(input.session.id),
    lastSeq,
  });
  input.registry.markShardDurable(durable);
  return durable;
};

const acceptedCommitEvent = (
  events: readonly SessionEvent[],
  receipt: AcceptedCouncilCommitReceipt,
) => {
  const event = events.find(
    (candidate) => candidate.seq === receipt.commitEventSeq,
  );
  if (
    event === undefined ||
    event.type !== 'pact/conductor-commit' ||
    event.data.turnId !== receipt.turnId ||
    event.data.payloadHash !== receipt.payloadHash
  ) {
    return undefined;
  }
  return event;
};

export const durableConductorCommit = async (
  input: DurableConductorCommitInput,
): Promise<DurableConductorCommitReceipt> => {
  const inspected = await inspectAfterFlush(
    input.ctx,
    input.session,
    `conductor commit ${input.receipt.turnId}`,
  );
  if (acceptedCommitEvent(inspected.events, input.receipt) === undefined) {
    incomplete(`conductor commit ${input.receipt.turnId}`);
  }
  const lastSeq = lastSeqOf(
    inspected.events,
    `conductor commit ${input.receipt.turnId}`,
  );
  const durable = Object.freeze({
    ...input.receipt,
    status: 'DURABLE' as const,
    sessionId: String(input.session.id),
    lastSeq,
  });
  input.registry.markCommitDurable(durable);
  return durable;
};

const recoveryShardEvent = (
  events: readonly SessionEvent[],
  input: {
    readonly turn: FrozenCouncilTurn;
    readonly shard: CouncilShard;
    readonly shardPayloadHash: string;
  },
): SessionEvent<'pact/council-shard'> | undefined => events.find(
  (event): event is SessionEvent<'pact/council-shard'> =>
    event.type === 'pact/council-shard' &&
    event.data.caseSessionId === input.turn.snapshot.caseSessionId &&
    event.data.turnId === input.turn.snapshot.turnId &&
    event.data.shardId === input.shard.shardId &&
    event.data.payloadHash === input.shardPayloadHash,
);

export const recoverCouncilTraceProjection = async (
  input: CouncilTraceRecoveryInput,
): Promise<{ readonly appended: boolean; readonly traceEventSeq: number }> => {
  let coldEvents: readonly SessionEvent[];
  if (input.ctx === undefined) {
    coldEvents = input.session.events;
  } else {
    try {
      coldEvents = (await input.ctx.sessionPersistence.inspect(input.session.id)).events;
    } catch (error) {
      throw new PactDurabilityError(
        'PACT_DURABILITY_INSPECT_FAILED',
        `recovery shard ${input.shard.shardId} could not be cold-inspected`,
        { cause: error },
      );
    }
  }
  const computedShardPayloadHash = await sha256Canonical(input.shard);
  if (computedShardPayloadHash !== input.shardPayloadHash) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const shardEvent = recoveryShardEvent(coldEvents, input);
  if (
    shardEvent === undefined ||
    shardEvent.data.acceptanceSequence !== input.acceptanceSequence
  ) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INCOMPLETE',
      `recovery shard ${input.shard.shardId} is missing its accepted event or linked projection`,
    );
  }
  try {
    if (await sha256Canonical(shardEvent.data.payload) !== input.shardPayloadHash) {
      incomplete(`recovery shard ${input.shard.shardId}`);
    }
  } catch {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  if (input.shard.role !== 'Witness' && input.shard.role !== 'Rewriter') {
    return { appended: false, traceEventSeq: -1 };
  }
  const existing = coldEvents.find((event) =>
    event.type === 'pact/public-trace' &&
    event.data.caseSessionId === input.turn.snapshot.caseSessionId &&
    event.data.turnId === input.turn.snapshot.turnId &&
    event.data.role === input.shard.role &&
    event.data.text === input.shard.publicTrace &&
    event.data.sourceContributionHash === input.shardPayloadHash &&
    event.data.acceptanceSequence === input.acceptanceSequence &&
    event.data.phase === 'COUNCIL' &&
    event.data.provisional === true
  );
  const verifyDurableTrace = async (traceEventSeq: number): Promise<void> => {
    if (input.ctx === undefined) return;
    const inspected = await inspectAfterFlush(
      input.ctx,
      input.session,
      `recovery trace ${input.shard.shardId}`,
    );
    const persisted = inspected.events.find((event) =>
      event.seq === traceEventSeq &&
      event.type === 'pact/public-trace' &&
      event.data.caseSessionId === input.turn.snapshot.caseSessionId &&
      event.data.turnId === input.turn.snapshot.turnId &&
      event.data.role === input.shard.role &&
      event.data.text === input.shard.publicTrace &&
      event.data.sourceContributionHash === input.shardPayloadHash &&
      event.data.acceptanceSequence === input.acceptanceSequence &&
      event.data.phase === 'COUNCIL' &&
      event.data.provisional === true
    );
    if (persisted === undefined) incomplete(`recovery trace ${input.shard.shardId}`);
  };
  if (existing !== undefined) {
    await verifyDurableTrace(existing.seq);
    return { appended: false, traceEventSeq: existing.seq };
  }

  const projectedAtMonotonicMs = input.now();
  const traceEvent = input.session.append('pact/public-trace', {
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
  await verifyDurableTrace(traceEvent.seq);
  return { appended: true, traceEventSeq: traceEvent.seq };
};
