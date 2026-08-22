import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session';
import {
  CP03_FOUNDATION_SCHEMA_VERSION,
  sha256Canonical,
} from '@layered-redraw/pact-cp03-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  coldInspect,
  createFoundationHarness,
  type FoundationHarness,
} from '../src/create-foundation-harness.js';
import {
  durableTurn,
  PactDurabilityError,
} from '../src/durable-turn.js';
import type { PactRole } from '../src/events.js';
import {
  ScriptedAdapter,
  textResponse,
  toolCallResponse,
  type ScriptEntry,
} from './scripted-adapter.js';

const roots: string[] = [];
const harnesses: FoundationHarness[] = [];

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const testRoot = (): string => {
  const root = join(
    tmpdir(),
    `layered-redraw-pact-cp03-${randomUUID()}`,
  );
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
};

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.dispose();
  }
});

const waitUntil = async (
  predicate: () => boolean,
  label: string,
): Promise<void> => {
  await vi.waitFor(() => {
    expect(predicate(), label).toBe(true);
  }, { timeout: 5_000, interval: 5 });
};

const contribution = (
  childSessionId: string,
  turnId: string,
  proposal: string,
  role: PactRole = 'Rewriter',
) => ({
  schemaVersion: CP03_FOUNDATION_SCHEMA_VERSION,
  role,
  childSessionId,
  turnId,
  publicTrace: `public trace for ${turnId}`,
  proposal,
  uncertainties: ['the remembered distance remains unresolved'],
  evidenceAnchors: ['fictional-memory-fragment'],
  assetRequests: [],
  dissent: [],
  toolReceiptRefs: [],
});

const startRewriter = async (
  harness: FoundationHarness,
  prompt: string,
) => {
  const conductor = await harness.createConductor(
    SessionId(`case_${randomUUID().replaceAll('-', '')}`),
  );
  const started = await harness.ctx.subagents.startContinuable({
    provider: 'spawn',
    label: 'PACT Rewriter',
    request: {
      parent: conductor.agent,
      prompt: [{ type: 'text', text: prompt }],
      agentOptions: { provider: 'pact-fake', model: 'pact-fake' },
      persona:
        'You are the PACT Rewriter. Use only the registered PACT tools.',
      toolFilter: {
        allow: ['pact_publish_trace', 'pact_submit_contribution'],
      },
    },
    signal: new AbortController().signal,
  });
  return { conductor, started };
};

const eventsOfType = <T extends SessionEvent['type']>(
  events: readonly SessionEvent[],
  type: T,
): SessionEvent<T>[] =>
  events.filter((event): event is SessionEvent<T> => event.type === type);

describe('real DSH rc.6 foundation with a scripted adapter', () => {
  it('keeps one continuable child across two durable turns and a cold JSONL read', async () => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    let firstArgs: ReturnType<typeof contribution> | undefined;
    let secondArgs: ReturnType<typeof contribution> | undefined;
    const script: ScriptEntry[] = [
      {
        gate: firstGate.promise,
        chunks: () => {
          if (firstArgs === undefined) throw new Error('first args not bound');
          return toolCallResponse(
            'tool_first_contribution',
            'pact_submit_contribution',
            firstArgs,
          );
        },
      },
      textResponse('first contribution recorded'),
      {
        gate: secondGate.promise,
        chunks: () => {
          if (secondArgs === undefined) throw new Error('second args not bound');
          return toolCallResponse(
            'tool_second_contribution',
            'pact_submit_contribution',
            secondArgs,
          );
        },
      },
      textResponse('second contribution recorded'),
    ];
    const adapter = new ScriptedAdapter(script);
    const persistenceRoot = testRoot();
    const harness = await createFoundationHarness({
      persistenceRoot,
      scriptedAdapter: adapter,
    });
    harnesses.push(harness);

    const { conductor, started } = await startRewriter(
      harness,
      'submit the first contribution',
    );
    const childSession = harness.sessionFor(started.childId);
    firstArgs = contribution(
      started.childId,
      'turn_foundation01',
      'translate the remembered window into a reversible spatial seam',
    );
    const firstHash = await sha256Canonical(firstArgs);
    const firstDurable = durableTurn(
      harness.ctx,
      childSession,
      1,
      firstArgs.turnId,
      firstHash,
    );
    firstGate.resolve();
    await expect(firstDurable).resolves.toMatchObject({
      status: 'DURABLE',
      sessionId: started.childId,
      submissionHash: firstHash,
    });

    await waitUntil(
      () => harness.ctx.agents.get(started.childId) === undefined,
      'the first activation should settle before cold resume',
    );
    secondArgs = contribution(
      started.childId,
      'turn_foundation02',
      'preserve the first uncertainty while reframing the room boundary',
    );
    await harness.ctx.subagents.followup(
      conductor.agent,
      started.childId,
      [{
        type: 'text',
        text: 'submit the second contribution and preserve the first uncertainty',
      }],
      {
        source: { kind: 'user' },
        signal: new AbortController().signal,
      },
    );
    const resumedSession = harness.sessionFor(started.childId);
    expect(resumedSession.id).toBe(childSession.id);
    const secondHash = await sha256Canonical(secondArgs);
    const secondDurable = durableTurn(
      harness.ctx,
      resumedSession,
      2,
      secondArgs.turnId,
      secondHash,
    );
    secondGate.resolve();
    await expect(secondDurable).resolves.toMatchObject({
      status: 'DURABLE',
      sessionId: started.childId,
      submissionHash: secondHash,
    });

    expect(adapter.remaining()).toBe(0);
    expect(
      adapter.requests.every((request) =>
        request.provider === 'pact-fake' && request.model === 'pact-fake'
      ),
    ).toBe(true);
    expect(
      adapter.requests.map((request) =>
        request.tools?.map((tool) => tool.name).sort()
      ),
    ).toEqual([
      ['pact_publish_trace', 'pact_submit_contribution'],
      ['pact_publish_trace', 'pact_submit_contribution'],
      ['pact_publish_trace', 'pact_submit_contribution'],
      ['pact_publish_trace', 'pact_submit_contribution'],
    ]);
    await harness.dispose();
    harnesses.splice(harnesses.indexOf(harness), 1);
    const cold = await coldInspect(persistenceRoot, started.childId);
    expect(cold.meta.id).toBe(started.childId);
    const viewerTurns = eventsOfType(cold.events, 'user/message').filter(
      (event) => event.data.source.kind === 'user',
    );
    expect(viewerTurns).toHaveLength(2);
    expect(
      viewerTurns.map((event) =>
        event.data.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
      ),
    ).toEqual([
      'submit the first contribution',
      'submit the second contribution and preserve the first uncertainty',
    ]);
    const submissions = eventsOfType(cold.events, 'pact/contribution');
    expect(submissions.map((event) => event.data.payloadHash)).toEqual([
      firstHash,
      secondHash,
    ]);
    expect(
      submissions.map((event) => event.data.payload).map((payload) =>
        (payload as { childSessionId: string }).childSessionId
      ),
    ).toEqual([started.childId, started.childId]);
  });

  it.each([
    {
      label: 'malformed arguments',
      args: { role: 'Rewriter' },
      expectedError: 'validation failed',
    },
    {
      label: 'role forgery',
      args: 'FORGERY',
      expectedError: 'PACT_ROLE_OR_SESSION_FORGERY',
    },
  ])('rejects $label without accepting a contribution', async ({
    args,
    expectedError,
  }) => {
    let boundArgs: unknown = args;
    const adapter = new ScriptedAdapter([
      (options) => {
        if (args === 'FORGERY') {
          if (options.sessionId === undefined) {
            throw new Error('missing child session id');
          }
          boundArgs = contribution(
            options.sessionId,
            'turn_rejected01',
            'claim authority that the runtime did not assign',
            'Guardian',
          );
        }
        return toolCallResponse(
          'tool_rejected_contribution',
          'pact_submit_contribution',
          boundArgs,
        );
      },
      textResponse('error observed'),
    ]);
    const persistenceRoot = testRoot();
    const harness = await createFoundationHarness({
      persistenceRoot,
      scriptedAdapter: adapter,
    });
    harnesses.push(harness);
    const { started } = await startRewriter(harness, 'submit invalid data');
    const session = harness.sessionFor(started.childId);
    await waitUntil(
      () => eventsOfType(session.events, 'turn/end').length === 1,
      'the rejected tool turn should end',
    );
    await harness.ctx.sessions.flush(session);
    expect(eventsOfType(session.events, 'pact/contribution')).toHaveLength(0);
    const results = eventsOfType(session.events, 'tool/result');
    expect(results).toHaveLength(1);
    expect(results[0]?.data.message.content[0]?.type).toBe('tool-result');
    const resultBlock = results[0]?.data.message.content[0];
    expect(resultBlock?.type === 'tool-result' && resultBlock.isError).toBe(true);
    expect(JSON.stringify(resultBlock)).toContain(
      expectedError,
    );
  });

  it('cancels a hanging stream without creating a draft', async () => {
    const adapter = new ScriptedAdapter(['hang']);
    const harness = await createFoundationHarness({
      persistenceRoot: testRoot(),
      scriptedAdapter: adapter,
    });
    harnesses.push(harness);
    const conductor = await harness.createConductor(
      SessionId(`case_${randomUUID().replaceAll('-', '')}`),
      { parked: false },
    );
    conductor.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'begin a draft and wait' }],
      source: { kind: 'user' },
    }));
    await waitUntil(
      () => adapter.requests.length === 1,
      'the scripted stream should have started',
    );
    conductor.agent.cancel({ kind: 'user' });
    await conductor.agent.whenIdle();
    await harness.ctx.sessions.flush(conductor.agent.session);
    expect(
      eventsOfType(conductor.agent.session.events, 'pact/draft'),
    ).toHaveLength(0);
    const end = eventsOfType(conductor.agent.session.events, 'turn/end').at(-1);
    expect(['aborted', 'error']).toContain(end?.data.reason.kind);
  });

  it('quarantines a contribution submitted after the turn deadline', async () => {
    let lateArgs: ReturnType<typeof contribution> | undefined;
    const gate = deferred<void>();
    const adapter = new ScriptedAdapter([
      {
        gate: gate.promise,
        chunks: () => {
          if (lateArgs === undefined) throw new Error('late args not bound');
          return toolCallResponse(
            'tool_late_contribution',
            'pact_submit_contribution',
            lateArgs,
          );
        },
      },
      textResponse('late result observed'),
    ]);
    const harness = await createFoundationHarness({
      persistenceRoot: testRoot(),
      scriptedAdapter: adapter,
    });
    harnesses.push(harness);
    const { started } = await startRewriter(harness, 'submit after closure');
    lateArgs = contribution(
      started.childId,
      'turn_deadline01',
      'this must not enter the current proposal',
    );
    harness.registry.closeTurn(lateArgs.turnId);
    gate.resolve();
    const session = harness.sessionFor(started.childId);
    await waitUntil(
      () => eventsOfType(session.events, 'turn/end').length === 1,
      'the late turn should end',
    );
    await harness.ctx.sessions.flush(session);
    expect(eventsOfType(session.events, 'pact/contribution')).toHaveLength(0);
    expect(eventsOfType(session.events, 'pact/quarantine')).toHaveLength(1);
    expect(harness.registry.currentProposal(lateArgs.turnId)).toEqual([]);
  });

  it('keeps evidence NOT_DURABLE when one flush participant fails', async () => {
    const gate = deferred<void>();
    let validArgs: ReturnType<typeof contribution> | undefined;
    const adapter = new ScriptedAdapter([
      {
        gate: gate.promise,
        chunks: () => {
          if (validArgs === undefined) throw new Error('valid args not bound');
          return toolCallResponse(
            'tool_flush_failure',
            'pact_submit_contribution',
            validArgs,
          );
        },
      },
      textResponse('submission reached the log'),
    ]);
    const harness = await createFoundationHarness({
      persistenceRoot: testRoot(),
      scriptedAdapter: adapter,
    });
    harnesses.push(harness);
    const { started } = await startRewriter(harness, 'submit before flush fails');
    validArgs = contribution(
      started.childId,
      'turn_flushfail01',
      'this is logged but cannot be certified durable',
    );
    const session = harness.sessionFor(started.childId);
    const injected = harness.ctx.on('session/flush', () => {
      throw new Error('INJECTED_FLUSH_FAILURE');
    });
    const checking = durableTurn(
      harness.ctx,
      session,
      1,
      validArgs.turnId,
      await sha256Canonical(validArgs),
    );
    gate.resolve();
    const error = await checking.catch((caught: unknown) => caught);
    injected();
    expect(error).toBeInstanceOf(PactDurabilityError);
    expect(error).toMatchObject({
      status: 'NOT_DURABLE',
      code: 'PACT_DURABILITY_FLUSH_FAILED',
    });
  });
});
