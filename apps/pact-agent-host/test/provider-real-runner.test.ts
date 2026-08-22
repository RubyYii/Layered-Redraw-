import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CallId,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import {
  CP03_FOUNDATION_SCHEMA_VERSION,
  validateProviderCallEnvelope,
} from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import { inspectCompatibilityConfig } from '../src/compatibility-config.js';
import { runProviderCompatibilityRuntime } from '../src/provider-real-runner.js';
import {
  textResponse,
  toolCallResponse,
} from './scripted-adapter.js';

const completeEnv = (): NodeJS.ProcessEnv => ({
  PACT_DEEPSEEK_MODEL: 'deepseek-v4-pro',
  PACT_GEMINI_ROUTE: 'google',
  PACT_GEMINI_MODEL: 'gemini-3.5-flash',
  PACT_COMPAT_MAX_USD: '0.50',
  DEEPSEEK_API_KEY: 'not-used-by-scripted-deepseek',
  GEMINI_API_KEY: 'not-used-by-scripted-gemini',
});

const textOf = (options: GenerateOptions): string => [
  options.system ?? '',
  ...options.messages.flatMap((message) =>
    message.content.flatMap((block) => block.type === 'text' ? [block.text] : [])
  ),
].join('\n');

const identityOf = (options: GenerateOptions) => {
  const match = /PACT runtime identity: role=([^;]+); sessionId=([^\.\s]+)/
    .exec(options.system ?? '');
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('SCRIPTED_RUNTIME_IDENTITY_MISSING');
  }
  return { role: match[1], sessionId: match[2] };
};

const probeOf = (options: GenerateOptions): number => {
  const matches = [...textOf(options).matchAll(/PACT_COMPAT_PROBE_(\d{2})/g)];
  const latest = matches.at(-1);
  if (latest?.[1] === undefined) {
    throw new Error('SCRIPTED_PROBE_MARKER_MISSING');
  }
  return Number(latest[1]);
};

const contribution = (
  options: GenerateOptions,
  turnId: string,
  proposal: string,
) => {
  const identity = identityOf(options);
  return {
    schemaVersion: CP03_FOUNDATION_SCHEMA_VERSION,
    role: identity.role,
    childSessionId: identity.sessionId,
    turnId,
    publicTrace: `A fictional ${identity.role} trace for ${turnId}.`,
    proposal,
    uncertainties: ['The synthetic distance remains interpretive.'],
    evidenceAnchors: ['synthetic-checkerboard'],
    assetRequests: [],
    dissent: [],
    toolReceiptRefs: [],
  };
};

const draft = (options: GenerateOptions) => {
  const identity = identityOf(options);
  const refsMatch = /PACT_CONTRIBUTION_REFS=(\[[^\n]+\])/.exec(textOf(options));
  const contributions = refsMatch?.[1] === undefined
    ? []
    : JSON.parse(refsMatch[1]) as unknown[];
  return {
    identity: {
      draftId: 'draft_probe_06',
      schemaVersion: CP03_FOUNDATION_SCHEMA_VERSION,
      caseSessionId: identity.sessionId,
      turnId: 'turn_chain_01',
      parentSceneHash: 'a'.repeat(64),
    },
    decision: { status: 'PROPOSED', actionSequence: ['Reframe'] },
    creative: {
      interpretation: 'Treat the checkerboard as a relation, not a recovered memory.',
      unresolvedAmbiguities: ['The fictional distance remains unresolved.'],
      spatialIntent: 'Keep the synthetic source fixed.',
      visualIntent: 'Preserve the seam between source and proposal.',
      cameraIntent: 'Hold a readable lateral relation.',
      lightIntent: 'Keep one restrained edge light.',
      soundIntent: 'Use only fictional room tone.',
      publicPoeticText: 'The grid leans; the source does not.',
      seamsAndContradictionsToPreserve: ['Near and not-near remain visible.'],
    },
    materials: {
      requestedAssetIds: [],
      requestedSpatialBridgeIds: [],
      provenanceAnchors: ['synthetic-checkerboard'],
      rightsRequirements: ['Use only generated gate fixtures.'],
    },
    execution: {
      executionMode: 'NON_EXECUTABLE_COMPATIBILITY',
      semanticCapabilityCalls: [],
      expectedChanges: [],
      forbiddenChanges: ['no scene mutation in provider gate'],
      rollbackRequirements: [],
      terminalIntent: null,
    },
    agency: {
      contributions,
      disagreements: [],
      guardianChallenge: 'Confirm that this draft encodes no mutation.',
    },
  };
};

const multipleToolResponse = (
  calls: readonly {
    readonly id: string;
    readonly name: string;
    readonly args: unknown;
  }[],
): readonly StreamChunk[] => [
  ...calls.flatMap((call, index): StreamChunk[] => {
    const id = CallId(call.id);
    const raw = JSON.stringify(call.args);
    return [
      { type: 'block-start', index, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index,
        id,
        name: call.name,
        argumentsDelta: raw,
      },
      {
        type: 'block-end',
        index,
        block: {
          type: 'tool-call',
          id,
          name: call.name,
          arguments: raw,
        },
      },
    ];
  }),
  { type: 'finish', reason: { kind: 'tool-calls' } },
];

const waitForAbort = async (signal: AbortSignal | undefined): Promise<never> =>
  new Promise<never>((_resolve, reject) => {
    const rejectAborted = () => reject(new LlmError(
      'scripted provider stream aborted by caller',
      'ABORTED',
    ));
    if (signal?.aborted) {
      rejectAborted();
      return;
    }
    if (signal === undefined) {
      reject(new Error('SCRIPTED_ABORT_SIGNAL_REQUIRED'));
      return;
    }
    signal.addEventListener('abort', rejectAborted, { once: true });
  });

class ProbeRoutingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  private readonly steps = new Map<string, number>();

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const probe = probeOf(options);
    const sessionId = String(options.sessionId);
    const stepKey = `${sessionId}:probe-${probe}`;
    const step = this.steps.get(stepKey) ?? 0;
    this.steps.set(stepKey, step + 1);

    let chunks: readonly StreamChunk[];
    if (probe === 1 || probe === 3 || probe === 4 || probe === 5) {
      if (step === 0) {
        chunks = toolCallResponse(
          `tool_probe_${String(probe).padStart(2, '0')}_contribution`,
          'pact_submit_contribution',
          contribution(
            options,
            probe === 4 || probe === 5 ? 'turn_chain_01' : `turn_probe_0${probe}`,
            `A bounded fictional proposal for probe ${probe}.`,
          ),
        );
      } else {
        chunks = textResponse(`probe ${probe} contribution receipt consumed`);
      }
    } else if (probe === 2) {
      chunks = step === 0
        ? multipleToolResponse([
            {
              id: 'tool_probe_02_trace',
              name: 'pact_publish_trace',
              args: {
                turnId: 'turn_chain_01',
                role: 'CaseConductor',
                text: 'A fictional chain begins at the synthetic grid.',
              },
            },
            {
              id: 'tool_probe_02_route',
              name: 'pact_route_turn',
              args: {
                turnId: 'turn_chain_01',
                publicTrace: 'The synthetic grid routes two bounded roles.',
                roles: ['Rewriter', 'Guardian'],
                rationale: 'Compare a reframing proposal with a safety challenge.',
                uncertainties: ['No source memory is claimed.'],
              },
            },
          ])
        : textResponse('probe 2 route and trace receipts consumed');
    } else if (probe === 6) {
      chunks = step === 0
        ? toolCallResponse(
            'tool_probe_06_draft',
            'pact_submit_draft',
            draft(options),
          )
        : textResponse('probe 6 draft receipt consumed');
    } else if (probe === 7) {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      await waitForAbort(options.signal);
      return;
    } else if (probe === 8) {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'x' };
      await waitForAbort(options.signal);
      return;
    } else {
      throw new Error(`SCRIPTED_PROBE_UNSUPPORTED: ${probe}`);
    }

    for (const chunk of chunks) yield chunk;
  }
}

describe('fixed real-provider DSH runner with local routing adapters', () => {
  it('completes eight logical probes through exactly twelve actual DSH streams', async () => {
    const root = join(tmpdir(), `pact-real-runner-${randomUUID()}`);
    const persistenceRoot = join(root, 'sessions');
    const dshHome = join(root, 'dsh');
    mkdirSync(root, { recursive: true });
    const deepseek = new ProbeRoutingAdapter();
    const gemini = new ProbeRoutingAdapter();

    const result = await runProviderCompatibilityRuntime({
      runId: 'compat_scripted_eight_probe01',
      config: inspectCompatibilityConfig(completeEnv()),
      persistenceRoot,
      dshHome,
      providerKind: 'scripted',
      cancellationDelayMs: 10,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], deepseek);
        ctx.llm.registerAdapter(['google'], gemini);
      },
    });

    expect(result).toMatchObject({
      status: 'COMPLETED',
      completedProbes: 8,
      sentDispatches: 12,
    });
    expect(deepseek.requests).toHaveLength(8);
    expect(gemini.requests).toHaveLength(4);
    expect(result.attemptRecords).toHaveLength(12);
    expect(result.attemptRecords.every((record) =>
      validateProviderCallEnvelope(record.contract) === record.contract
    )).toBe(true);
    expect(result.attemptRecords.filter((record) =>
      record.probeId === 'probe-04'
    ).every((record) =>
      record.contract.inputClasses.includes('synthetic_image')
    )).toBe(true);
    const multimodalRequest = gemini.requests.find((request) =>
      probeOf(request) === 4
    );
    expect(multimodalRequest?.messages.some((message) =>
      message.content.some((block) => block.type === 'image')
    )).toBe(true);
    expect(result.attemptRecords.filter((record) =>
      record.probeId === 'probe-07' || record.probeId === 'probe-08'
    ).map((record) => record.contract.finish.kind)).toEqual([
      'aborted',
      'aborted',
    ]);
  }, 10_000);
});
