import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import {
  Session,
  SessionId,
  type SessionEvent,
} from '@deepseek-ai/dsh-session';
import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CaseSessionLedger } from '../src/case-session.js';
import { persistCaseSessionTransition } from '../src/case-session-persistence.js';
import {
  coldInspect,
  createFoundationHarness,
  type FoundationHarness,
} from '../src/create-foundation-harness.js';
import { ScriptedAdapter } from './scripted-adapter.js';

const harnesses: FoundationHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.dispose();
  }
});

function persistenceRoot(): string {
  const root = join(tmpdir(), `pact-case-transition-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function transitionFor(rootDshSessionId: string) {
  const ledger = new CaseSessionLedger({
    caseSessionId: rootDshSessionId,
    mode: 'checkpoint',
    rootDshSessionId,
    initialSceneHash: 'a'.repeat(64),
  });
  return ledger.recordApprovedExecution({
    caseSessionId: rootDshSessionId,
    turnId: 'turn_durable_translate01',
    draftHash: 'b'.repeat(64),
    approvalId: 'approval_durable_translate01',
    receiptId: 'receipt_durable_translate01',
    parentSceneHash: 'a'.repeat(64),
    resultSceneHash: 'c'.repeat(64),
    actionSequence: ['Translate'],
    settledAt: '2026-08-22T20:10:00.000Z',
  });
}

function contextDouble(input: {
  readonly flush: () => Promise<boolean>;
  readonly inspect: () => Promise<{
    readonly meta: Session['header'];
    readonly events: readonly SessionEvent[];
  }>;
}): Context {
  return {
    sessions: { flush: input.flush },
    sessionPersistence: { inspect: input.inspect },
  } as unknown as Context;
}

function allKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) allKeys(entry, found);
    return found;
  }
  if (value === null || typeof value !== 'object') return found;
  for (const [key, entry] of Object.entries(value)) {
    found.add(key);
    allKeys(entry, found);
  }
  return found;
}

describe('CaseSession transition persistence', () => {
  test('registers and durably cold-reads one bounded transition event', async () => {
    const adapter = new ScriptedAdapter([]);
    const root = persistenceRoot();
    const harness = await createFoundationHarness({
      persistenceRoot: root,
      scriptedAdapter: adapter,
    });
    harnesses.push(harness);
    const conductor = await harness.createConductor(
      SessionId('case_durable_transition01'),
    );
    const transition = transitionFor(String(conductor.agent.id));

    const receipt = await persistCaseSessionTransition({
      ctx: harness.ctx,
      session: conductor.agent.session,
      transition,
    });

    expect(receipt).toMatchObject({
      status: 'DURABLE',
      sessionId: conductor.agent.id,
      transitionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      lastSeq: expect.any(Number),
    });
    expect(receipt.transitionHash).toBe(await sha256Canonical(transition));
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.keys(receipt).sort()).toEqual([
      'lastSeq',
      'sessionId',
      'status',
      'transitionHash',
    ]);
    expect(adapter.requests).toHaveLength(0);

    const inspected = await coldInspect(root, conductor.agent.id);
    const event = inspected.events.find(
      (candidate) => candidate.type === 'pact/case-transition',
    );
    expect(event).toMatchObject({
      seq: receipt.lastSeq,
      type: 'pact/case-transition',
      data: {
        caseSessionId: String(conductor.agent.id),
        turnId: 'turn_durable_translate01',
        kind: 'APPROVED_EXECUTION',
        transitionHash: receipt.transitionHash,
      },
    });
    expect(event?.type).toBe('pact/case-transition');
    if (event?.type !== 'pact/case-transition') {
      throw new Error('expected persisted case transition event');
    }
    expect(event.data.payload).toEqual(transition);

    const forbidden = new Set([
      'viewerText',
      'prompt',
      'chainOfThought',
      'apiKey',
      'authorization',
      'credential',
      'secret',
    ]);
    expect(
      [...allKeys(event.data)].filter((key) => forbidden.has(key)),
    ).toEqual([]);
  });

  test('rejects a DSH session that is not the transition root before append', async () => {
    const transition = transitionFor('case_expected_root01');
    const otherSession = Session.create(SessionId('case_other_root01'));

    await expect(
      persistCaseSessionTransition({
        ctx: {} as Context,
        session: otherSession,
        transition,
      }),
    ).rejects.toThrow(/CASE_TRANSITION_ROOT_SESSION_MISMATCH/);
    expect(otherSession.events).toHaveLength(0);
  });

  test('reports failed flush participation without retrying or inspecting', async () => {
    const session = Session.create(SessionId('case_flush_failure01'));
    const transition = transitionFor(String(session.id));
    const flush = vi.fn(async () => false);
    const inspect = vi.fn(async () => ({
      meta: session.header,
      events: session.events,
    }));
    const ctx = contextDouble({ flush, inspect });

    const error = await persistCaseSessionTransition({
      ctx,
      session,
      transition,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/CASE_TRANSITION_FLUSH_FAILED/);
    expect(String(error)).not.toContain('postState');
    expect(String(error)).not.toContain('actionSequence');
    expect(flush).toHaveBeenCalledTimes(1);
    expect(inspect).not.toHaveBeenCalled();
    expect(
      session.events.filter((event) => event.type === 'pact/case-transition'),
    ).toHaveLength(1);
  });

  test('rejects inspection that does not contain the exact transition hash', async () => {
    const session = Session.create(SessionId('case_incomplete01'));
    const transition = transitionFor(String(session.id));
    const flush = vi.fn(async () => true);
    const inspect = vi.fn(async () => ({
      meta: session.header,
      events: [],
    }));
    const ctx = contextDouble({ flush, inspect });

    await expect(
      persistCaseSessionTransition({ ctx, session, transition }),
    ).rejects.toThrow(/CASE_TRANSITION_DURABILITY_INCOMPLETE/);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  test('classifies a thrown flush as failed without automatic retry', async () => {
    const session = Session.create(SessionId('case_flush_throw01'));
    const transition = transitionFor(String(session.id));
    const flush = vi.fn(async (): Promise<boolean> => {
      throw new Error('injected flush transport failure');
    });
    const inspect = vi.fn(async () => ({
      meta: session.header,
      events: session.events,
    }));

    await expect(
      persistCaseSessionTransition({
        ctx: contextDouble({ flush, inspect }),
        session,
        transition,
      }),
    ).rejects.toThrow(/CASE_TRANSITION_FLUSH_FAILED/);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(inspect).not.toHaveBeenCalled();
  });

});
