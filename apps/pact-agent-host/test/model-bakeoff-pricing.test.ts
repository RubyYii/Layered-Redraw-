import { describe, expect, it } from 'vitest';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import { createModelBakeoffPlan } from '../src/model-bakeoff-plan.js';
import {
  createModelBakeoffPricingManifest,
  createModelBakeoffRoleCapsManifest,
  estimateModelBakeoffWorstCaseUsd,
  verifyModelBakeoffPricingManifest,
  verifyModelBakeoffRoleCapsManifest,
  type ModelBakeoffPricingManifest,
} from '../src/model-bakeoff-pricing.js';

const TEST_RETRIEVED_AT = '2000-01-01T00:00:00.000Z';
const TEST_NOW = Date.parse('2000-01-01T12:00:00.000Z');

const syntheticPricing = (): ModelBakeoffPricingManifest =>
  createModelBakeoffPricingManifest({
    retrievedAt: TEST_RETRIEVED_AT,
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
    rates: {
      'deepseek-v4-pro': {
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 4,
        assumption: 'synthetic test-only rate; not current official pricing',
      },
      'deepseek-v4-flash': {
        inputUsdPerMillionTokens: 0.5,
        outputUsdPerMillionTokens: 2,
        assumption: 'synthetic test-only rate; not current official pricing',
      },
      'gemini-3.5-flash': {
        inputUsdPerMillionTokens: 0.2,
        outputUsdPerMillionTokens: 0.8,
        assumption: 'synthetic test-only rate; not current official pricing',
      },
      'gemini-3.6-flash': {
        inputUsdPerMillionTokens: 0.3,
        outputUsdPerMillionTokens: 1,
        assumption: 'synthetic test-only rate; not current official pricing',
      },
      'gemini-3.7-flash': {
        inputUsdPerMillionTokens: 0.4,
        outputUsdPerMillionTokens: 1.2,
        assumption: 'synthetic test-only rate; not current official pricing',
      },
    },
  });

const uniformRoleCaps = () => createModelBakeoffRoleCapsManifest({
  ConductorIntent: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Archivist: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Guardian: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  ConductorCommit: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Witness: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Rewriter: { maxInputTokens: 1_000, maxOutputTokens: 100 },
});

describe('model bakeoff pricing', () => {
  it('accepts an exact fresh self-hashed five-model manifest only at its test clock', () => {
    const pricing = syntheticPricing();

    expect(verifyModelBakeoffPricingManifest(pricing, TEST_NOW)).toEqual({
      status: 'PASS',
      findings: [],
    });
    expect(pricing.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyModelBakeoffPricingManifest(pricing, Date.now())).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['PRICING_STALE']),
    });
  });

  it.each([
    ['wrong source', (value: ModelBakeoffPricingManifest) => ({
      ...value,
      sources: value.sources.map((source) => source.provider === 'gemini'
        ? { ...source, url: 'https://example.invalid/pricing' }
        : source),
    }), 'PRICING_SOURCE_URL_INVALID'],
    ['missing model', (value: ModelBakeoffPricingManifest) => {
      const { ['gemini-3.7-flash']: _removed, ...rates } = value.rates;
      return { ...value, rates };
    }, 'PRICING_MODEL_SET_INVALID'],
    ['negative rate', (value: ModelBakeoffPricingManifest) => ({
      ...value,
      rates: {
        ...value.rates,
        'deepseek-v4-pro': {
          ...value.rates['deepseek-v4-pro']!,
          outputUsdPerMillionTokens: -1,
        },
      },
    }), 'PRICING_RATE_INVALID'],
    ['tampered hash', (value: ModelBakeoffPricingManifest) => ({
      ...value,
      manifestSha256: 'f'.repeat(64),
    }), 'PRICING_SHA256_MISMATCH'],
  ] as const)('rejects %s', (_label, mutate, finding) => {
    expect(verifyModelBakeoffPricingManifest(
      mutate(syntheticPricing()) as ModelBakeoffPricingManifest,
      TEST_NOW,
    )).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining([finding]),
    });
  });

  it('hashes and bounds one cap per exact phase class', () => {
    const caps = uniformRoleCaps();

    expect(verifyModelBakeoffRoleCapsManifest(caps)).toEqual({
      status: 'PASS',
      findings: [],
    });
    expect(verifyModelBakeoffRoleCapsManifest({
      ...caps,
      caps: {
        ...caps.caps,
        Witness: { maxInputTokens: 32_769, maxOutputTokens: 100 },
      },
    })).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['ROLE_CAP_INVALID:Witness']),
    });
  });

  it('prices all 28 cases plus each provider highest-cost retry without setting a cap', () => {
    const fixtures = createModelBakeoffFixtures();
    const plan = createModelBakeoffPlan(fixtures.manifest);

    expect(estimateModelBakeoffWorstCaseUsd({
      plan,
      pricing: syntheticPricing(),
      roleCaps: uniformRoleCaps(),
    })).toEqual({
      plannedDispatches: 28,
      maximumDispatches: 30,
      plannedEstimatedUsd: 0.0216,
      retryReserveEstimatedUsd: {
        deepseek: 0.0014,
        gemini: 0.00052,
      },
      worstCaseEstimatedUsd: 0.02352,
    });
  });
});
