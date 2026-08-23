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

const releases: Array<() => void> = [];
const harnesses: FoundationHarness[] = [];

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const harness of harnesses.splice(0)) await harness.dispose();
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
  const registry = new CouncilRegistry({
    submissions,
    now: () => clock,
  });
  registry.openTurn(fixtures.turn);
  return {
    fixtures: boundFixtures,
    registry,
    submissions,
    sessionByRole,
    setNow(value: number) {
      clock = value;
    },
  };
};

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
    const durable = {
      ...first,
      status: 'DURABLE' as const,
      sessionId: String(sessionByRole.Rewriter.id),
      lastSeq: sessionByRole.Rewriter.events.at(-1)?.seq ?? first.shardEventSeq,
    };
    registry.markShardDurable(durable);
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
      .toMatchObject({ payloadHash: accepted.payloadHash });
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
    const { fixtures, sessionByRole } = await openRegistry();
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
    const input = {
      ctx: {
        sessions: { flush: vi.fn(async () => true) },
        sessionPersistence: {
          inspect: vi.fn(async () => ({ meta: session.header, events: session.events })),
        },
      } as unknown as Context,
      session,
      turn: fixtures.turn,
      shard,
      shardPayloadHash,
      acceptanceSequence: 1,
      now: () => 4_800,
    } as const;
    const repaired = await recoverCouncilTraceProjection(input);
    expect(repaired.appended).toBe(true);
    expect(repaired.traceEventSeq).toBe(1);
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
