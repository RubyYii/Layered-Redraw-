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
  councilRegistryRecoveryCapability,
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
  readonly registry: CouncilRegistry;
  readonly acceptedSessions: readonly Session[];
  readonly session: Session;
  readonly turn: FrozenCouncilTurn;
  readonly shard: CouncilShard;
  readonly shardPayloadHash: string;
  readonly acceptanceSequence: number;
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
  expected: AcceptedCouncilShardContext,
) => {
  const receipt = expected.receipt;
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
  expected: AcceptedCouncilShardContext,
): boolean => {
  const receipt = expected.receipt;
  if (!receipt.projectedTrace) return true;
  if (receipt.traceEventSeq === null) return false;
  if (expected.projectionAtMonotonicMs === null) return false;
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
    event.data.provisional === true &&
    event.data.projectedAtMonotonicMs === expected.projectionAtMonotonicMs;
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
    councilRegistryRecoveryCapability(input.registry)
      .assertCanonicalShardSession(input.receipt, input.session);
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
    expected,
  );
  if (
    shardEvent === undefined ||
    !linkedTraceEvent(inspected.events, expected)
  ) {
    incomplete(`council shard ${input.receipt.shardId}`);
  }
  const lastSeq = lastSeqOf(
    inspected.events,
    `council shard ${input.receipt.shardId}`,
  );
  const durable = brandDurableReceipt({
    ...expected.receipt,
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
    councilRegistryRecoveryCapability(input.registry)
      .assertCanonicalCommitSession(input.receipt, input.session);
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
  readonly context: AcceptedCouncilShardContext;
  readonly event: SessionEvent<'pact/council-shard'>;
  readonly shard: CouncilShard;
}

interface RecoveryScope {
  readonly contexts: readonly AcceptedCouncilShardContext[];
  readonly sessionsById: ReadonlyMap<string, Session>;
}

interface RecoveryTraceRecord {
  readonly session: Session;
  readonly event: SessionEvent<'pact/public-trace'>;
  readonly candidate: RecoveryCandidate;
}

const councilShardCandidate = async (
  event: SessionEvent,
  context: AcceptedCouncilShardContext,
  turn: FrozenCouncilTurn,
): Promise<RecoveryCandidate | undefined> => {
  const receipt = context.receipt;
  if (
    event.type !== 'pact/council-shard' ||
    event.seq !== receipt.shardEventSeq ||
    event.data.caseSessionId !== turn.snapshot.caseSessionId ||
    event.data.turnId !== turn.snapshot.turnId ||
    event.data.shardId !== context.shard.shardId ||
    event.data.role !== context.shard.role ||
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
  const shard = event.data.payload as unknown as CouncilShard;
  const [payloadHash, contextHash] = await Promise.all([
    canonicalHash(shard),
    canonicalHash(context.shard),
  ]);
  if (
    payloadHash === undefined ||
    contextHash === undefined ||
    payloadHash !== event.data.payloadHash ||
    payloadHash !== receipt.payloadHash ||
    contextHash !== receipt.payloadHash ||
    !shardMatchesTurn(shard, turn, context.sessionId) ||
    !shardMatchesTurn(context.shard, turn, context.sessionId)
  ) {
    return undefined;
  }
  return { context, event, shard };
};

const exactCouncilTrace = (
  event: SessionEvent,
  turn: FrozenCouncilTurn,
  shard: CouncilShard,
  payloadHash: string,
  acceptanceSequence: number,
  projectedAtMonotonicMs?: number,
): boolean =>
  event.type === 'pact/public-trace' &&
  event.data.caseSessionId === turn.snapshot.caseSessionId &&
  event.data.turnId === turn.snapshot.turnId &&
  event.data.role === shard.role &&
  event.data.text === shard.publicTrace &&
  event.data.sourceContributionHash === payloadHash &&
  event.data.acceptanceSequence === acceptanceSequence &&
  event.data.phase === 'COUNCIL' &&
  event.data.provisional === true &&
  typeof event.data.projectedAtMonotonicMs === 'number' &&
  Number.isFinite(event.data.projectedAtMonotonicMs) &&
  (projectedAtMonotonicMs === undefined ||
    event.data.projectedAtMonotonicMs === projectedAtMonotonicMs);

const assertRecoveryTurn = async (
  input: CouncilTraceRecoveryInput,
): Promise<FrozenCouncilTurn> => {
  let registeredTurn: FrozenCouncilTurn;
  try {
    registeredTurn = input.registry.frozenTurn(input.turn.snapshot.turnId);
  } catch {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const [inputSnapshotHash, registeredSnapshotHash, inputTurnHash, registeredTurnHash] =
    await Promise.all([
      canonicalHash(input.turn.snapshot),
      canonicalHash(registeredTurn!.snapshot),
      canonicalHash(input.turn),
      canonicalHash(registeredTurn!),
    ]);
  if (
    inputSnapshotHash === undefined ||
    registeredSnapshotHash === undefined ||
    inputTurnHash === undefined ||
    registeredTurnHash === undefined ||
    inputSnapshotHash !== input.turn.snapshotHash ||
    registeredSnapshotHash !== registeredTurn!.snapshotHash ||
    inputSnapshotHash !== registeredSnapshotHash ||
    inputTurnHash !== registeredTurnHash
  ) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  return registeredTurn!;
};

const assertRecoveryScope = (
  input: CouncilTraceRecoveryInput,
  registeredTurn: FrozenCouncilTurn,
): RecoveryScope => {
  if (input.acceptedSessions.length === 0) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const sessionsById = new Map<string, Session>();
  for (const session of input.acceptedSessions) {
    const id = String(session.id);
    if (sessionsById.has(id)) {
      incomplete(`recovery shard ${input.shard.shardId}`);
    }
    try {
      const binding = input.registry.submissions.bindingFor(session.id);
      if (!binding.role) incomplete(`recovery shard ${input.shard.shardId}`);
    } catch {
      incomplete(`recovery shard ${input.shard.shardId}`);
    }
    sessionsById.set(id, session);
  }
  if (sessionsById.get(String(input.session.id)) !== input.session) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const contexts = input.registry.acceptedCouncilShardContexts(
    registeredTurn.snapshot.turnId,
  );
  if (contexts.length === 0) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const recoveryCapability = councilRegistryRecoveryCapability(input.registry);
  const canonicalSessions = (() => {
    try {
      return recoveryCapability.canonicalShardSessions(
        registeredTurn.snapshot.turnId,
      );
    } catch {
      return incomplete(`recovery shard ${input.shard.shardId}`);
    }
  })();
  const expectedSessionIds = new Set(contexts.map((context) => context.sessionId));
  const suppliedSessionIds = new Set(sessionsById.keys());
  if (
    expectedSessionIds.size !== suppliedSessionIds.size ||
    [...expectedSessionIds].some((sessionId) => !suppliedSessionIds.has(sessionId)) ||
    [...suppliedSessionIds].some((sessionId) => !expectedSessionIds.has(sessionId))
  ) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  if (
    canonicalSessions.length !== sessionsById.size ||
    canonicalSessions.some((canonicalSession) =>
      sessionsById.get(String(canonicalSession.id)) !== canonicalSession)
  ) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  for (const context of contexts) {
    if (!sessionsById.has(context.sessionId)) {
      incomplete(`recovery shard ${input.shard.shardId}`);
    }
    try {
      const boundSession = sessionsById.get(context.sessionId);
      if (boundSession === undefined) {
        incomplete(`recovery shard ${input.shard.shardId}`);
      }
      if (
        recoveryCapability.canonicalShardSession(context.receipt) !==
        boundSession
      ) {
        incomplete(`recovery shard ${input.shard.shardId}`);
      }
      const binding = input.registry.submissions.bindingFor(
        boundSession!.id,
      );
      if (
        binding.role !== context.shard.role ||
        context.shard.childSessionId !== context.sessionId
      ) {
        incomplete(`recovery shard ${input.shard.shardId}`);
      }
    } catch {
      incomplete(`recovery shard ${input.shard.shardId}`);
    }
  }
  return { contexts, sessionsById };
};

const assertRecoveryIdentity = async (
  input: CouncilTraceRecoveryInput,
  registeredTurn: FrozenCouncilTurn,
  scope: RecoveryScope,
): Promise<AcceptedCouncilShardContext> => {
  const recoveryCapability = councilRegistryRecoveryCapability(input.registry);
  try {
    validateCouncilShard(input.shard);
  } catch {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const computedShardPayloadHash = await canonicalHash(input.shard);
  const context = scope.contexts.find((candidate) =>
    candidate.sessionId === String(input.session.id) &&
    candidate.shard.shardId === input.shard.shardId &&
    candidate.receipt.payloadHash === input.shardPayloadHash &&
    candidate.receipt.acceptanceSequence === input.acceptanceSequence);
  let binding;
  try {
    binding = input.registry.submissions.bindingFor(input.session.id);
  } catch {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  if (
    context === undefined ||
    computedShardPayloadHash === undefined ||
    computedShardPayloadHash !== input.shardPayloadHash ||
    context.shard.role !== input.shard.role ||
    context.shard.childSessionId !== String(input.session.id) ||
    recoveryCapability.canonicalShardSession(context.receipt) !== input.session ||
    binding!.role !== context.shard.role ||
    !shardMatchesTurn(input.shard, registeredTurn, String(input.session.id)) ||
    !shardMatchesTurn(context.shard, registeredTurn, context.sessionId) ||
    (await canonicalHash(context.shard)) !== context.receipt.payloadHash
  ) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  return context!;
};

const recoveryTraceAfterFlush = async (
  input: CouncilTraceRecoveryInput,
  session: Session,
  label: string,
  turn: FrozenCouncilTurn,
  shard: CouncilShard,
  payloadHash: string,
  acceptanceSequence: number,
  projectedAtMonotonicMs: number,
): Promise<number> => {
  const inspected = await inspectAfterFlush(input.ctx, session, label);
  const persisted = inspected.events.find((event) =>
    exactCouncilTrace(
      event,
      turn,
      shard,
      payloadHash,
      acceptanceSequence,
      projectedAtMonotonicMs,
    ));
  if (persisted === undefined) return incomplete(label);
  return persisted.seq;
};

export const recoverCouncilTraceProjection = async (
  input: CouncilTraceRecoveryInput,
): Promise<{ readonly appended: boolean; readonly traceEventSeq: number }> => {
  if (input?.ctx === undefined) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INCOMPLETE',
      `recovery shard ${input?.shard?.shardId ?? 'unknown'} requires DSH persistence context`,
    );
  }
  if (input.registry === undefined || input.acceptedSessions === undefined) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const registeredTurn = await assertRecoveryTurn(input);
  const scope = assertRecoveryScope(input, registeredTurn);
  const callerContext = await assertRecoveryIdentity(
    input,
    registeredTurn,
    scope,
  );

  const coldBySession = new Map<string, readonly SessionEvent[]>();
  for (const session of input.acceptedSessions) {
    const inspected = await inspectCold(
      input.ctx,
      session,
      `recovery session ${String(session.id)}`,
    );
    coldBySession.set(String(session.id), inspected.events);
  }

  const candidates: RecoveryCandidate[] = [];
  for (const context of scope.contexts) {
    const events = coldBySession.get(context.sessionId);
    const acceptedEvent = events?.find(
      (event) => event.seq === context.receipt.shardEventSeq,
    );
    const candidate = acceptedEvent === undefined
      ? undefined
      : await councilShardCandidate(acceptedEvent, context, registeredTurn);
    if (candidate === undefined) {
      incomplete(`recovery shard ${input.shard.shardId}`);
    }
    candidates.push(candidate!);
  }
  candidates.sort((left, right) =>
    left.context.receipt.acceptanceSequence - right.context.receipt.acceptanceSequence ||
    left.event.seq - right.event.seq);
  const caller = candidates.find((candidate) =>
    candidate.context.sessionId === String(input.session.id) &&
    candidate.context.shard.shardId === callerContext.shard.shardId &&
    candidate.context.receipt.payloadHash === callerContext.receipt.payloadHash &&
    candidate.context.receipt.acceptanceSequence === callerContext.receipt.acceptanceSequence);
  if (caller === undefined) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }

  const eligibleCandidates = candidates.filter((candidate) =>
    candidate.shard.role === 'Witness' || candidate.shard.role === 'Rewriter');
  const earliest = eligibleCandidates[0];
  if (earliest === undefined) {
    return { appended: false, traceEventSeq: -1 };
  }
  const councilTraces: Array<{ readonly session: Session; readonly event: SessionEvent<'pact/public-trace'> }> = [];
  for (const session of input.acceptedSessions) {
    const events = coldBySession.get(String(session.id)) ?? [];
    for (const event of events) {
      if (
        event.type === 'pact/public-trace' &&
        event.data.caseSessionId === registeredTurn.snapshot.caseSessionId &&
        event.data.turnId === registeredTurn.snapshot.turnId &&
        event.data.phase === 'COUNCIL' &&
        event.data.provisional === true
      ) {
        councilTraces.push({ session, event });
      }
    }
  }

  const traceRecords: RecoveryTraceRecord[] = [];
  for (const trace of councilTraces) {
    const matches = candidates.filter((candidate) =>
      exactCouncilTrace(
        trace.event,
        registeredTurn,
        candidate.shard,
        candidate.context.receipt.payloadHash,
        candidate.context.receipt.acceptanceSequence,
      ) &&
      candidate.context.sessionId === String(trace.session.id));
    if (matches.length !== 1) {
      incomplete(`recovery trace ${trace.event.seq}`);
    }
    const candidate = matches[0]!;
    if (candidate !== earliest) {
      incomplete(`recovery trace ${trace.event.seq}`);
    }
    if (
      candidate.context.receipt.traceEventSeq !== null &&
      candidate.context.receipt.traceEventSeq !== trace.event.seq
    ) {
      incomplete(`recovery trace ${trace.event.seq}`);
    }
    if (
      candidate.context.projectionAtMonotonicMs !== null &&
      candidate.context.projectionAtMonotonicMs !== trace.event.data.projectedAtMonotonicMs
    ) {
      incomplete(`recovery trace ${trace.event.seq}`);
    }
    traceRecords.push({ session: trace.session, event: trace.event, candidate });
  }

  if (traceRecords.length > 1) {
    incomplete(`recovery shard ${input.shard.shardId}`);
  }
  const existingTrace = traceRecords[0];
  const ownsTraceMetadata =
    earliest.context.receipt.traceEventSeq !== null &&
    earliest.context.projectionAtMonotonicMs !== null;
  if (
    (earliest.context.receipt.traceEventSeq !== null) !==
      (earliest.context.projectionAtMonotonicMs !== null)
  ) {
    incomplete(`recovery shard ${earliest.shard.shardId}`);
  }
  if (earliest.context.receipt.traceEventSeq !== null && existingTrace === undefined) {
    incomplete(`recovery shard ${earliest.shard.shardId}`);
  }
  if (existingTrace !== undefined) {
    if (!ownsTraceMetadata) {
      incomplete(`recovery trace ${existingTrace.event.seq}`);
    }
    if (
      existingTrace.event.seq !== earliest.context.receipt.traceEventSeq ||
      existingTrace.event.data.projectedAtMonotonicMs !==
        earliest.context.projectionAtMonotonicMs
    ) {
      incomplete(`recovery trace ${existingTrace.event.seq}`);
    }
    return {
      appended: false,
      traceEventSeq: existingTrace.event.seq,
    };
  }

  if (caller !== earliest) {
    return { appended: false, traceEventSeq: -1 };
  }

  const targetSession = scope.sessionsById.get(earliest.context.sessionId);
  if (targetSession === undefined) {
    incomplete(`recovery shard ${earliest.shard.shardId}`);
  }
  const recoveryCapability = councilRegistryRecoveryCapability(input.registry);
  const reservation = recoveryCapability.reserveRecoveryTrace({
    turnId: registeredTurn.snapshot.turnId,
    shardId: earliest.shard.shardId,
    payloadHash: earliest.context.receipt.payloadHash,
    acceptanceSequence: earliest.context.receipt.acceptanceSequence,
    session: targetSession!,
  });
  const projectedAtMonotonicMs =
    recoveryCapability.recoveryTimestamp(reservation);
  targetSession!.append('pact/public-trace', {
    caseSessionId: registeredTurn.snapshot.caseSessionId,
    turnId: registeredTurn.snapshot.turnId,
    role: earliest.shard.role,
    text: earliest.shard.publicTrace,
    sourceContributionHash: earliest.context.receipt.payloadHash,
    acceptanceSequence: earliest.context.receipt.acceptanceSequence,
    phase: 'COUNCIL' as const,
    provisional: true as const,
    projectedAtMonotonicMs,
  });
  const traceEventSeq = await recoveryTraceAfterFlush(
    input,
    targetSession!,
    `recovery trace ${earliest.shard.shardId}`,
    registeredTurn,
    earliest.shard,
    earliest.context.receipt.payloadHash,
    earliest.context.receipt.acceptanceSequence,
    projectedAtMonotonicMs,
  );
  recoveryCapability.commitRecoveryTrace(
    reservation,
    targetSession!,
    traceEventSeq,
  );
  return { appended: true, traceEventSeq };
};
