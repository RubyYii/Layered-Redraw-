import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import {
  BAKEOFF_DEEPSEEK_MODELS,
  BAKEOFF_GEMINI_MODELS,
  BAKEOFF_MAXIMUM_DISPATCHES,
  BAKEOFF_PLANNED_DISPATCHES,
  type ModelBakeoffCase,
  type ModelBakeoffPhase,
  type ModelBakeoffProvider,
} from './model-bakeoff-plan.js';

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PRICING_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_INPUT_TOKENS = 32_768;
const MAX_OUTPUT_TOKENS = 2_048;

export const MODEL_BAKEOFF_PRICING_URLS = {
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
  gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
} as const;

const expectedModels = [
  ...BAKEOFF_DEEPSEEK_MODELS,
  ...BAKEOFF_GEMINI_MODELS,
] as const;

const expectedPhases: readonly ModelBakeoffPhase[] = [
  'ConductorIntent',
  'Archivist',
  'Guardian',
  'ConductorCommit',
  'Witness',
  'Rewriter',
];

export interface ModelBakeoffPricingRate {
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
  readonly assumption: string;
}

export interface ModelBakeoffPricingManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-pricing/0.1';
  readonly retrievedAt: string;
  readonly sources: readonly {
    readonly provider: ModelBakeoffProvider;
    readonly url: string;
    readonly pageSha256: string;
  }[];
  readonly rates: Readonly<Record<string, ModelBakeoffPricingRate>>;
  readonly manifestSha256: string;
}

export interface ModelBakeoffRoleTokenCap {
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
}

export interface ModelBakeoffRoleCapsManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-role-caps/0.1';
  readonly caps: Readonly<Record<ModelBakeoffPhase, ModelBakeoffRoleTokenCap>>;
  readonly manifestSha256: string;
}

export interface ModelBakeoffPricingAudit {
  readonly status: 'PASS' | 'FAIL';
  readonly findings: readonly string[];
}

export interface ModelBakeoffCostEstimate {
  readonly plannedDispatches: 28;
  readonly maximumDispatches: 30;
  readonly plannedEstimatedUsd: number;
  readonly retryReserveEstimatedUsd: Readonly<Record<ModelBakeoffProvider, number>>;
  readonly worstCaseEstimatedUsd: number;
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      deepFreeze(entry);
    }
    Object.freeze(value);
  }
  return value;
};

const canonicalHash = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

const sameSet = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length
  && [...actual].sort().every((entry, index) => entry === [...expected].sort()[index]);

const roundUsd = (value: number): number => Number(value.toFixed(12));

export function createModelBakeoffPricingManifest(
  input: Omit<ModelBakeoffPricingManifest, 'schemaVersion' | 'manifestSha256'>,
): ModelBakeoffPricingManifest {
  const unsigned = {
    schemaVersion: 'cp03-model-bakeoff-pricing/0.1' as const,
    retrievedAt: input.retrievedAt,
    sources: input.sources.map((source) => ({ ...source })),
    rates: Object.fromEntries(
      Object.entries(input.rates).map(([model, rate]) => [model, { ...rate }]),
    ),
  };
  return deepFreeze({ ...unsigned, manifestSha256: canonicalHash(unsigned) });
}

export function verifyModelBakeoffPricingManifest(
  manifest: ModelBakeoffPricingManifest,
  now = Date.now(),
): ModelBakeoffPricingAudit {
  const findings: string[] = [];
  if (manifest.schemaVersion !== 'cp03-model-bakeoff-pricing/0.1') {
    findings.push('PRICING_SCHEMA_VERSION_INVALID');
  }

  const retrievedAt = Date.parse(manifest.retrievedAt);
  if (!Number.isFinite(retrievedAt)) {
    findings.push('PRICING_RETRIEVED_AT_INVALID');
  } else {
    const age = now - retrievedAt;
    if (age < 0) findings.push('PRICING_FROM_FUTURE');
    if (age > MAX_PRICING_AGE_MS) findings.push('PRICING_STALE');
  }

  const sourceProviders = manifest.sources.map(({ provider }) => provider);
  if (!sameSet(sourceProviders, ['deepseek', 'gemini'])) {
    findings.push('PRICING_SOURCE_SET_INVALID');
  }
  for (const source of manifest.sources) {
    if (source.url !== MODEL_BAKEOFF_PRICING_URLS[source.provider]) {
      findings.push('PRICING_SOURCE_URL_INVALID');
    }
    if (!SHA256.test(source.pageSha256)) findings.push('PRICING_PAGE_SHA256_INVALID');
  }

  if (!sameSet(Object.keys(manifest.rates), expectedModels)) {
    findings.push('PRICING_MODEL_SET_INVALID');
  }
  for (const model of expectedModels) {
    const rate = manifest.rates[model];
    if (
      rate === undefined
      || !Number.isFinite(rate.inputUsdPerMillionTokens)
      || rate.inputUsdPerMillionTokens < 0
      || !Number.isFinite(rate.outputUsdPerMillionTokens)
      || rate.outputUsdPerMillionTokens < 0
      || typeof rate.assumption !== 'string'
      || rate.assumption.trim().length === 0
    ) {
      findings.push('PRICING_RATE_INVALID');
    }
  }

  const { manifestSha256, ...unsigned } = manifest;
  if (!SHA256.test(manifestSha256) || canonicalHash(unsigned) !== manifestSha256) {
    findings.push('PRICING_SHA256_MISMATCH');
  }

  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings: [...new Set(findings)],
  };
}

export function createModelBakeoffRoleCapsManifest(
  caps: Readonly<Record<ModelBakeoffPhase, ModelBakeoffRoleTokenCap>>,
): ModelBakeoffRoleCapsManifest {
  const unsigned = {
    schemaVersion: 'cp03-model-bakeoff-role-caps/0.1' as const,
    caps: Object.fromEntries(
      Object.entries(caps).map(([phase, cap]) => [phase, { ...cap }]),
    ) as Record<ModelBakeoffPhase, ModelBakeoffRoleTokenCap>,
  };
  return deepFreeze({ ...unsigned, manifestSha256: canonicalHash(unsigned) });
}

export function verifyModelBakeoffRoleCapsManifest(
  manifest: ModelBakeoffRoleCapsManifest,
): ModelBakeoffPricingAudit {
  const findings: string[] = [];
  if (manifest.schemaVersion !== 'cp03-model-bakeoff-role-caps/0.1') {
    findings.push('ROLE_CAP_SCHEMA_VERSION_INVALID');
  }
  if (!sameSet(Object.keys(manifest.caps), expectedPhases)) {
    findings.push('ROLE_CAP_PHASE_SET_INVALID');
  }
  for (const phase of expectedPhases) {
    const cap = manifest.caps[phase];
    if (
      cap === undefined
      || !Number.isInteger(cap.maxInputTokens)
      || cap.maxInputTokens < 1
      || cap.maxInputTokens > MAX_INPUT_TOKENS
      || !Number.isInteger(cap.maxOutputTokens)
      || cap.maxOutputTokens < 1
      || cap.maxOutputTokens > MAX_OUTPUT_TOKENS
    ) {
      findings.push(`ROLE_CAP_INVALID:${phase}`);
    }
  }
  const { manifestSha256, ...unsigned } = manifest;
  if (!SHA256.test(manifestSha256) || canonicalHash(unsigned) !== manifestSha256) {
    findings.push('ROLE_CAP_SHA256_MISMATCH');
  }
  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings: [...new Set(findings)],
  };
}

const estimatedCaseUsd = (
  entry: ModelBakeoffCase,
  pricing: ModelBakeoffPricingManifest,
  roleCaps: ModelBakeoffRoleCapsManifest,
): number => {
  const rate = pricing.rates[entry.model];
  const cap = roleCaps.caps[entry.phase];
  if (rate === undefined || cap === undefined) {
    throw new Error(`MODEL_BAKEOFF_PRICE_OR_CAP_MISSING:${entry.caseId}`);
  }
  return (
    cap.maxInputTokens * rate.inputUsdPerMillionTokens
    + cap.maxOutputTokens * rate.outputUsdPerMillionTokens
  ) / 1_000_000;
};

export function estimateModelBakeoffWorstCaseUsd(input: {
  readonly plan: readonly ModelBakeoffCase[];
  readonly pricing: ModelBakeoffPricingManifest;
  readonly roleCaps: ModelBakeoffRoleCapsManifest;
}): ModelBakeoffCostEstimate {
  if (input.plan.length !== BAKEOFF_PLANNED_DISPATCHES) {
    throw new Error('MODEL_BAKEOFF_PLAN_INCOMPLETE');
  }
  if (verifyModelBakeoffRoleCapsManifest(input.roleCaps).status !== 'PASS') {
    throw new Error('MODEL_BAKEOFF_ROLE_CAPS_INVALID');
  }
  const structuralPricingAudit = verifyModelBakeoffPricingManifest(
    input.pricing,
    Date.parse(input.pricing.retrievedAt),
  );
  if (structuralPricingAudit.status !== 'PASS') {
    throw new Error('MODEL_BAKEOFF_PRICING_INVALID');
  }

  const caseCosts = input.plan.map((entry) => ({
    provider: entry.provider,
    cost: estimatedCaseUsd(entry, input.pricing, input.roleCaps),
  }));
  const plannedEstimatedUsd = caseCosts.reduce((total, entry) => total + entry.cost, 0);
  const retryReserveEstimatedUsd = Object.fromEntries(
    (['deepseek', 'gemini'] as const).map((provider) => [
      provider,
      Math.max(...caseCosts.filter((entry) => entry.provider === provider)
        .map((entry) => entry.cost)),
    ]),
  ) as Record<ModelBakeoffProvider, number>;

  return deepFreeze({
    plannedDispatches: BAKEOFF_PLANNED_DISPATCHES,
    maximumDispatches: BAKEOFF_MAXIMUM_DISPATCHES,
    plannedEstimatedUsd: roundUsd(plannedEstimatedUsd),
    retryReserveEstimatedUsd: {
      deepseek: roundUsd(retryReserveEstimatedUsd.deepseek),
      gemini: roundUsd(retryReserveEstimatedUsd.gemini),
    },
    worstCaseEstimatedUsd: roundUsd(
      plannedEstimatedUsd
      + retryReserveEstimatedUsd.deepseek
      + retryReserveEstimatedUsd.gemini,
    ),
  });
}
