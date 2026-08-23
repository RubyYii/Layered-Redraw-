import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import {
  createUserMessage,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { CP03_FOUNDATION_SCHEMA_VERSION } from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import { createFoundationHarness } from '../src/create-foundation-harness.js';
import { mountCompatibilityProviderAdapters } from '../src/catalog-eligibility.js';
import {
  installProviderDispatchLedger,
  type ProviderStreamAssignment,
} from '../src/provider-stream-ledger.js';
import {
  ScriptedAdapter,
  textResponse,
  toolCallResponse,
} from './scripted-adapter.js';

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const councilOrdinalOf = (options: GenerateOptions): number => {
  const text = options.messages
    .flatMap((message) => message.content)
    .flatMap((block) => block.type === 'text' ? [block.text] : [])
    .join('\n');
  const ordinal = Number(text.match(/declared-ordinal=(\d+)/)?.[1]);
  if (!Number.isInteger(ordinal)) throw new Error('declared ordinal missing');
  return ordinal;
};

class RetryWaveAdapter extends LlmAdapter {
  readonly requests: number[] = [];
  readonly higherFailureObserved = deferred<void>();
  private readonly attempts = new Map<number, number>();

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const ordinal = councilOrdinalOf(options);
    this.requests.push(ordinal);
    const attempt = (this.attempts.get(ordinal) ?? 0) + 1;
    this.attempts.set(ordinal, attempt);
    if (attempt === 1) {
      if (ordinal === 5) this.higherFailureObserved.resolve();
      throw new LlmError(`synthetic transport reset at ordinal ${ordinal}`, 'TRANSPORT');
    }
    yield* textResponse(`retry completed for ordinal ${ordinal}`);
  }
}

const councilWaveAssignment = (
  sessionId: string,
  declaredDispatchOrdinal: 3 | 5,
): ProviderStreamAssignment => ({
  sessionId,
  probeId: `council-wave-${declaredDispatchOrdinal}`,
  provider: 'deepseek',
  route: 'deepseek-official',
  model: 'deepseek-v4-pro',
  deadlineAt: 13_000,
  dispatches: [{
    purpose: `exercise retry arbitration for ordinal ${declaredDispatchOrdinal}`,
    expectedOutcome: 'terminal-after-tool-result',
  }],
  council: {
    role: declaredDispatchOrdinal === 3 ? 'Archivist' : 'Guardian',
    phase: 'SHARD',
    snapshotHash: 'a'.repeat(64),
    promptHash: `${declaredDispatchOrdinal}`.repeat(64),
    declaredDispatchOrdinal,
  },
});

describe('provider-configurable DSH foundation harness', () => {
  it('runs the Conductor through the exact selected mounted provider and model', async () => {
    const persistenceRoot = join(
      tmpdir(),
      `pact-provider-harness-${randomUUID()}`,
    );
    mkdirSync(persistenceRoot, { recursive: true });
    const deepseek = new ScriptedAdapter([textResponse('route selected')]);
    const gemini = new ScriptedAdapter([]);
    const harness = await createFoundationHarness({
      persistenceRoot,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], deepseek);
        ctx.llm.registerAdapter(['google'], gemini);
      },
      conductorSelection: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      },
    });

    try {
      const conductor = await harness.createConductor(
        SessionId(`case_${randomUUID().replaceAll('-', '')}`),
        { parked: false },
      );
      conductor.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'confirm the mounted route' }],
        source: { kind: 'user' },
      }));
      await conductor.agent.whenIdle();

      expect(deepseek.requests).toHaveLength(1);
      expect(deepseek.requests[0]).toMatchObject({
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      });
      expect(deepseek.requests[0]?.system).toContain(
        `PACT runtime identity: role=CaseConductor; sessionId=${conductor.agent.id}`,
      );
      expect(gemini.requests).toHaveLength(0);
    } finally {
      await harness.dispose();
    }
  });

  it('mounts the locked real adapter routes without opening a provider stream', async () => {
    const ctx = new Context();
    await ctx.plugin(LlmRuntime);
    try {
      await mountCompatibilityProviderAdapters(ctx, {
        geminiRoute: 'google',
      });

      expect(ctx.llm.listProviders().map((provider) => provider.id)).toEqual([
        'deepseek-official',
        'google',
      ]);
      await expect(ctx.llm.resolveModelInfo(
        'deepseek-official',
        'deepseek-v4-pro',
      )).resolves.toMatchObject({
        provider: 'deepseek-official',
        id: 'deepseek-v4-pro',
      });
      await expect(ctx.llm.resolveModelInfo(
        'google',
        'gemini-3.5-flash',
      )).resolves.toMatchObject({
        provider: 'google',
        id: 'gemini-3.5-flash',
        inputModalities: ['text', 'image'],
      });
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('records actual DSH model steps and accepted tool receipts at the stream boundary', async () => {
    const persistenceRoot = join(
      tmpdir(),
      `pact-provider-ledger-${randomUUID()}`,
    );
    mkdirSync(persistenceRoot, { recursive: true });
    const deepseek = new ScriptedAdapter([
      toolCallResponse(
        'tool_provider_trace01',
        'pact_publish_trace',
        {
          turnId: 'turn_ledger01',
          role: 'CaseConductor',
          text: 'A fictional trace crosses the synthetic room.',
        },
      ),
      textResponse('trace receipt consumed'),
      textResponse('second assigned turn consumed'),
    ]);
    const harness = await createFoundationHarness({
      persistenceRoot,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], deepseek);
      },
      conductorSelection: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      },
    });

    try {
      const ledger = installProviderDispatchLedger(harness.ctx, {
        runId: 'compat_stream_ledger01',
        maximumDispatches: 14,
        providerKind: 'real',
      });
      const conductor = await harness.createConductor(
        SessionId(`case_${randomUUID().replaceAll('-', '')}`),
        { parked: false },
      );
      ledger.assignSession({
        sessionId: conductor.agent.id,
        probeId: 'probe-ledger',
        provider: 'deepseek',
        route: 'deepseek-official',
        model: 'deepseek-v4-pro',
        dispatches: [
          {
            purpose: 'publish one bounded trace',
            expectedOutcome: 'structured-tool',
            expectedTools: ['pact_publish_trace'],
          },
          {
            purpose: 'consume the accepted trace result',
            expectedOutcome: 'terminal-after-tool-result',
          },
        ],
      });
      conductor.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'publish the fixed fictional trace' }],
        source: { kind: 'user' },
      }));
      await conductor.agent.whenIdle();
      await harness.ctx.sessions.flush(conductor.agent.session);

      expect(ledger.sentDispatches).toBe(2);
      const records = ledger.attemptRecords();
      expect(records).toHaveLength(2);
      expect(records.map((record) => record.contract.providerKind)).toEqual([
        'real',
        'real',
      ]);
      expect(records.map((record) => record.contract.finish.kind)).toEqual([
        'tool_calls',
        'stop',
      ]);
      expect(records[0]?.contract.firstChunkAt).not.toBeNull();
      expect(records[0]?.contract.firstPublicTraceAt).not.toBeNull();
      expect(records[0]?.contract.toolCalls).toEqual([{
        toolCallId: 'tool_provider_trace01',
        name: 'pact_publish_trace',
        argumentsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: 'accepted',
      }]);
      expect(ledger.assertComplete()).toEqual({
        completedAssignments: 1,
        sentDispatches: 2,
      });

      ledger.assignSession({
        sessionId: conductor.agent.id,
        probeId: 'probe-ledger-followup',
        provider: 'deepseek',
        route: 'deepseek-official',
        model: 'deepseek-v4-pro',
        dispatches: [{
          purpose: 'run one later assigned terminal turn',
          expectedOutcome: 'terminal-after-tool-result',
        }],
      });
      conductor.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'finish the second assigned turn' }],
        source: { kind: 'user' },
      }));
      await conductor.agent.whenIdle();
      expect(ledger.assertComplete()).toEqual({
        completedAssignments: 2,
        sentDispatches: 3,
      });
    } finally {
      await harness.dispose();
    }
  });

  it('waits for a predeclared provider wave before awarding its sole retry to the lower failed ordinal', async () => {
    const persistenceRoot = join(
      tmpdir(),
      `pact-provider-retry-wave-${randomUUID()}`,
    );
    mkdirSync(persistenceRoot, { recursive: true });
    const deepseek = new RetryWaveAdapter();
    const harness = await createFoundationHarness({
      persistenceRoot,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], deepseek);
      },
      conductorSelection: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      },
    });

    try {
      const ledger = installProviderDispatchLedger(harness.ctx, {
        runId: 'council_retry_wave01',
        maximumDispatches: 8,
        providerKind: 'scripted',
        deadlineAt: 13_000,
        now: () => 1_000,
      });
      const lower = await harness.createConductor(
        SessionId(`case_lower_${randomUUID().replaceAll('-', '')}`),
        { parked: false },
      );
      const higher = await harness.createConductor(
        SessionId(`case_higher_${randomUUID().replaceAll('-', '')}`),
        { parked: false },
      );
      const lowerAssignment = councilWaveAssignment(String(lower.agent.id), 3);
      const higherAssignment = councilWaveAssignment(String(higher.agent.id), 5);

      ledger.declareCouncilInitialWave([lowerAssignment, higherAssignment]);
      ledger.assignSession(higherAssignment);
      higher.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'declared-ordinal=5' }],
        source: { kind: 'user' },
      }));
      await deepseek.higherFailureObserved.promise;
      expect(deepseek.requests).toEqual([5]);

      ledger.assignSession(lowerAssignment);
      lower.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'declared-ordinal=3' }],
        source: { kind: 'user' },
      }));
      await Promise.all([higher.agent.whenIdle(), lower.agent.whenIdle()]);

      expect(deepseek.requests).toEqual([5, 3, 3]);
      expect(ledger.sentDispatches).toBe(3);
      expect(ledger.attemptRecords().filter((record) => record.attempt > 1).map(
        (record) => record.council?.declaredDispatchOrdinal,
      )).toEqual([3]);
    } finally {
      await harness.dispose();
    }
  });

  it('rejects a successful but undisclosed PACT tool in the fixed dispatch plan', async () => {
    const persistenceRoot = join(
      tmpdir(),
      `pact-provider-wrong-tool-${randomUUID()}`,
    );
    mkdirSync(persistenceRoot, { recursive: true });
    const deepseek = new ScriptedAdapter([
      toolCallResponse(
        'tool_provider_route01',
        'pact_route_turn',
        {
          turnId: 'turn_wrongtool01',
          publicTrace: 'A fictional route is proposed.',
          roles: ['Rewriter'],
          rationale: 'Use one bounded role for a synthetic scene.',
          uncertainties: [],
        },
      ),
      textResponse('route receipt consumed'),
    ]);
    const harness = await createFoundationHarness({
      persistenceRoot,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], deepseek);
      },
      conductorSelection: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      },
    });

    try {
      const ledger = installProviderDispatchLedger(harness.ctx, {
        runId: 'compat_stream_wrongtool01',
        maximumDispatches: 14,
        providerKind: 'real',
      });
      const conductor = await harness.createConductor(
        SessionId(`case_${randomUUID().replaceAll('-', '')}`),
        { parked: false },
      );
      ledger.assignSession({
        sessionId: conductor.agent.id,
        probeId: 'probe-wrong-tool',
        provider: 'deepseek',
        route: 'deepseek-official',
        model: 'deepseek-v4-pro',
        dispatches: [
          {
            purpose: 'publish one bounded trace',
            expectedOutcome: 'structured-tool',
            expectedTools: ['pact_publish_trace'],
          },
          {
            purpose: 'consume the accepted trace result',
            expectedOutcome: 'terminal-after-tool-result',
          },
        ],
      });
      conductor.agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'use the undisclosed route tool' }],
        source: { kind: 'user' },
      }));
      await conductor.agent.whenIdle();

      expect(() => (
        ledger as typeof ledger & { assertComplete(): void }
      ).assertComplete()).toThrow(/EXPECTED_PROVIDER_TOOL_MISSING/);
    } finally {
      await harness.dispose();
    }
  });

  it('marks a deadline-quarantined DSH tool receipt rejected and never promotes it', async () => {
    const persistenceRoot = join(
      tmpdir(),
      `pact-provider-late-tool-${randomUUID()}`,
    );
    mkdirSync(persistenceRoot, { recursive: true });
    const gate = deferred<void>();
    let lateContribution: Record<string, unknown> | undefined;
    const deepseek = new ScriptedAdapter([
      {
        gate: gate.promise,
        chunks: () => {
          if (lateContribution === undefined) {
            throw new Error('late contribution was not runtime-bound');
          }
          return toolCallResponse(
            'tool_provider_late01',
            'pact_submit_contribution',
            lateContribution,
          );
        },
      },
      textResponse('late contribution receipt consumed'),
    ]);
    const harness = await createFoundationHarness({
      persistenceRoot,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], deepseek);
      },
      conductorSelection: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      },
    });

    try {
      const ledger = installProviderDispatchLedger(harness.ctx, {
        runId: 'compat_stream_late01',
        maximumDispatches: 14,
        providerKind: 'real',
      });
      harness.ctx.subagents.registerContinuableSetup((childCtx) => {
        const child = childCtx.agent;
        if (child === undefined) throw new Error('late test child missing');
        ledger.assignSession({
          sessionId: child.id,
          probeId: 'probe-late-tool',
          provider: 'deepseek',
          route: 'deepseek-official',
          model: 'deepseek-v4-pro',
          dispatches: [
            {
              purpose: 'submit a contribution after its deadline',
              expectedOutcome: 'structured-tool',
              expectedTools: ['pact_submit_contribution'],
            },
            {
              purpose: 'consume the rejected late receipt',
              expectedOutcome: 'terminal-after-tool-result',
            },
          ],
        });
        lateContribution = {
          schemaVersion: CP03_FOUNDATION_SCHEMA_VERSION,
          role: 'Rewriter',
          childSessionId: String(child.id),
          turnId: 'turn_provider_late01',
          publicTrace: 'A fictional trace arrived after the gate closed.',
          proposal: 'This late proposal must remain quarantined.',
          uncertainties: ['The fictional timing is deliberately late.'],
          evidenceAnchors: ['synthetic-checkerboard'],
          assetRequests: [],
          dissent: [],
          toolReceiptRefs: [],
        };
        return () => {};
      });
      const parent = await harness.createConductor(
        SessionId(`case_${randomUUID().replaceAll('-', '')}`),
      );
      const started = await harness.ctx.subagents.startContinuable({
        provider: 'spawn',
        label: 'PACT Rewriter',
        request: {
          parent: parent.agent,
          prompt: [{ type: 'text', text: 'submit the late fictional contribution' }],
          agentOptions: {
            provider: 'deepseek-official',
            model: 'deepseek-v4-pro',
          },
          persona: 'You are the PACT Rewriter. Use only the visible PACT tool.',
          toolFilter: { allow: ['pact_submit_contribution'] },
        },
        signal: new AbortController().signal,
      });
      harness.registry.closeTurn('turn_provider_late01');
      gate.resolve();
      const child = harness.ctx.agents.get(started.childId);
      if (child === undefined) throw new Error('late test child not active');
      await child.whenIdle();

      expect(harness.registry.currentProposal('turn_provider_late01')).toEqual([]);
      const record = ledger.attemptRecords()[0];
      expect(record?.contract.lateQuarantined).toBe(true);
      expect(record?.contract.toolCalls[0]?.status).toBe('rejected');
      expect(() => ledger.assertComplete()).toThrow(
        /PROVIDER_RESULT_LATE_QUARANTINED/,
      );
    } finally {
      await harness.dispose();
    }
  });
});
