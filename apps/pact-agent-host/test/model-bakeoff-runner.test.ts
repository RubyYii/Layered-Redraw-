import { describe, expect, it } from 'vitest';
import * as cp03Contracts from '@layered-redraw/pact-cp03-contracts';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import type { ModelBakeoffApproval } from '../src/model-bakeoff-gate.js';
import { createModelBakeoffPlan } from '../src/model-bakeoff-plan.js';
import {
  createModelBakeoffKeychainReferenceManifest,
  createModelBakeoffPreflight,
  type CandidateCatalogFact,
} from '../src/model-bakeoff-preflight.js';
import {
  createModelBakeoffPricingManifest,
  createModelBakeoffRoleCapsManifest,
} from '../src/model-bakeoff-pricing.js';
import {
  runModelBakeoff,
  type ModelBakeoffDispatchRequest,
  type ModelBakeoffTransport,
  type ModelBakeoffTransportResult,
} from '../src/model-bakeoff-runner.js';

const NOW = Date.parse('2000-01-01T12:05:00.000Z');
const RUN_ID = 'cp03-model-bakeoff-20000101T120000Z';
const validateModelBakeoffAttempt = (
  cp03Contracts as unknown as {
    readonly validateModelBakeoffAttempt: (value: unknown) => unknown;
  }
).validateModelBakeoffAttempt;

const candidates = (): CandidateCatalogFact[] => [
  ...['deepseek-v4-pro', 'deepseek-v4-flash'].map((model): CandidateCatalogFact => ({
    provider: 'deepseek',
    route: 'deepseek-official',
    model,
    name: model,
    inputModalities: ['text'],
    adapterPackage: '@deepseek-ai/dsh-llm-deepseek',
    adapterVersion: '0.1.0-rc.6',
    catalogPackage: null,
    catalogVersion: null,
  })),
  ...['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash'].map(
    (model): CandidateCatalogFact => ({
      provider: 'gemini',
      route: 'google',
      model,
      name: model,
      inputModalities: ['text', 'image'],
      adapterPackage: '@deepseek-ai/dsh-llm-pi-ai',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: '@earendil-works/pi-ai',
      catalogVersion: '0.84.2',
    }),
  ),
];

const runnerInput = () => {
  const fixtures = createModelBakeoffFixtures();
  const plan = createModelBakeoffPlan(fixtures.manifest);
  const pricing = createModelBakeoffPricingManifest({
    retrievedAt: '2000-01-01T00:00:00.000Z',
    sources: [
      { provider: 'deepseek', url: 'https://api-docs.deepseek.com/quick_start/pricing', pageSha256: 'a'.repeat(64) },
      { provider: 'gemini', url: 'https://ai.google.dev/gemini-api/docs/pricing', pageSha256: 'b'.repeat(64) },
    ],
    rates: Object.fromEntries([
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
    ].map((model) => [model, {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2,
      assumption: 'synthetic test-only rate',
    }])),
  });
  const roleCaps = createModelBakeoffRoleCapsManifest({
    ConductorIntent: { maxInputTokens: 1_000, maxOutputTokens: 100 },
    Archivist: { maxInputTokens: 1_000, maxOutputTokens: 100 },
    Guardian: { maxInputTokens: 1_000, maxOutputTokens: 100 },
    ConductorCommit: { maxInputTokens: 1_000, maxOutputTokens: 100 },
    Witness: { maxInputTokens: 1_000, maxOutputTokens: 100 },
    Rewriter: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  });
  const keychain = createModelBakeoffKeychainReferenceManifest([
    { provider: 'deepseek', envRef: 'DEEPSEEK_API_KEY', keychainService: 'pact-test-deepseek', keychainAccount: 'test-account' },
    { provider: 'gemini', envRef: 'GEMINI_API_KEY', keychainService: 'pact-test-gemini', keychainAccount: 'test-account' },
  ]);
  const preflight = createModelBakeoffPreflight({
    runId: RUN_ID,
    plan,
    fixtures: fixtures.manifest,
    pricing,
    roleCaps,
    keychainReferences: keychain,
    credentialPresence: keychain.references.map((reference) => ({ ...reference, present: true })),
    candidateFacts: candidates(),
    now: NOW,
  });
  const approval: ModelBakeoffApproval = {
    schemaVersion: 'cp03-model-bakeoff-approval/0.1',
    approvalId: 'approval_cp03_model_bakeoff_20000101',
    approvedAt: '2000-01-01T12:00:00.000Z',
    runId: RUN_ID,
    planSha256: preflight.planSha256,
    preflightSha256: preflight.preflightSha256,
    fixtureManifestSha256: preflight.fixtureManifestSha256,
    promptManifestSha256: preflight.promptManifestSha256,
    schemaManifestSha256: preflight.schemaManifestSha256,
    pricingManifestSha256: preflight.pricingManifestSha256,
    candidates: [
      { provider: 'deepseek', route: 'deepseek-official', model: 'deepseek-v4-pro' },
      { provider: 'deepseek', route: 'deepseek-official', model: 'deepseek-v4-flash' },
      { provider: 'gemini', route: 'google', model: 'gemini-3.5-flash' },
      { provider: 'gemini', route: 'google', model: 'gemini-3.6-flash' },
      { provider: 'gemini', route: 'google', model: 'gemini-3.7-flash' },
    ],
    repetitions: 2,
    counts: { intended: 28, eligible: 28, excluded: 0, sent: 0, plannedDispatches: 28, maximumDispatches: 30 },
    inputClasses: ['fictional_text', 'synthetic_spatial_image', 'synthetic_scene_registry'],
    tokenCapsSha256: roleCaps.manifestSha256,
    keychainReferencesSha256: keychain.manifestSha256,
    retrySlots: { deepseek: 1, gemini: 1 },
    worstCaseEstimatedUsd: preflight.worstCaseEstimatedUsd!,
    maxUsd: 0.05,
    oneRunOnly: true,
    automaticRerun: false,
    externalCapabilities: [],
  };
  let clock = NOW;
  return {
    approval,
    preflight,
    plan,
    now: () => {
      const value = clock;
      clock += 100;
      return value;
    },
  } as const;
};

const resultFor = (
  request: ModelBakeoffDispatchRequest,
  override: Partial<ModelBakeoffTransportResult> = {},
): ModelBakeoffTransportResult => ({
  kind: 'accepted',
  detailCode: null,
  preSideEffect: false,
  sideEffectAccepted: true,
  providerRequestMade: false,
  firstChunkDelayMs: 10,
  firstPublicTraceDelayMs: 20,
  usage: {
    inputTokens: 100,
    outputTokens: 10,
    totalTokens: 110,
    estimatedCostUsd: 0.0001,
  },
  providerFacts: request.case.provider === 'deepseek'
    ? {
      adapterPackage: '@deepseek-ai/dsh-llm-deepseek',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: null,
      catalogVersion: null,
    }
    : {
      adapterPackage: '@deepseek-ai/dsh-llm-pi-ai',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: '@earendil-works/pi-ai',
      catalogVersion: '0.84.2',
    },
  toolResult: request.case.phase === 'ConductorCommit'
    ? {
      name: 'pact_submit_conductor_commit',
      contract: 'conductor-draft-commit/0.1',
      accepted: true,
      payloadSha256: 'c'.repeat(64),
    }
    : {
      name: 'pact_submit_council_shard',
      contract: 'council-shard/0.1',
      accepted: true,
      payloadSha256: 'd'.repeat(64),
    },
  groundedInputRefs: request.case.role === 'Witness' || request.case.role === 'Rewriter'
    ? ['synthetic-spatial-image-01', 'synthetic-scene-01']
    : ['synthetic-scene-01'],
  redactedOutputSha256: 'e'.repeat(64),
  sessionEventRange: {
    sessionId: `550e8400-e29b-41d4-a716-${String(request.sentOrdinal).padStart(12, '0')}`,
    fromSequence: request.sentOrdinal * 10,
    toSequence: request.sentOrdinal * 10 + 5,
  },
  ...override,
});

class ScriptedTransport implements ModelBakeoffTransport {
  readonly requests: ModelBakeoffDispatchRequest[] = [];
  disposed = 0;

  constructor(
    private readonly handler: (
      request: ModelBakeoffDispatchRequest,
    ) => ModelBakeoffTransportResult | Promise<ModelBakeoffTransportResult> = resultFor,
  ) {}

  async dispatch(request: ModelBakeoffDispatchRequest): Promise<ModelBakeoffTransportResult> {
    this.requests.push(request);
    return this.handler(request);
  }

  async dispose(): Promise<void> {
    this.disposed += 1;
  }
}

describe('bounded model bakeoff runner', () => {
  it('dispatches exactly 28 accepted cases serially with immutable evidence and no hidden stream', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport();
    const result = await runModelBakeoff({ ...input, transport });

    expect(result.status).toBe('COMPLETED');
    expect(result.counts).toMatchObject({ planned: 28, sent: 28, accepted: 28, failed: 0, skipped: 0, maximum: 30 });
    expect(result.providerRequestsMade).toBe(0);
    expect(transport.requests).toHaveLength(28);
    expect(transport.requests.map(({ sentOrdinal }) => sentOrdinal)).toEqual(
      Array.from({ length: 28 }, (_, index) => index + 1),
    );
    expect(transport.requests.map(({ case: entry }) => entry.caseId)).toEqual(
      input.plan.map(({ caseId }) => caseId),
    );
    expect(result.attempts).toHaveLength(28);
    expect(result.attempts.every((attempt) => validateModelBakeoffAttempt(attempt) === attempt))
      .toBe(true);
    expect(Object.isFrozen(result.attempts)).toBe(true);
    expect(result.attempts.every(Object.isFrozen)).toBe(true);
    expect(result).not.toHaveProperty('continue');
    expect(result).not.toHaveProperty('rerun');
    expect(transport).not.toHaveProperty('stream');
    expect(transport.disposed).toBe(1);
  });

  it('uses one exact non-transferable retry slot per provider and reaches but never exceeds 30', async () => {
    const input = runnerInput();
    const failedProviders = new Set<string>();
    const transport = new ScriptedTransport((request) => {
      if (request.attemptOrdinal === 1 && !failedProviders.has(request.case.provider)) {
        failedProviders.add(request.case.provider);
        return resultFor(request, {
          kind: 'transport_failure',
          detailCode: 'PRE_SIDE_EFFECT_TRANSPORT',
          preSideEffect: true,
          sideEffectAccepted: false,
          toolResult: { ...resultFor(request).toolResult, accepted: false },
        });
      }
      return resultFor(request);
    });
    const result = await runModelBakeoff({ ...input, transport });

    expect(result.status).toBe('COMPLETED');
    expect(result.counts.sent).toBe(30);
    expect(result.counts.accepted).toBe(28);
    expect(result.retryUsed).toEqual({ deepseek: true, gemini: true });
    const retries = transport.requests.filter(({ attemptOrdinal }) => attemptOrdinal === 2);
    expect(retries).toHaveLength(2);
    for (const retry of retries) {
      const original = transport.requests.find((request) =>
        request.case.caseId === retry.case.caseId && request.attemptOrdinal === 1
      );
      expect(original).toBeDefined();
      expect(retry.case).toEqual(original!.case);
      expect(retry.sentOrdinal).toBe(original!.sentOrdinal + 1);
    }
    expect(transport.requests.every((request, index) => request.sentOrdinal === index + 1)).toBe(true);
    expect(transport.disposed).toBe(1);
  });

  it('does not borrow the unused Gemini retry after the DeepSeek slot is spent', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport((request) => {
      if (request.case.plannedOrdinal === 1 && request.attemptOrdinal === 1) {
        return resultFor(request, {
          kind: 'transport_failure', preSideEffect: true, sideEffectAccepted: false,
          detailCode: 'FIRST_DEEPSEEK_FAILURE',
          toolResult: { ...resultFor(request).toolResult, accepted: false },
        });
      }
      if (request.case.plannedOrdinal === 2) {
        return resultFor(request, {
          kind: 'transport_failure', preSideEffect: true, sideEffectAccepted: false,
          detailCode: 'SECOND_DEEPSEEK_FAILURE',
          toolResult: { ...resultFor(request).toolResult, accepted: false },
        });
      }
      return resultFor(request);
    });
    const result = await runModelBakeoff({ ...input, transport });

    expect(result.retryUsed).toEqual({ deepseek: true, gemini: false });
    expect(transport.requests.filter(({ case: entry }) => entry.plannedOrdinal === 1)).toHaveLength(2);
    expect(transport.requests.filter(({ case: entry }) => entry.plannedOrdinal === 2)).toHaveLength(1);
    expect(result.counts.sent).toBe(29);
    expect(transport.disposed).toBe(1);
  });

  it.each([
    ['refusal', { kind: 'refusal', preSideEffect: true, sideEffectAccepted: false }],
    ['schema failure', { kind: 'schema_failure', preSideEffect: true, sideEffectAccepted: false }],
    ['content failure', { kind: 'content_failure', preSideEffect: true, sideEffectAccepted: false }],
    ['grounding failure', { kind: 'grounding_failure', preSideEffect: true, sideEffectAccepted: false }],
    ['late result', { kind: 'late', preSideEffect: true, sideEffectAccepted: false }],
    ['accepted side effect', { kind: 'transport_failure', preSideEffect: false, sideEffectAccepted: true }],
  ] as const)('never retries a %s', async (_label, failure) => {
    const input = runnerInput();
    const transport = new ScriptedTransport((request) => request.case.plannedOrdinal === 2
      ? resultFor(request, {
        ...failure,
        detailCode: 'NON_RETRYABLE',
        toolResult: { ...resultFor(request).toolResult, accepted: false },
      })
      : resultFor(request));
    const result = await runModelBakeoff({ ...input, transport });

    expect(transport.requests.filter(({ case: entry }) => entry.plannedOrdinal === 2)).toHaveLength(1);
    expect(result.counts.sent).toBe(28);
    expect(result.retryUsed).toEqual({ deepseek: false, gemini: false });
    expect(transport.disposed).toBe(1);
  });

  it('skips only the failed intent dependency while independent cases still archive', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport((request) => request.case.plannedOrdinal === 1
      ? resultFor(request, {
        kind: 'refusal',
        detailCode: 'INTENT_REFUSED',
        preSideEffect: false,
        sideEffectAccepted: false,
        toolResult: { ...resultFor(request).toolResult, accepted: false },
      })
      : resultFor(request));
    const result = await runModelBakeoff({ ...input, transport });

    expect(transport.requests.some(({ case: entry }) => entry.plannedOrdinal === 2)).toBe(true);
    expect(transport.requests.some(({ case: entry }) => entry.plannedOrdinal === 3)).toBe(true);
    expect(transport.requests.some(({ case: entry }) => entry.plannedOrdinal === 4)).toBe(false);
    expect(result.cases.find(({ plannedOrdinal }) => plannedOrdinal === 4)).toMatchObject({
      status: 'SKIPPED',
      code: 'CONDUCTOR_INTENT_DEPENDENCY_FAILED',
    });
    expect(result.counts.sent).toBe(27);
    expect(result.counts.skipped).toBe(1);
    expect(transport.disposed).toBe(1);
  });

  it('stops all unsent cases on a global cost breach while preserving the accepted attempt', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport((request) => resultFor(request, {
      usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110, estimatedCostUsd: 1 },
    }));
    const result = await runModelBakeoff({ ...input, transport });

    expect(result.status).toBe('PARTIAL');
    expect(result.stopCode).toBe('COST_CAP_EXCEEDED');
    expect(result.counts.sent).toBe(1);
    expect(result.attempts).toHaveLength(1);
    expect(result.cases.filter(({ status }) => status === 'SKIPPED')).toHaveLength(27);
    expect(transport.disposed).toBe(1);
  });

  it('stops on transport evidence integrity drift instead of repairing it', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport((request) => resultFor(request, {
      providerFacts: {
        ...resultFor(request).providerFacts,
        adapterPackage: '@example/wrong-adapter',
      },
    }));
    const result = await runModelBakeoff({ ...input, transport });

    expect(result.status).toBe('PARTIAL');
    expect(result.stopCode).toBe('TRANSPORT_EVIDENCE_INTEGRITY_FAILURE');
    expect(result.counts.sent).toBe(1);
    expect(result.attempts).toHaveLength(1);
    expect(transport.disposed).toBe(1);
  });

  it('refuses approval/preflight integrity before dispatch and still disposes', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport();
    const result = await runModelBakeoff({
      ...input,
      preflight: { ...input.preflight, status: 'NOT_ELIGIBLE' },
      transport,
    });

    expect(result.status).toBe('REFUSED');
    expect(result.stopCode).toBe('AUTHORIZATION_INTEGRITY_FAILURE');
    expect(result.counts.sent).toBe(0);
    expect(result.attempts).toHaveLength(0);
    expect(result.cases).toHaveLength(28);
    expect(transport.requests).toHaveLength(0);
    expect(transport.disposed).toBe(1);
  });

  it('refuses any approval hash drift before dispatch', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport();
    const result = await runModelBakeoff({
      ...input,
      approval: { ...input.approval, tokenCapsSha256: 'f'.repeat(64) },
      transport,
    });

    expect(result.status).toBe('REFUSED');
    expect(result.counts.sent).toBe(0);
    expect(transport.requests).toHaveLength(0);
    expect(transport.disposed).toBe(1);
  });

  it('converts malformed non-canonical transport evidence into a durable integrity failure', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport((request) => resultFor(request, {
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        totalTokens: 110,
        estimatedCostUsd: Number.NaN,
      },
    }));
    const result = await runModelBakeoff({ ...input, transport });

    expect(result.status).toBe('PARTIAL');
    expect(result.stopCode).toBe('TRANSPORT_EVIDENCE_INTEGRITY_FAILURE');
    expect(result.counts.sent).toBe(1);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      finish: {
        kind: 'provider_error',
        detailCode: 'TRANSPORT_EVIDENCE_INTEGRITY_FAILURE',
      },
      error: { kind: 'integrity' },
    });
    expect(transport.disposed).toBe(1);
  });

  it('preserves one failed sent attempt and disposes when dispatch rejects without evidence', async () => {
    const input = runnerInput();
    const transport = new ScriptedTransport(async () => {
      throw new Error('scripted transport exception');
    });
    const result = await runModelBakeoff({ ...input, transport });

    expect(result.status).toBe('PARTIAL');
    expect(result.stopCode).toBe('TRANSPORT_REJECTED_WITHOUT_EVIDENCE');
    expect(result.counts.sent).toBe(1);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      finish: { kind: 'provider_error', detailCode: 'TRANSPORT_REJECTED_WITHOUT_EVIDENCE' },
      retryEligible: false,
    });
    expect(transport.disposed).toBe(1);
  });
});
