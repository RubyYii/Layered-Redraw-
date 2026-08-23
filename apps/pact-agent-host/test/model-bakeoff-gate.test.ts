import { describe, expect, it } from 'vitest';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import {
  authorizeModelBakeoff,
  type ModelBakeoffApproval,
} from '../src/model-bakeoff-gate.js';
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

const NOW = Date.parse('2000-01-01T12:05:00.000Z');
const RUN_ID = 'cp03-model-bakeoff-20000101T120000Z';

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

const gateInput = () => {
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
  const keychainReferences = createModelBakeoffKeychainReferenceManifest([
    { provider: 'deepseek', envRef: 'DEEPSEEK_API_KEY', keychainService: 'pact-test-deepseek', keychainAccount: 'test-account' },
    { provider: 'gemini', envRef: 'GEMINI_API_KEY', keychainService: 'pact-test-gemini', keychainAccount: 'test-account' },
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
    keychainReferencesSha256: keychainReferences.manifestSha256,
    retrySlots: { deepseek: 1, gemini: 1 },
    worstCaseEstimatedUsd: preflight.worstCaseEstimatedUsd!,
    maxUsd: 0.05,
    oneRunOnly: true,
    automaticRerun: false,
    externalCapabilities: [],
  };
  return {
    approval,
    preflight,
    plan,
    fixtures: fixtures.manifest,
    pricing,
    roleCaps,
    keychainReferences,
    archiveState: { resultExists: false, pendingResultExists: false },
    now: NOW,
  } as const;
};

describe('model bakeoff exact approval gate', () => {
  it('authorizes only the complete fresh fixed scope without making a request', () => {
    const input = gateInput();
    expect(authorizeModelBakeoff(input)).toEqual({
      status: 'AUTHORIZED',
      approval: input.approval,
    });
  });

  it.each([
    ['low cost cap', 'maxUsd', (base: ModelBakeoffApproval) => ({ ...base, maxUsd: 0 })],
    ['old timestamp', 'approvedAt', (base: ModelBakeoffApproval) => ({ ...base, approvedAt: '2000-01-01T11:49:59.000Z' })],
    ['missing candidate', 'candidates', (base: ModelBakeoffApproval) => ({ ...base, candidates: base.candidates.slice(0, 4) })],
    ['changed candidate order', 'candidates', (base: ModelBakeoffApproval) => ({ ...base, candidates: [base.candidates[1]!, base.candidates[0]!, ...base.candidates.slice(2)] })],
    ['changed token caps', 'tokenCapsSha256', (base: ModelBakeoffApproval) => ({ ...base, tokenCapsSha256: 'f'.repeat(64) })],
    ['changed Keychain refs', 'keychainReferencesSha256', (base: ModelBakeoffApproval) => ({ ...base, keychainReferencesSha256: 'e'.repeat(64) })],
    ['changed counts', 'counts', (base: ModelBakeoffApproval) => ({ ...base, counts: { ...base.counts, maximumDispatches: 31 } })],
    ['changed retries', 'retrySlots', (base: ModelBakeoffApproval) => ({ ...base, retrySlots: { deepseek: 2, gemini: 0 } })],
    ['extra capability', 'externalCapabilities', (base: ModelBakeoffApproval) => ({ ...base, externalCapabilities: ['search'] })],
  ] as const)('refuses %s with zero requests', (_label, mismatch, mutate) => {
    const input = gateInput();
    const result = authorizeModelBakeoff({
      ...input,
      approval: mutate(input.approval) as ModelBakeoffApproval,
    });

    expect(result).toMatchObject({
      status: 'REFUSED',
      providerRequestsMade: 0,
      mismatches: expect.arrayContaining([mismatch]),
    });
  });

  it.each(['resultExists', 'pendingResultExists'] as const)(
    'refuses an occupied %s archive state',
    (field) => {
      const input = gateInput();
      expect(authorizeModelBakeoff({
        ...input,
        archiveState: { ...input.archiveState, [field]: true },
      })).toMatchObject({
        status: 'REFUSED',
        providerRequestsMade: 0,
        mismatches: expect.arrayContaining([`archiveState.${field}`]),
      });
    },
  );

  it('refuses preflight, plan, fixture, token-cap, and Keychain drift', () => {
    const input = gateInput();
    const cases = [
      { ...input, preflight: { ...input.preflight, status: 'NOT_ELIGIBLE' as const } },
      { ...input, plan: [...input.plan].reverse() },
      { ...input, fixtures: { ...input.fixtures, fictionalText: 'drift' } },
      { ...input, roleCaps: { ...input.roleCaps, manifestSha256: 'd'.repeat(64) } },
      { ...input, pricing: { ...input.pricing, retrievedAt: '1999-12-30T00:00:00.000Z' } },
      { ...input, keychainReferences: { ...input.keychainReferences, manifestSha256: 'c'.repeat(64) } },
    ];

    for (const candidate of cases) {
      expect(authorizeModelBakeoff(candidate)).toMatchObject({
        status: 'REFUSED',
        providerRequestsMade: 0,
      });
    }
  });
});
