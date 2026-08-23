import { createHash } from 'node:crypto';

import type { Context } from '@deepseek-ai/cordis';

import type {
  ModelBakeoffTechnicalArchive,
} from '../src/model-bakeoff-evidence.js';
import type { ModelBakeoffDshDiagnostic } from '../src/model-bakeoff-dsh-transport.js';
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

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

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

const providerFacts = (provider: 'deepseek' | 'gemini') => provider === 'deepseek'
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
  };

const deterministicSessionId = (request: ModelBakeoffDispatchRequest): string => {
  const continuityOrdinal = request.case.provider === 'deepseek'
    ? request.case.model === 'deepseek-v4-pro'
      ? request.case.repetition
      : request.case.repetition + 2
    : request.sentOrdinal + 10;
  return `550e8400-e29b-41d4-a716-${String(continuityOrdinal).padStart(12, '0')}`;
};

const reviewText = (request: ModelBakeoffDispatchRequest): string =>
  `Bounded ${request.case.role} response, repetition ${request.case.repetition}: ambiguity remains visible.`;

class PassingArchiveTransport implements ModelBakeoffTransport {
  readonly diagnostics: ModelBakeoffDshDiagnostic[] = [];
  readonly failedProviders = new Set<'deepseek' | 'gemini'>();

  constructor(
    private readonly retryProviders: ReadonlySet<'deepseek' | 'gemini'> = new Set(),
  ) {}

  async dispatch(request: ModelBakeoffDispatchRequest): Promise<ModelBakeoffTransportResult> {
    const text = reviewText(request);
    const payloadSha256 = sha(`payload:${request.case.caseId}`);
    const imageRole = request.case.role === 'Witness' || request.case.role === 'Rewriter';
    const expectedTool = request.case.phase === 'ConductorCommit'
      ? {
        name: 'pact_submit_conductor_commit' as const,
        contract: 'conductor-draft-commit/0.1' as const,
      }
      : {
        name: 'pact_submit_council_shard' as const,
        contract: 'council-shard/0.1' as const,
      };
    const sessionId = deterministicSessionId(request);
    const fromSequence = request.case.phase === 'ConductorCommit' ? 20 : 10;
    const sessionEventRange = {
      sessionId,
      fromSequence,
      toSequence: fromSequence + 8,
    };
    if (
      request.attemptOrdinal === 1
      && this.retryProviders.has(request.case.provider)
      && !this.failedProviders.has(request.case.provider)
    ) {
      this.failedProviders.add(request.case.provider);
      const failureSha256 = sha(`pre-side-effect:${request.case.caseId}`);
      this.diagnostics.push({
        attemptId: request.attemptId,
        sentOrdinal: request.sentOrdinal,
        caseId: request.case.caseId,
        provider: request.case.provider,
        route: request.case.route,
        model: request.case.model,
        phase: request.case.phase,
        role: request.case.role,
        continuityKey: request.case.continuityKey,
        sessionId,
        streamCount: 0,
        undeclaredStreamCount: 0,
        toolCallCount: 0,
        acceptedDomainEventCount: 0,
        availableTools: [expectedTool.name],
        imageBlockCount: imageRole ? 1 : 0,
        redactedOutputText: null,
        turnEndReason: null,
        sessionEventRange,
      });
      return {
        kind: 'transport_failure',
        detailCode: 'SYNTHETIC_PRE_SIDE_EFFECT_FAILURE',
        preSideEffect: true,
        sideEffectAccepted: false,
        providerRequestMade: false,
        firstChunkDelayMs: null,
        firstPublicTraceDelayMs: null,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        },
        providerFacts: providerFacts(request.case.provider),
        toolResult: {
          ...expectedTool,
          accepted: false,
          payloadSha256: failureSha256,
        },
        groundedInputRefs: imageRole
          ? ['synthetic-spatial-image-01', 'synthetic-scene-01']
          : ['synthetic-scene-01'],
        redactedOutputSha256: failureSha256,
        sessionEventRange,
      };
    }
    this.diagnostics.push({
      attemptId: request.attemptId,
      sentOrdinal: request.sentOrdinal,
      caseId: request.case.caseId,
      provider: request.case.provider,
      route: request.case.route,
      model: request.case.model,
      phase: request.case.phase,
      role: request.case.role,
      continuityKey: request.case.continuityKey,
      sessionId,
      streamCount: 1,
      undeclaredStreamCount: 0,
      toolCallCount: 1,
      acceptedDomainEventCount: 1,
      availableTools: [expectedTool.name],
      imageBlockCount: imageRole ? 1 : 0,
      redactedOutputText: text,
      turnEndReason: 'aborted',
      sessionEventRange,
    });
    return {
      kind: 'accepted',
      detailCode: null,
      preSideEffect: false,
      sideEffectAccepted: true,
      providerRequestMade: true,
      firstChunkDelayMs: 10,
      firstPublicTraceDelayMs: imageRole ? 20 : null,
      usage: {
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
        estimatedCostUsd: 0.0001,
      },
      providerFacts: providerFacts(request.case.provider),
      toolResult: {
        ...expectedTool,
        accepted: true,
        payloadSha256,
      },
      groundedInputRefs: imageRole
        ? ['synthetic-spatial-image-01', 'synthetic-scene-01']
        : ['synthetic-scene-01'],
      redactedOutputSha256: sha(text),
      sessionEventRange,
    };
  }

  async dispose(): Promise<void> {}
}

export async function createPassingModelBakeoffArchive(options: {
  readonly retryProviders?: readonly ('deepseek' | 'gemini')[];
} = {}): Promise<
  ModelBakeoffTechnicalArchive
> {
  const fixtures = createModelBakeoffFixtures();
  const plan = createModelBakeoffPlan(fixtures.manifest);
  const pricing = createModelBakeoffPricingManifest({
    retrievedAt: '2000-01-01T00:00:00.000Z',
    sources: [
      {
        provider: 'deepseek',
        url: 'https://api-docs.deepseek.com/quick_start/pricing',
        pageSha256: 'a'.repeat(64),
      },
      {
        provider: 'gemini',
        url: 'https://ai.google.dev/gemini-api/docs/pricing',
        pageSha256: 'b'.repeat(64),
      },
    ],
    rates: Object.fromEntries(candidates().map(({ model }) => [model, {
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
  const keychainReferences = createModelBakeoffKeychainReferenceManifest([
    {
      provider: 'deepseek',
      envRef: 'DEEPSEEK_API_KEY',
      keychainService: 'pact-test-deepseek',
      keychainAccount: 'test-account',
    },
    {
      provider: 'gemini',
      envRef: 'GEMINI_API_KEY',
      keychainService: 'pact-test-gemini',
      keychainAccount: 'test-account',
    },
  ]);
  const preflight = createModelBakeoffPreflight({
    runId: RUN_ID,
    plan,
    fixtures: fixtures.manifest,
    pricing,
    roleCaps,
    keychainReferences,
    credentialPresence: keychainReferences.references.map((reference) => ({
      ...reference,
      present: true,
    })),
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
    candidates: candidates().map(({ provider, route, model }) => ({
      provider,
      route,
      model,
    })),
    repetitions: 2,
    counts: {
      intended: 28,
      eligible: 28,
      excluded: 0,
      sent: 0,
      plannedDispatches: 28,
      maximumDispatches: 30,
    },
    inputClasses: [
      'fictional_text',
      'synthetic_spatial_image',
      'synthetic_scene_registry',
    ],
    tokenCapsSha256: roleCaps.manifestSha256,
    keychainReferencesSha256: keychainReferences.manifestSha256,
    retrySlots: { deepseek: 1, gemini: 1 },
    worstCaseEstimatedUsd: preflight.worstCaseEstimatedUsd!,
    maxUsd: 0.05,
    oneRunOnly: true,
    automaticRerun: false,
    externalCapabilities: [],
  };
  let clock = NOW;
  const transport = new PassingArchiveTransport(new Set(options.retryProviders ?? []));
  const result = await runModelBakeoff({
    approval,
    preflight,
    plan,
    transport,
    now: () => {
      const current = clock;
      clock += 100;
      return current;
    },
  });
  return {
    schemaVersion: 'cp03-model-bakeoff-technical-archive/0.1',
    approval,
    preflight,
    plan,
    fixtures: fixtures.manifest,
    pricing,
    roleCaps,
    keychainReferences,
    result,
    diagnostics: transport.diagnostics,
  };
}

export const cloneArchive = (
  archive: ModelBakeoffTechnicalArchive,
): ModelBakeoffTechnicalArchive => structuredClone(archive);
