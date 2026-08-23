import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session';
import type { Context } from '@deepseek-ai/cordis';
import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  CouncilRegistry,
  councilRegistryRecoveryCapability,
} from '../src/council-registry.js';
import {
  durableConductorCommit,
  durableCouncilShard,
  recoverCouncilTraceProjection,
} from '../src/council-durability.js';
import {
  coldInspect,
  createFoundationHarness,
  type FoundationHarness,
} from '../src/create-foundation-harness.js';
import {
  COUNCIL_ROLE_TOOLS,
  COUNCIL_ROOT_TOOLS,
} from '../src/council-tools.js';
import { registerPactSessionEventTypes } from '../src/events.js';
import { SubmissionRegistry } from '../src/submission-registry.js';
import { ScriptedAdapter } from './scripted-adapter.js';
import {
  createFullCouncilFixtures,
} from './council-fixtures.js';
import * as pactAgentHostApi from '../src/index.js';

const releases: Array<() => void> = [];
const harnesses: FoundationHarness[] = [];

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const harness of harnesses.splice(0)) await harness.dispose();
  vi.restoreAllMocks();
});

const councilEvents = (session: Session): readonly SessionEvent[] =>
  session.events.filter((event) => event.type.startsWith('pact/'));

type CouncilTestRole =
  | 'CaseConductor'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';

const roleSession = (role: CouncilTestRole): Session =>
  Session.create(SessionId(randomUUID()));

const boundRegistry = (sessions: Readonly<Record<CouncilTestRole, Session>>) => {
  const submissions = new SubmissionRegistry();
  for (const [role, session] of Object.entries(sessions)) {
    releases.push(submissions.bind(session.id, role as CouncilTestRole));
  }
  return submissions;
};

const openRegistry = async (now = 1_250) => {
  const fixtures = await createFullCouncilFixtures(() => 1_000);
  let clock = now;
  const sessionByRole = Object.fromEntries(
    ['CaseConductor', 'Witness', 'Archivist', 'Rewriter', 'Guardian']
      .map((role) => [role, roleSession(role as CouncilTestRole)]),
  ) as Record<CouncilTestRole, Session>;
  const shards = Object.fromEntries(
    Object.entries(fixtures.shards).map(([role, shard]) => [role, {
      ...shard,
      childSessionId: String(sessionByRole[role as CouncilTestRole].id),
    }]),
  ) as typeof fixtures.shards;
  const boundFixtures = { ...fixtures, shards };
  const submissions = boundRegistry(sessionByRole);
  const registryClock = vi.fn(() => clock);
  const registry = new CouncilRegistry({
    submissions,
    now: registryClock,
  });
  registry.openTurn(fixtures.turn);
  return {
    fixtures: boundFixtures,
    registry,
    submissions,
    sessionByRole,
    registryClock,
    setNow(value: number) {
      clock = value;
    },
  };
};

const persistenceContext = (session: Session, events?: readonly SessionEvent[]) => {
  const flush = vi.fn(async () => true);
  const inspect = vi.fn(async () => ({
    meta: session.header,
    events: events ?? session.events,
  }));
  return {
    ctx: {
      sessions: { flush },
      sessionPersistence: { inspect },
    } as unknown as Context,
    flush,
    inspect,
  };
};

const persistenceContextForSessions = (sessions: readonly Session[]) => {
  const byId = new Map(sessions.map((session) => [String(session.id), session]));
  const flush = vi.fn(async () => true);
  const inspect = vi.fn(async (sessionId: SessionId) => {
    const session = byId.get(String(sessionId));
    if (session === undefined) throw new Error(`unknown session ${sessionId}`);
    return { meta: session.header, events: session.events };
  });
  return {
    ctx: {
      sessions: { flush },
      sessionPersistence: { inspect },
    } as unknown as Context,
    flush,
    inspect,
  };
};

describe('council-v2 public recovery API', () => {
  type PublicRegistryHasRecoveredTraceMutation =
    'recordRecoveredCouncilTrace' extends keyof pactAgentHostApi.CouncilRegistry
      ? true
      : false;
  const publicRegistryHasNoRecoveredTraceMutation:
    PublicRegistryHasRecoveredTraceMutation extends false ? true : never = true;

  test('does not expose registry recovery mutation through the package root', () => {
    const registry = new pactAgentHostApi.CouncilRegistry({
      submissions: new SubmissionRegistry(),
      now: () => 1_250,
    });

    expect('recordRecoveredCouncilTrace' in registry).toBe(false);
    expect(registry).not.toHaveProperty('recordRecoveredCouncilTrace');
    expect(registry).not.toHaveProperty('reserveRecoveryTrace');
    expect(registry).not.toHaveProperty('recoveryTimestamp');
    expect(registry).not.toHaveProperty('commitRecoveryTrace');
    expect(publicRegistryHasNoRecoveredTraceMutation).toBe(true);
  });
});

describe('council-v2 registry admission', () => {
  test('projects the exact first eligible trace after the shard event', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const rewriter = fixtures.shards.Rewriter;
    const session = sessionByRole.Rewriter;

    const receipt = await registry.acceptShard(session, rewriter);

    expect(receipt).toMatchObject({
      accepted: true,
      turnId: fixtures.turn.snapshot.turnId,
      shardId: rewriter.shardId,
      acceptanceSequence: 1,
      projectedTrace: true,
      acceptedAtMonotonicMs: 1_250,
      shardEventSeq: 0,
      traceEventSeq: 1,
    });
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(0);
    expect(councilEvents(session).map((event) => event.type)).toEqual([
      'pact/council-shard',
      'pact/public-trace',
    ]);
    const traceEvent = councilEvents(session).find(
      (event) => event.type === 'pact/public-trace',
    );
    expect(traceEvent?.data).toMatchObject({
      caseSessionId: fixtures.turn.snapshot.caseSessionId,
      turnId: fixtures.turn.snapshot.turnId,
      role: 'Rewriter',
      text: rewriter.publicTrace,
      sourceContributionHash: receipt.payloadHash,
      acceptanceSequence: 1,
      phase: 'COUNCIL',
      provisional: true,
      projectedAtMonotonicMs: 1_250,
    });
  });

  test('permits only Witness or Rewriter to create the first projection', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    for (const role of ['CaseConductor', 'Archivist', 'Guardian'] as const) {
      const receipt = await registry.acceptShard(
        sessionByRole[role],
        fixtures.shards[role],
      );
      expect(receipt).toMatchObject({ accepted: true, projectedTrace: false });
    }
    expect(councilEvents(sessionByRole.CaseConductor).some(
      (event) => event.type === 'pact/public-trace',
    )).toBe(false);
    expect(councilEvents(sessionByRole.Archivist).some(
      (event) => event.type === 'pact/public-trace',
    )).toBe(false);
    expect(councilEvents(sessionByRole.Guardian).some(
      (event) => event.type === 'pact/public-trace',
    )).toBe(false);

    const witness = await registry.acceptShard(
      sessionByRole.Witness,
      fixtures.shards.Witness,
    );
    const later = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    expect(witness.projectedTrace).toBe(true);
    expect(later.projectedTrace).toBe(false);
    expect(councilEvents(sessionByRole.Witness).filter(
      (event) => event.type === 'pact/public-trace',
    )).toHaveLength(1);
    expect(councilEvents(sessionByRole.Rewriter).filter(
      (event) => event.type === 'pact/public-trace',
    )).toHaveLength(0);
  });

  test('is idempotent for the same shard hash and quarantines an identity conflict', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const first = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    const duplicate = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    expect(duplicate).toEqual(first);
    expect(councilEvents(sessionByRole.Rewriter)).toHaveLength(2);

    const conflicting = {
      ...fixtures.shards.Rewriter,
      publicTrace: 'A different trace with the same shard identity.',
    };
    const rejected = await registry.acceptShard(
      sessionByRole.Rewriter,
      conflicting,
    );
    expect(rejected).toMatchObject({
      accepted: false,
      shardId: fixtures.shards.Rewriter.shardId,
      reasonCode: 'PACT_COUNCIL_SHARD_ID_CONFLICT',
    });
    expect(councilEvents(sessionByRole.Rewriter).at(-1)).toMatchObject({
      type: 'pact/quarantine',
      data: { reason: 'PACT_COUNCIL_SHARD_ID_CONFLICT' },
    });
  });

  test('rejects identity, scope, runtime binding, and deadline violations', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole, setNow } = await openRegistry();
    const cases = [
      ['case', { ...fixtures.shards.Rewriter, caseSessionId: 'case_other01' }, sessionByRole.Rewriter],
      ['turn', { ...fixtures.shards.Rewriter, shardId: 'shard_wrong_turn01', turnId: 'turn_other01' }, sessionByRole.Rewriter],
      ['snapshot', { ...fixtures.shards.Rewriter, shardId: 'shard_wrong_snapshot01', snapshotHash: 'a'.repeat(64) }, sessionByRole.Rewriter],
      ['scene', { ...fixtures.shards.Rewriter, shardId: 'shard_wrong_scene01', parentSceneHash: 'a'.repeat(64) }, sessionByRole.Rewriter],
      ['registry', { ...fixtures.shards.Rewriter, shardId: 'shard_wrong_registry01', registryVersion: 'cp03-registry/other' }, sessionByRole.Rewriter],
      ['manifest', { ...fixtures.shards.Rewriter, shardId: 'shard_wrong_manifest01', routingManifestVersion: 'other' }, sessionByRole.Rewriter],
      ['deadline', { ...fixtures.shards.Rewriter, shardId: 'shard_wrong_deadline01', deadlineId: 'other' }, sessionByRole.Rewriter],
    ] as const;
    for (const [label, shard, session] of cases) {
      const rejected = await registry.acceptShard(session, shard);
      expect(rejected.accepted, label).toBe(false);
    }
    const wrongSession = await registry.acceptShard(
      sessionByRole.Witness,
      fixtures.shards.Rewriter,
    );
    expect(wrongSession).toMatchObject({
      accepted: false,
      reasonCode: 'PACT_COUNCIL_SHARD_ROLE_OR_SESSION_MISMATCH',
    });
    setNow(fixtures.turn.deadlineAtMonotonicMs);
    const atDeadline = await registry.acceptShard(
      sessionByRole.Rewriter,
      { ...fixtures.shards.Rewriter, shardId: 'shard_at_deadline01' },
    );
    expect(atDeadline).toMatchObject({
      accepted: false,
      reasonCode: 'PACT_COUNCIL_SHARD_DEADLINE_CLOSED',
    });
  });

  test('closes the selection barrier before a late shard can enter the durable proposal', async () => {
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const first = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!first.accepted) throw new Error('expected accepted shard');
    await durableCouncilShard({
      ...persistenceContext(sessionByRole.Rewriter),
      registry,
      session: sessionByRole.Rewriter,
      receipt: first,
    });
    registry.closeSelectionBarrier(fixtures.turn.snapshot.turnId);
    const late = await registry.acceptShard(
      sessionByRole.Witness,
      fixtures.shards.Witness,
    );
    expect(late).toMatchObject({
      accepted: false,
      reasonCode: 'PACT_SELECTION_BARRIER_CLOSED',
    });
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(1);
  });

  test('freezes the exact durable shard set at selection barrier close', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const accepted = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!accepted.accepted) throw new Error('expected accepted shard');

    registry.closeSelectionBarrier(fixtures.turn.snapshot.turnId);
    await durableCouncilShard({
      ...persistenceContext(sessionByRole.Rewriter),
      registry,
      session: sessionByRole.Rewriter,
      receipt: accepted,
    });

    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(0);
  });

  test('rejects structural durable receipts without the verified durability proof', async () => {
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const accepted = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!accepted.accepted) throw new Error('expected accepted shard');

    expect(() => registry.markShardDurable({
      ...accepted,
      status: 'DURABLE' as const,
      sessionId: String(sessionByRole.Rewriter.id),
      lastSeq: accepted.shardEventSeq + 1,
    } as never)).toThrow('PACT_COUNCIL_DURABLE_SHARD_RECEIPT_MISMATCH');
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(0);
  });

  test('uses a monotonic default clock instead of Date.now', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, submissions, sessionByRole } = await openRegistry();
    const registry = new CouncilRegistry({ submissions });
    registry.openTurn(fixtures.turn);
    vi.spyOn(performance, 'now').mockReturnValue(1_250);
    vi.spyOn(Date, 'now').mockReturnValue(987_654_321_000);

    const accepted = await registry.acceptShard(
      sessionByRole.Archivist,
      fixtures.shards.Archivist,
    );

    expect(accepted).toMatchObject({ accepted: true });
    if (accepted.accepted) {
      expect(accepted.acceptedAtMonotonicMs).not.toBe(987_654_321_000);
    }
  });
});

describe('council-v2 durability and recovery', () => {
  test('flushes, cold-inspects, and marks a shard durable only after linked events are proven', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const accepted = await registry.acceptShard(session, fixtures.shards.Rewriter);
    if (!accepted.accepted) throw new Error('expected accepted shard');
    const flush = vi.fn(async () => true);
    const inspect = vi.fn(async () => ({ meta: session.header, events: session.events }));
    const durable = await durableCouncilShard({
      ctx: {
        sessions: { flush },
        sessionPersistence: { inspect },
      } as unknown as Context,
      registry,
      session,
      receipt: accepted,
    });
    expect(durable).toMatchObject({
      status: 'DURABLE',
      sessionId: String(session.id),
      lastSeq: 1,
      shardEventSeq: 0,
      traceEventSeq: 1,
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(1);
  });

  test('persists council-v2 events through the real DSH JSONL flush and cold reader', async () => {
    const persistenceRoot = join(
      tmpdir(),
      `pact-council-registry-${randomUUID()}`,
    );
    mkdirSync(persistenceRoot, { recursive: true });
    const harness = await createFoundationHarness({
      persistenceRoot,
      scriptedAdapter: new ScriptedAdapter([]),
    });
    harnesses.push(harness);
    const conductor = await harness.createConductor(SessionId(randomUUID()));
    const fixtures = await createFullCouncilFixtures(() => 1_000);
    const shard = {
      ...fixtures.shards.CaseConductor,
      childSessionId: String(conductor.agent.id),
    };
    const registry = new CouncilRegistry({
      submissions: harness.registry,
      now: () => 1_250,
    });
    registry.openTurn(fixtures.turn);
    const accepted = await registry.acceptShard(conductor.agent.session, shard);
    if (!accepted.accepted) throw new Error('expected accepted conductor shard');
    const durable = await durableCouncilShard({
      ctx: harness.ctx,
      registry,
      session: conductor.agent.session,
      receipt: accepted,
    });
    const cold = await coldInspect(persistenceRoot, conductor.agent.id);
    expect(cold.events).toContainEqual(expect.objectContaining({
      seq: durable.shardEventSeq,
      type: 'pact/council-shard',
      data: expect.objectContaining({ payloadHash: accepted.payloadHash }),
    }));
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(1);
  });

  test('proves conductor commit durability through its own event and hash', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.CaseConductor;
    const accepted = await registry.acceptCommit(session, fixtures.proposedCommit);
    if (!accepted.accepted) throw new Error('expected accepted commit');
    const durable = await durableConductorCommit({
      ctx: {
        sessions: { flush: async () => true },
        sessionPersistence: {
          inspect: async () => ({ meta: session.header, events: session.events }),
        },
      } as unknown as Context,
      registry,
      session,
      receipt: accepted,
    });
    expect(durable).toMatchObject({
      status: 'DURABLE',
      sessionId: String(session.id),
      commitEventSeq: 0,
    });
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toBeNull();
  });

  test('does not expose a shard when flush or cold inspection fails', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const accepted = await registry.acceptShard(session, fixtures.shards.Rewriter);
    if (!accepted.accepted) throw new Error('expected accepted shard');
    const flush = vi.fn(async () => false);
    const inspect = vi.fn(async () => ({ meta: session.header, events: [] }));
    await expect(durableCouncilShard({
      ctx: {
        sessions: { flush },
        sessionPersistence: { inspect },
      } as unknown as Context,
      registry,
      session,
      receipt: accepted,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_FLUSH_FAILED',
    });
    expect(inspect).not.toHaveBeenCalled();
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(0);

    await expect(durableCouncilShard({
      ctx: {
        sessions: { flush: async () => true },
        sessionPersistence: { inspect },
      } as unknown as Context,
      registry,
      session,
      receipt: accepted,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(0);
  });

  test('repairs one missing eligible projection from a durable shard using recovery time', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, registryClock, sessionByRole, setNow } =
      await openRegistry();
    const session = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const originalAppend = session.append.bind(session);
    let failTraceAppend = true;
    vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected recovery setup trace failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof session.append);
    await expect(registry.acceptShard(session, shard))
      .rejects.toThrow('injected recovery setup trace failure');
    const acceptedContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (acceptedContext === undefined) throw new Error('expected pending shard');
    const shardPayloadHash = await sha256Canonical(shard);
    const context = persistenceContext(session);
    setNow(4_800);
    registryClock.mockClear();
    const callerSelectedNow = vi.fn(() => -100);
    const input = {
      ctx: context.ctx,
      registry,
      acceptedSessions: [session],
      session,
      turn: fixtures.turn,
      shard,
      shardPayloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      now: callerSelectedNow,
    } as const as never;
    const repaired = await recoverCouncilTraceProjection(input);
    expect(repaired.appended).toBe(true);
    expect(repaired.traceEventSeq).toBe(1);
    expect(callerSelectedNow).not.toHaveBeenCalled();
    expect(registryClock).toHaveBeenCalledTimes(1);
    expect(context.flush).toHaveBeenCalledTimes(1);
    expect(context.inspect).toHaveBeenCalledTimes(2);
    expect(session.events.at(-1)).toMatchObject({
      type: 'pact/public-trace',
      data: {
        sourceContributionHash: shardPayloadHash,
        projectedAtMonotonicMs: 4_800,
      },
    });
    const repeated = await recoverCouncilTraceProjection(input);
    expect(repeated).toEqual({ appended: false, traceEventSeq: 1 });
    expect(session.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(1);
    const recoveredContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    expect(recoveredContext?.receipt.traceEventSeq).toBe(1);
    expect(recoveredContext?.projectionAtMonotonicMs).toBe(4_800);
  });

  test('does not let a public recovery caller inject projection timestamps', async () => {
    for (const injectedProjectionAt of [-100, 6_000, 1_250, 987_654]) {
      releases.push(registerPactSessionEventTypes());
      const {
        fixtures,
        registry,
        registryClock,
        sessionByRole,
        setNow,
      } = await openRegistry();
      const session = sessionByRole.Rewriter;
      const shard = fixtures.shards.Rewriter;
      const originalAppend = session.append.bind(session);
      let failTraceAppend = true;
      vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
        if (type === 'pact/public-trace' && failTraceAppend) {
          failTraceAppend = false;
          throw new Error('injected public timestamp setup failure');
        }
        return (originalAppend as unknown as (
          appendType: string,
          appendData: unknown,
        ) => SessionEvent)(type, data);
      }) as typeof session.append);
      await expect(registry.acceptShard(session, shard))
        .rejects.toThrow('injected public timestamp setup failure');
      const acceptedContext = registry.acceptedCouncilShardContexts(
        fixtures.turn.snapshot.turnId,
      ).find((context) => context.shard.shardId === shard.shardId);
      if (acceptedContext === undefined) throw new Error('expected pending shard');

      setNow(4_800);
      registryClock.mockClear();
      const callerSelectedNow = vi.fn(() => injectedProjectionAt);
      const repaired = await recoverCouncilTraceProjection({
        ctx: persistenceContext(session).ctx,
        registry,
        acceptedSessions: [session],
        session,
        turn: fixtures.turn,
        shard,
        shardPayloadHash: acceptedContext.receipt.payloadHash,
        acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
        now: callerSelectedNow,
      } as never);

      expect(repaired).toEqual({ appended: true, traceEventSeq: 1 });
      expect(callerSelectedNow).not.toHaveBeenCalled();
      expect(registryClock).toHaveBeenCalledTimes(1);
      expect(session.events.at(-1)).toMatchObject({
        type: 'pact/public-trace',
        data: { projectedAtMonotonicMs: 4_800 },
      });
      const recoveredContext = registry.acceptedCouncilShardContexts(
        fixtures.turn.snapshot.turnId,
      ).find((context) => context.shard.shardId === shard.shardId);
      expect(recoveredContext?.projectionAtMonotonicMs).toBe(4_800);
    }
  });

  test('rejects same-id replacement recovery before append or projection ownership', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const canonical = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const originalAppend = canonical.append.bind(canonical);
    let failTraceAppend = true;
    vi.spyOn(canonical, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected canonical setup trace failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof canonical.append);
    await expect(registry.acceptShard(canonical, shard))
      .rejects.toThrow('injected canonical setup trace failure');
    const acceptedContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (acceptedContext === undefined) throw new Error('expected pending shard');

    const replacement = Session.create(SessionId(String(canonical.id)));
    replacement.append('pact/council-shard', {
      caseSessionId: shard.caseSessionId,
      turnId: shard.turnId,
      shardId: shard.shardId,
      role: shard.role,
      payload: shard as unknown as Record<string, never>,
      payloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
    });
    const beforeReplacementEvents = replacement.events.length;
    const persistence = persistenceContext(replacement);

    await expect(recoverCouncilTraceProjection({
      ctx: persistence.ctx,
      registry,
      acceptedSessions: [replacement],
      session: replacement,
      turn: fixtures.turn,
      shard,
      shardPayloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(persistence.inspect).not.toHaveBeenCalled();
    expect(replacement.events).toHaveLength(beforeReplacementEvents);
    const pending = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    expect(pending?.receipt.traceEventSeq).toBeNull();
    expect(pending?.projectionAtMonotonicMs).toBeNull();
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(0);
  });

  test('rejects durableCouncilShard for a same-id replacement session', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const canonical = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const accepted = await registry.acceptShard(canonical, shard);
    if (!accepted.accepted) throw new Error('expected accepted shard');

    const replacement = Session.create(SessionId(String(canonical.id)));
    replacement.append('pact/council-shard', {
      caseSessionId: shard.caseSessionId,
      turnId: shard.turnId,
      shardId: shard.shardId,
      role: shard.role,
      payload: shard as unknown as Record<string, never>,
      payloadHash: accepted.payloadHash,
      acceptanceSequence: accepted.acceptanceSequence,
    });
    replacement.append('pact/public-trace', {
      caseSessionId: shard.caseSessionId,
      turnId: shard.turnId,
      role: shard.role,
      text: shard.publicTrace,
      sourceContributionHash: accepted.payloadHash,
      acceptanceSequence: accepted.acceptanceSequence,
      phase: 'COUNCIL',
      provisional: true,
      projectedAtMonotonicMs: accepted.acceptedAtMonotonicMs,
    });
    const persistence = persistenceContext(replacement);

    await expect(durableCouncilShard({
      ctx: persistence.ctx,
      registry,
      session: replacement,
      receipt: accepted,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(persistence.flush).not.toHaveBeenCalled();
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(0);
  });

  test('rejects durableConductorCommit for a same-id replacement session', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const canonical = sessionByRole.CaseConductor;
    const accepted = await registry.acceptCommit(canonical, fixtures.proposedCommit);
    if (!accepted.accepted) throw new Error('expected accepted conductor commit');

    const replacement = Session.create(SessionId(String(canonical.id)));
    replacement.append('pact/conductor-commit', {
      turnId: fixtures.proposedCommit.turnId,
      payload: fixtures.proposedCommit as unknown as Record<string, never>,
      payloadHash: accepted.payloadHash,
    });
    const persistence = persistenceContext(replacement);

    await expect(durableConductorCommit({
      ctx: persistence.ctx,
      registry,
      session: replacement,
      receipt: accepted,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(persistence.flush).not.toHaveBeenCalled();
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toBeNull();
  });

  test('rejects a same-id replacement recovery reservation before consuming the registry clock', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, registryClock, sessionByRole } = await openRegistry();
    const canonical = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const originalAppend = canonical.append.bind(canonical);
    let failTraceAppend = true;
    vi.spyOn(canonical, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected reservation identity setup failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof canonical.append);
    await expect(registry.acceptShard(canonical, shard))
      .rejects.toThrow('injected reservation identity setup failure');
    const acceptedContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (acceptedContext === undefined) throw new Error('expected pending shard');

    const replacement = Session.create(SessionId(String(canonical.id)));
    const capability = councilRegistryRecoveryCapability(registry);
    registryClock.mockClear();
    expect(() => capability.reserveRecoveryTrace({
      turnId: fixtures.turn.snapshot.turnId,
      shardId: shard.shardId,
      payloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      session: replacement,
    })).toThrow('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    expect(registryClock).not.toHaveBeenCalled();

    const reservation = capability.reserveRecoveryTrace({
      turnId: fixtures.turn.snapshot.turnId,
      shardId: shard.shardId,
      payloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      session: canonical,
    });
    expect(registryClock).toHaveBeenCalledTimes(1);
    expect(capability.recoveryTimestamp(reservation)).toBe(1_250);
  });

  test('requires the exact canonical object in acceptedSessions, not only an equal ID set', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const canonicalWitness = sessionByRole.Witness;
    const canonicalRewriter = sessionByRole.Rewriter;
    const witness = await registry.acceptShard(
      canonicalWitness,
      fixtures.shards.Witness,
    );
    const rewriter = await registry.acceptShard(
      canonicalRewriter,
      fixtures.shards.Rewriter,
    );
    if (!witness.accepted || !rewriter.accepted) {
      throw new Error('expected accepted eligible shards');
    }

    const replacementWitness = Session.create(
      SessionId(String(canonicalWitness.id)),
    );
    replacementWitness.append('pact/council-shard', {
      caseSessionId: fixtures.shards.Witness.caseSessionId,
      turnId: fixtures.shards.Witness.turnId,
      shardId: fixtures.shards.Witness.shardId,
      role: fixtures.shards.Witness.role,
      payload: fixtures.shards.Witness as unknown as Record<string, never>,
      payloadHash: witness.payloadHash,
      acceptanceSequence: witness.acceptanceSequence,
    });
    replacementWitness.append('pact/public-trace', {
      caseSessionId: fixtures.shards.Witness.caseSessionId,
      turnId: fixtures.shards.Witness.turnId,
      role: fixtures.shards.Witness.role,
      text: fixtures.shards.Witness.publicTrace,
      sourceContributionHash: witness.payloadHash,
      acceptanceSequence: witness.acceptanceSequence,
      phase: 'COUNCIL',
      provisional: true,
      projectedAtMonotonicMs: witness.acceptedAtMonotonicMs,
    });
    const persistence = persistenceContextForSessions([
      replacementWitness,
      canonicalRewriter,
    ]);

    await expect(recoverCouncilTraceProjection({
      ctx: persistence.ctx,
      registry,
      acceptedSessions: [replacementWitness, canonicalRewriter],
      session: replacementWitness,
      turn: fixtures.turn,
      shard: fixtures.shards.Witness,
      shardPayloadHash: witness.payloadHash,
      acceptanceSequence: witness.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(persistence.inspect).not.toHaveBeenCalled();
    expect(replacementWitness.events).toHaveLength(2);
  });

  test('keeps canonical recovery and durability working together', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole, setNow } = await openRegistry();
    const canonical = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const originalAppend = canonical.append.bind(canonical);
    let failTraceAppend = true;
    vi.spyOn(canonical, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected canonical recovery setup failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof canonical.append);
    await expect(registry.acceptShard(canonical, shard))
      .rejects.toThrow('injected canonical recovery setup failure');
    const acceptedContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (acceptedContext === undefined) throw new Error('expected pending shard');

    setNow(4_800);
    await expect(recoverCouncilTraceProjection({
      ctx: persistenceContext(canonical).ctx,
      registry,
      acceptedSessions: [canonical],
      session: canonical,
      turn: fixtures.turn,
      shard,
      shardPayloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
    })).resolves.toEqual({ appended: true, traceEventSeq: 1 });

    const recoveredContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (recoveredContext === undefined) throw new Error('expected recovered shard');
    const durable = await durableCouncilShard({
      ctx: persistenceContext(canonical).ctx,
      registry,
      session: canonical,
      receipt: recoveredContext.receipt,
    });
    expect(durable.status).toBe('DURABLE');
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
      .toHaveLength(1);
  });

  test('keeps recovery reservation identity opaque and commits it only once', async () => {
    releases.push(registerPactSessionEventTypes());
    const {
      fixtures,
      registry,
      registryClock,
      sessionByRole,
      setNow,
    } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const originalAppend = session.append.bind(session);
    let failTraceAppend = true;
    vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected reservation setup failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof session.append);
    await expect(registry.acceptShard(session, shard))
      .rejects.toThrow('injected reservation setup failure');
    const acceptedContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (acceptedContext === undefined) throw new Error('expected pending shard');

    setNow(4_800);
    registryClock.mockClear();
    const capability = councilRegistryRecoveryCapability(registry);
    const reservation = capability.reserveRecoveryTrace({
      turnId: fixtures.turn.snapshot.turnId,
      shardId: shard.shardId,
      payloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      session,
    });
    expect(registryClock).toHaveBeenCalledTimes(1);
    expect(capability.recoveryTimestamp(reservation)).toBe(4_800);

    expect(() => capability.commitRecoveryTrace(
      Object.freeze({}),
      session,
      1,
    )).toThrow('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    expect(() => capability.commitRecoveryTrace(
      reservation,
      Session.create(SessionId(randomUUID())),
      1,
    )).toThrow('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');

    session.append('pact/public-trace', {
      caseSessionId: shard.caseSessionId,
      turnId: shard.turnId,
      role: 'Witness',
      text: 'A different shard cannot consume this reservation.',
      sourceContributionHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      phase: 'COUNCIL',
      provisional: true,
      projectedAtMonotonicMs: 4_800,
    });
    session.append('pact/public-trace', {
      caseSessionId: shard.caseSessionId,
      turnId: shard.turnId,
      role: shard.role,
      text: shard.publicTrace,
      sourceContributionHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      phase: 'COUNCIL',
      provisional: true,
      projectedAtMonotonicMs: 4_800,
    });
    expect(() => capability.commitRecoveryTrace(reservation, session, 1))
      .toThrow('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    const committed = capability.commitRecoveryTrace(reservation, session, 2);
    expect(committed.receipt.traceEventSeq).toBe(2);
    expect(committed.projectionAtMonotonicMs).toBe(4_800);
    expect(() => capability.commitRecoveryTrace(reservation, session, 2))
      .toThrow('PACT_COUNCIL_RECOVERY_RESERVATION_MISMATCH');
    expect(registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId)?.receipt)
      .toMatchObject({ traceEventSeq: 2 });
  });

  for (const failureMode of ['append', 'flush', 'inspect'] as const) {
    test(`does not commit recovery metadata when ${failureMode} fails`, async () => {
      releases.push(registerPactSessionEventTypes());
      const { fixtures, registry, sessionByRole, setNow } = await openRegistry();
      const session = sessionByRole.Rewriter;
      const shard = fixtures.shards.Rewriter;
      const originalAppend = session.append.bind(session);
      let setupTraceFailure = true;
      vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
        if (type === 'pact/public-trace' && setupTraceFailure) {
          setupTraceFailure = false;
          throw new Error('injected recovery failure setup');
        }
        if (type === 'pact/public-trace' && failureMode === 'append') {
          throw new Error('injected recovery append failure');
        }
        return (originalAppend as unknown as (
          appendType: string,
          appendData: unknown,
        ) => SessionEvent)(type, data);
      }) as typeof session.append);
      await expect(registry.acceptShard(session, shard))
        .rejects.toThrow('injected recovery failure setup');
      const acceptedContext = registry.acceptedCouncilShardContexts(
        fixtures.turn.snapshot.turnId,
      ).find((context) => context.shard.shardId === shard.shardId);
      if (acceptedContext === undefined) throw new Error('expected pending shard');

      setNow(4_800);
      let inspectCalls = 0;
      const flush = vi.fn(async () => failureMode !== 'flush');
      const inspect = vi.fn(async () => {
        inspectCalls += 1;
        if (failureMode === 'inspect' && inspectCalls === 2) {
          throw new Error('injected recovery inspect failure');
        }
        return { meta: session.header, events: session.events };
      });
      const recoveryAttempt = recoverCouncilTraceProjection({
        ctx: {
          sessions: { flush },
          sessionPersistence: { inspect },
        } as unknown as Context,
        registry,
        acceptedSessions: [session],
        session,
        turn: fixtures.turn,
        shard,
        shardPayloadHash: acceptedContext.receipt.payloadHash,
        acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      } as never);
      if (failureMode === 'append') {
        await expect(recoveryAttempt)
          .rejects.toThrow('injected recovery append failure');
      } else {
        await expect(recoveryAttempt).rejects.toMatchObject({
          name: 'PactDurabilityError',
        });
      }

      const afterFailure = registry.acceptedCouncilShardContexts(
        fixtures.turn.snapshot.turnId,
      ).find((context) => context.shard.shardId === shard.shardId);
      expect(afterFailure?.receipt.traceEventSeq).toBeNull();
      expect(afterFailure?.projectionAtMonotonicMs).toBeNull();
      expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
        .toHaveLength(0);
    });
  }

  test('requires DSH persistence context and never falls back to in-memory recovery', async () => {
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const shardPayloadHash = await sha256Canonical(shard);
    session.append('pact/council-shard', {
      caseSessionId: fixtures.turn.snapshot.caseSessionId,
      turnId: fixtures.turn.snapshot.turnId,
      shardId: shard.shardId,
      role: shard.role,
      payload: shard as unknown as Record<string, never>,
      payloadHash: shardPayloadHash,
      acceptanceSequence: 1,
    });

    await expect(recoverCouncilTraceProjection({
      session,
      turn: fixtures.turn,
      shard,
      shardPayloadHash,
      acceptanceSequence: 1,
    } as never)).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
  });

  test('enforces one earliest trace across distinct persisted child sessions', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const witnessSession = sessionByRole.Witness;
    const rewriterSession = sessionByRole.Rewriter;
    const witness = await registry.acceptShard(
      witnessSession,
      fixtures.shards.Witness,
    );
    const rewriter = await registry.acceptShard(
      rewriterSession,
      fixtures.shards.Rewriter,
    );
    if (!witness.accepted || !rewriter.accepted) {
      throw new Error('expected accepted eligible shards');
    }
    expect(witness.traceEventSeq).toBe(1);
    expect(rewriter.traceEventSeq).toBeNull();
    const scope = persistenceContextForSessions([
      witnessSession,
      rewriterSession,
    ]);

    const repaired = await recoverCouncilTraceProjection({
      ctx: scope.ctx,
      registry,
      acceptedSessions: [witnessSession, rewriterSession],
      session: rewriterSession,
      turn: fixtures.turn,
      shard: fixtures.shards.Rewriter,
      shardPayloadHash: rewriter.payloadHash,
      acceptanceSequence: rewriter.acceptanceSequence,
    });

    expect(repaired).toEqual({ appended: false, traceEventSeq: 1 });
    expect(scope.inspect).toHaveBeenCalledTimes(2);
    expect(witnessSession.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(1);
    expect(rewriterSession.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(0);
  });

  test('rejects an extra bound session outside the exact accepted registry scope', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const originalAppend = session.append.bind(session);
    let failTraceAppend = true;
    vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected exact-scope setup trace failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof session.append);
    await expect(registry.acceptShard(session, shard))
      .rejects.toThrow('injected exact-scope setup trace failure');
    const acceptedContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (acceptedContext === undefined) throw new Error('expected pending shard');
    const scope = persistenceContextForSessions([
      session,
      sessionByRole.Guardian,
    ]);

    await expect(recoverCouncilTraceProjection({
      ctx: scope.ctx,
      registry,
      acceptedSessions: [session, sessionByRole.Guardian],
      session,
      turn: fixtures.turn,
      shard,
      shardPayloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(scope.inspect).not.toHaveBeenCalled();
    expect(session.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(0);
  });

  test('rejects an extra bound session containing an earlier same-turn orphan shard', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const shard = fixtures.shards.Rewriter;
    const originalAppend = session.append.bind(session);
    let failTraceAppend = true;
    vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected orphan-scope setup trace failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof session.append);
    await expect(registry.acceptShard(session, shard))
      .rejects.toThrow('injected orphan-scope setup trace failure');
    const acceptedContext = registry.acceptedCouncilShardContexts(
      fixtures.turn.snapshot.turnId,
    ).find((context) => context.shard.shardId === shard.shardId);
    if (acceptedContext === undefined) throw new Error('expected pending shard');

    const guardian = sessionByRole.Guardian;
    const orphan = {
      ...fixtures.shards.Witness,
      childSessionId: String(guardian.id),
    };
    const orphanPayloadHash = await sha256Canonical(orphan);
    guardian.append('pact/council-shard', {
      caseSessionId: orphan.caseSessionId,
      turnId: orphan.turnId,
      shardId: orphan.shardId,
      role: orphan.role,
      payload: orphan as unknown as Record<string, never>,
      payloadHash: orphanPayloadHash,
      acceptanceSequence: 0,
    });
    const scope = persistenceContextForSessions([session, guardian]);

    await expect(recoverCouncilTraceProjection({
      ctx: scope.ctx,
      registry,
      acceptedSessions: [session, guardian],
      session,
      turn: fixtures.turn,
      shard,
      shardPayloadHash: acceptedContext.receipt.payloadHash,
      acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(scope.inspect).not.toHaveBeenCalled();
    expect(session.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(0);
    expect(guardian.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(0);
  });

  for (const projectedAtMonotonicMs of [-100, 6_000]) {
    test(`rejects an unowned existing trace timestamp ${projectedAtMonotonicMs}`, async () => {
      releases.push(registerPactSessionEventTypes());
      const { fixtures, registry, registryClock, sessionByRole } =
        await openRegistry();
      const session = sessionByRole.Rewriter;
      const shard = fixtures.shards.Rewriter;
      const originalAppend = session.append.bind(session);
      let failTraceAppend = true;
      vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
        if (type === 'pact/public-trace' && failTraceAppend) {
          failTraceAppend = false;
          throw new Error('injected unowned-trace setup failure');
        }
        return (originalAppend as unknown as (
          appendType: string,
          appendData: unknown,
        ) => SessionEvent)(type, data);
      }) as typeof session.append);
      await expect(registry.acceptShard(session, shard))
        .rejects.toThrow('injected unowned-trace setup failure');
      const acceptedContext = registry.acceptedCouncilShardContexts(
        fixtures.turn.snapshot.turnId,
      ).find((context) => context.shard.shardId === shard.shardId);
      if (acceptedContext === undefined) throw new Error('expected pending shard');
      session.append('pact/public-trace', {
        caseSessionId: shard.caseSessionId,
        turnId: shard.turnId,
        role: shard.role,
        text: shard.publicTrace,
        sourceContributionHash: acceptedContext.receipt.payloadHash,
        acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
        phase: 'COUNCIL',
        provisional: true,
        projectedAtMonotonicMs,
      });
      const scope = persistenceContext(session);
      registryClock.mockClear();

      await expect(recoverCouncilTraceProjection({
        ctx: scope.ctx,
        registry,
        acceptedSessions: [session],
        session,
        turn: fixtures.turn,
        shard,
        shardPayloadHash: acceptedContext.receipt.payloadHash,
        acceptanceSequence: acceptedContext.receipt.acceptanceSequence,
      })).rejects.toMatchObject({
        name: 'PactDurabilityError',
        code: 'PACT_DURABILITY_INCOMPLETE',
      });
      expect(registryClock).not.toHaveBeenCalled();
      expect(session.events.filter((event) => event.type === 'pact/public-trace'))
        .toHaveLength(1);
      await expect(durableCouncilShard({
        ctx: persistenceContext(session).ctx,
        registry,
        session,
        receipt: acceptedContext.receipt,
      })).rejects.toMatchObject({
        name: 'PactDurabilityError',
        code: 'PACT_DURABILITY_INCOMPLETE',
      });
      expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableShards)
        .toHaveLength(0);
    });
  }

  test('fails closed when the accepted child-session scope is incomplete', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const witness = await registry.acceptShard(
      sessionByRole.Witness,
      fixtures.shards.Witness,
    );
    const rewriter = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!witness.accepted || !rewriter.accepted) {
      throw new Error('expected accepted eligible shards');
    }
    const scope = persistenceContextForSessions([sessionByRole.Rewriter]);

    await expect(recoverCouncilTraceProjection({
      ctx: scope.ctx,
      registry,
      acceptedSessions: [sessionByRole.Rewriter],
      session: sessionByRole.Rewriter,
      turn: fixtures.turn,
      shard: fixtures.shards.Rewriter,
      shardPayloadHash: rewriter.payloadHash,
      acceptanceSequence: rewriter.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(scope.inspect).not.toHaveBeenCalled();
  });

  test('fails closed on a conflicting non-authoritative council trace', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const witness = await registry.acceptShard(
      sessionByRole.Witness,
      fixtures.shards.Witness,
    );
    const rewriter = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!witness.accepted || !rewriter.accepted) {
      throw new Error('expected accepted eligible shards');
    }
    sessionByRole.Rewriter.append('pact/public-trace', {
      caseSessionId: fixtures.turn.snapshot.caseSessionId,
      turnId: fixtures.turn.snapshot.turnId,
      role: 'Rewriter',
      text: fixtures.shards.Rewriter.publicTrace,
      sourceContributionHash: rewriter.payloadHash,
      acceptanceSequence: rewriter.acceptanceSequence,
      phase: 'COUNCIL',
      provisional: true,
      projectedAtMonotonicMs: 4_800,
    });
    const scope = persistenceContextForSessions([
      sessionByRole.Witness,
      sessionByRole.Rewriter,
    ]);

    await expect(recoverCouncilTraceProjection({
      ctx: scope.ctx,
      registry,
      acceptedSessions: [sessionByRole.Witness, sessionByRole.Rewriter],
      session: sessionByRole.Rewriter,
      turn: fixtures.turn,
      shard: fixtures.shards.Rewriter,
      shardPayloadHash: rewriter.payloadHash,
      acceptanceSequence: rewriter.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
  });

  test('revalidates recovery payload identity against the live child session and turn snapshot', async () => {
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const shard = {
      ...fixtures.shards.Rewriter,
      childSessionId: String(sessionByRole.Witness.id),
      snapshotHash: 'a'.repeat(64),
    };
    const shardPayloadHash = await sha256Canonical(shard);
    session.append('pact/council-shard', {
      caseSessionId: fixtures.turn.snapshot.caseSessionId,
      turnId: fixtures.turn.snapshot.turnId,
      shardId: shard.shardId,
      role: shard.role,
      payload: shard as unknown as Record<string, never>,
      payloadHash: shardPayloadHash,
      acceptanceSequence: 1,
    });

    await expect(recoverCouncilTraceProjection({
      ctx: persistenceContext(session).ctx,
      registry,
      acceptedSessions: [session],
      session,
      turn: fixtures.turn,
      shard,
      shardPayloadHash,
      acceptanceSequence: 1,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(session.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(0);
  });

  test('requires the recovery session to be registry-bound to the shard role', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const accepted = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!accepted.accepted) throw new Error('expected accepted shard');
    const unbound = Session.create(SessionId(randomUUID()));
    const scope = persistenceContextForSessions([
      sessionByRole.Rewriter,
      sessionByRole.Witness,
      unbound,
    ]);
    for (const session of [sessionByRole.Witness, unbound]) {
      await expect(recoverCouncilTraceProjection({
        ctx: scope.ctx,
        registry,
        acceptedSessions: [sessionByRole.Rewriter, session],
        session,
        turn: fixtures.turn,
        shard: fixtures.shards.Rewriter,
        shardPayloadHash: accepted.payloadHash,
        acceptanceSequence: accepted.acceptanceSequence,
      })).rejects.toMatchObject({
        name: 'PactDurabilityError',
        code: 'PACT_DURABILITY_INCOMPLETE',
      });
    }
  });

  test('rejects a turn whose snapshot changed while retaining its old hash', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const accepted = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!accepted.accepted) throw new Error('expected accepted shard');
    const changedTurn = {
      ...fixtures.turn,
      snapshot: {
        ...fixtures.turn.snapshot,
        inputRefs: [
          ...fixtures.turn.snapshot.inputRefs,
          { refId: 'input_fabricated01', inputClass: 'text' as const },
        ],
      },
    };
    const scope = persistenceContextForSessions([sessionByRole.Rewriter]);

    await expect(recoverCouncilTraceProjection({
      ctx: scope.ctx,
      registry,
      acceptedSessions: [sessionByRole.Rewriter],
      session: sessionByRole.Rewriter,
      turn: changedTurn,
      shard: fixtures.shards.Rewriter,
      shardPayloadHash: accepted.payloadHash,
      acceptanceSequence: accepted.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(scope.inspect).not.toHaveBeenCalled();
  });

  test('uses only the cold persisted shard payload and rejects caller text divergence', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const accepted = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!accepted.accepted) throw new Error('expected accepted shard');
    const divergentShard = {
      ...fixtures.shards.Rewriter,
      publicTrace: 'Caller-controlled divergent text.',
    };
    const divergentHash = await sha256Canonical(divergentShard);
    const scope = persistenceContextForSessions([sessionByRole.Rewriter]);

    await expect(recoverCouncilTraceProjection({
      ctx: scope.ctx,
      registry,
      acceptedSessions: [sessionByRole.Rewriter],
      session: sessionByRole.Rewriter,
      turn: fixtures.turn,
      shard: divergentShard,
      shardPayloadHash: divergentHash,
      acceptanceSequence: accepted.acceptanceSequence,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
    expect(sessionByRole.Rewriter.events.filter(
      (event) => event.type === 'pact/public-trace',
    )).toHaveLength(1);
  });

  test('rejects every tampered accepted receipt field and linked projection time', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const accepted = await registry.acceptShard(session, fixtures.shards.Rewriter);
    if (!accepted.accepted) throw new Error('expected accepted shard');
    const tamperedReceipts = [
      { ...accepted, projectedTrace: false },
      { ...accepted, acceptedAtMonotonicMs: 9_999 },
      { ...accepted, traceEventSeq: null },
    ];
    for (const receipt of tamperedReceipts) {
      await expect(durableCouncilShard({
        ctx: persistenceContext(session).ctx,
        registry,
        session,
        receipt: receipt as never,
      })).rejects.toMatchObject({
        name: 'PactDurabilityError',
        code: 'PACT_DURABILITY_INCOMPLETE',
      });
    }
    const tamperedEvents = session.events.map((event) =>
      event.type === 'pact/public-trace'
        ? {
            ...event,
            data: { ...event.data, projectedAtMonotonicMs: 9_999 },
          }
        : event);
    await expect(durableCouncilShard({
      ctx: {
        sessions: { flush: async () => true },
        sessionPersistence: {
          inspect: async () => ({ meta: session.header, events: tamperedEvents }),
        },
      } as unknown as Context,
      registry,
      session,
      receipt: accepted,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
  });

  test('recomputes shard and commit payload hashes and verifies the full linked trace', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const shardSession = sessionByRole.Rewriter;
    const acceptedShard = await registry.acceptShard(
      shardSession,
      fixtures.shards.Rewriter,
    );
    if (!acceptedShard.accepted) throw new Error('expected accepted shard');
    const shardContext = persistenceContext(shardSession);
    const tamperedShardEvents = shardSession.events.map((event) =>
      event.type === 'pact/council-shard'
        ? {
            ...event,
            data: {
              ...event.data,
              payload: { ...(event.data.payload as Record<string, unknown>), publicTrace: 'tampered' },
            },
          }
        : event);
    const tamperedShardInspect = vi.fn(async () => ({
      meta: shardSession.header,
      events: tamperedShardEvents,
    }));
    await expect(durableCouncilShard({
      ctx: {
        sessions: { flush: shardContext.flush },
        sessionPersistence: { inspect: tamperedShardInspect },
      } as unknown as Context,
      registry,
      session: shardSession,
      receipt: acceptedShard,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });

    const conductor = sessionByRole.CaseConductor;
    const acceptedCommit = await registry.acceptCommit(
      conductor,
      fixtures.proposedCommit,
    );
    if (!acceptedCommit.accepted) throw new Error('expected accepted commit');
    const commitEvents = conductor.events.map((event) =>
      event.type === 'pact/conductor-commit'
        ? {
            ...event,
            data: {
              ...event.data,
              payloadHash: 'f'.repeat(64),
            },
          }
        : event);
    await expect(durableConductorCommit({
      ctx: {
        sessions: { flush: async () => true },
        sessionPersistence: {
          inspect: async () => ({ meta: conductor.header, events: commitEvents }),
        },
      } as unknown as Context,
      registry,
      session: conductor,
      receipt: acceptedCommit,
    })).rejects.toMatchObject({
      name: 'PactDurabilityError',
      code: 'PACT_DURABILITY_INCOMPLETE',
    });
  });

  test('does not expose a durable commit until required roles and selected hashes are durable', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const conductor = sessionByRole.CaseConductor;
    const acceptedCommit = await registry.acceptCommit(
      conductor,
      fixtures.proposedCommit,
    );
    if (!acceptedCommit.accepted) throw new Error('expected accepted commit');
    await durableConductorCommit({
      ctx: persistenceContext(conductor).ctx,
      registry,
      session: conductor,
      receipt: acceptedCommit,
    });
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toBeNull();

    const acceptedShard = await registry.acceptShard(
      sessionByRole.Rewriter,
      fixtures.shards.Rewriter,
    );
    if (!acceptedShard.accepted) throw new Error('expected accepted shard');
    await durableCouncilShard({
      ctx: persistenceContext(sessionByRole.Rewriter).ctx,
      registry,
      session: sessionByRole.Rewriter,
      receipt: acceptedShard,
    });
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toBeNull();
  });

  test('does not expose a durable commit for an empty selected hash set', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const hashes: string[] = [];
    for (const role of [
      'CaseConductor',
      'Witness',
      'Archivist',
      'Rewriter',
      'Guardian',
    ] as const) {
      const accepted = await registry.acceptShard(
        sessionByRole[role],
        fixtures.shards[role],
      );
      if (!accepted.accepted) throw new Error(`expected accepted ${role} shard`);
      hashes.push(accepted.payloadHash);
      await durableCouncilShard({
        ctx: persistenceContext(sessionByRole[role]).ctx,
        registry,
        session: sessionByRole[role],
        receipt: accepted,
      });
    }
    expect(hashes).toHaveLength(5);
    const acceptedCommit = await registry.acceptCommit(
      sessionByRole.CaseConductor,
      { ...fixtures.proposedCommit, selectedShardHashes: [] },
    );
    if (!acceptedCommit.accepted) throw new Error('expected accepted commit');
    await durableConductorCommit({
      ctx: persistenceContext(sessionByRole.CaseConductor).ctx,
      registry,
      session: sessionByRole.CaseConductor,
      receipt: acceptedCommit,
    });

    registry.closeSelectionBarrier(fixtures.turn.snapshot.turnId);
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toBeNull();
  });

  test('does not satisfy required roles with durable but unselected shards', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const hashByRole = new Map<string, string>();
    for (const role of [
      'CaseConductor',
      'Witness',
      'Archivist',
      'Rewriter',
      'Guardian',
    ] as const) {
      const accepted = await registry.acceptShard(
        sessionByRole[role],
        fixtures.shards[role],
      );
      if (!accepted.accepted) throw new Error(`expected accepted ${role} shard`);
      hashByRole.set(role, accepted.payloadHash);
      await durableCouncilShard({
        ctx: persistenceContext(sessionByRole[role]).ctx,
        registry,
        session: sessionByRole[role],
        receipt: accepted,
      });
    }
    const selectedShardHashes = [
      'CaseConductor',
      'Archivist',
      'Rewriter',
      'Guardian',
    ].map((role) => hashByRole.get(role) as string);
    const acceptedCommit = await registry.acceptCommit(
      sessionByRole.CaseConductor,
      { ...fixtures.proposedCommit, selectedShardHashes },
    );
    if (!acceptedCommit.accepted) throw new Error('expected accepted commit');
    await durableConductorCommit({
      ctx: persistenceContext(sessionByRole.CaseConductor).ctx,
      registry,
      session: sessionByRole.CaseConductor,
      receipt: acceptedCommit,
    });

    registry.closeSelectionBarrier(fixtures.turn.snapshot.turnId);
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toBeNull();
  });

  test('exposes a commit only from the frozen complete role and hash set', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const hashes: string[] = [];
    for (const role of [
      'CaseConductor',
      'Witness',
      'Archivist',
      'Rewriter',
      'Guardian',
    ] as const) {
      const accepted = await registry.acceptShard(
        sessionByRole[role],
        fixtures.shards[role],
      );
      if (!accepted.accepted) throw new Error(`expected accepted ${role} shard`);
      hashes.push(accepted.payloadHash);
      await durableCouncilShard({
        ctx: persistenceContext(sessionByRole[role]).ctx,
        registry,
        session: sessionByRole[role],
        receipt: accepted,
      });
    }
    const acceptedCommit = await registry.acceptCommit(
      sessionByRole.CaseConductor,
      {
        ...fixtures.proposedCommit,
        selectedShardHashes: hashes,
      },
    );
    if (!acceptedCommit.accepted) throw new Error('expected accepted commit');
    await durableConductorCommit({
      ctx: persistenceContext(sessionByRole.CaseConductor).ctx,
      registry,
      session: sessionByRole.CaseConductor,
      receipt: acceptedCommit,
    });
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toBeNull();

    registry.closeSelectionBarrier(fixtures.turn.snapshot.turnId);
    expect(registry.durableProposal(fixtures.turn.snapshot.turnId).durableCommit)
      .toMatchObject({ payloadHash: acceptedCommit.payloadHash });
  });

  test('reuses the accepted shard event when first-trace append fails', async () => {
    releases.push(registerPactSessionEventTypes());
    const { fixtures, registry, sessionByRole } = await openRegistry();
    const session = sessionByRole.Rewriter;
    const originalAppend = session.append.bind(session);
    let failTraceAppend = true;
    vi.spyOn(session, 'append').mockImplementation(((type: string, data: unknown) => {
      if (type === 'pact/public-trace' && failTraceAppend) {
        failTraceAppend = false;
        throw new Error('injected trace append failure');
      }
      return (originalAppend as unknown as (
        appendType: string,
        appendData: unknown,
      ) => SessionEvent)(type, data);
    }) as typeof session.append);

    await expect(registry.acceptShard(session, fixtures.shards.Rewriter))
      .rejects.toThrow('injected trace append failure');
    expect(session.events.filter((event) => event.type === 'pact/council-shard'))
      .toHaveLength(1);

    const retry = await registry.acceptShard(session, fixtures.shards.Rewriter);
    expect(retry).toMatchObject({
      accepted: true,
      acceptanceSequence: 1,
      shardEventSeq: 0,
      traceEventSeq: 1,
      projectedTrace: true,
    });
    expect(session.events.filter((event) => event.type === 'pact/council-shard'))
      .toHaveLength(1);
    expect(session.events.filter((event) => event.type === 'pact/public-trace'))
      .toHaveLength(1);
  });

  test('keeps the council-v2 model boundary to the two new tools', () => {
    expect(COUNCIL_ROOT_TOOLS).toEqual([
      'pact_submit_council_shard',
      'pact_submit_conductor_commit',
    ]);
    expect(COUNCIL_ROLE_TOOLS).toEqual(['pact_submit_council_shard']);
    expect(COUNCIL_ROOT_TOOLS).not.toContain('pact_publish_trace');
    expect(COUNCIL_ROOT_TOOLS).not.toContain('pact_route_turn');
    expect(COUNCIL_ROOT_TOOLS).not.toContain('pact_submit_draft');
  });
});
