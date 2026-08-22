import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it } from 'vitest';

import { createFoundationHarness } from '../src/create-foundation-harness.js';
import { mountCompatibilityProviderAdapters } from '../src/catalog-eligibility.js';
import { installProviderDispatchLedger } from '../src/provider-stream-ledger.js';
import {
  ScriptedAdapter,
  textResponse,
  toolCallResponse,
} from './scripted-adapter.js';

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
});
