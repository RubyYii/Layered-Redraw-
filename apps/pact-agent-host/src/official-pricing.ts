import type { CompatibilityTokenRates } from './pricing-budget.js';

export const OFFICIAL_PRICING_SNAPSHOT_DATE = '2026-08-22';
export const OFFICIAL_PRICING_SOURCES = Object.freeze({
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing/',
  gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
});

interface OfficialRate extends Readonly<Record<string, unknown>> {
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
}

/** Cache-miss rates are deliberately used for the conservative gate. */
const DEEPSEEK_RATES: Readonly<Record<string, OfficialRate>> = Object.freeze({
  'deepseek-v4-flash': Object.freeze({
    inputUsdPerMillionTokens: 0.14,
    outputUsdPerMillionTokens: 0.28,
  }),
  'deepseek-v4-pro': Object.freeze({
    inputUsdPerMillionTokens: 0.435,
    outputUsdPerMillionTokens: 0.87,
  }),
});

/** Standard paid interactive rate; output includes thinking tokens. */
const GEMINI_RATES: Readonly<Record<string, OfficialRate>> = Object.freeze({
  'gemini-3.5-flash': Object.freeze({
    inputUsdPerMillionTokens: 1.50,
    outputUsdPerMillionTokens: 9.00,
  }),
});

export type OfficialPricingResolution =
  | {
      readonly status: 'RESOLVED';
      readonly snapshotDate: typeof OFFICIAL_PRICING_SNAPSHOT_DATE;
      readonly rates: CompatibilityTokenRates;
      readonly sources: typeof OFFICIAL_PRICING_SOURCES;
      readonly assumptions: readonly string[];
    }
  | {
      readonly status: 'UNRESOLVED';
      readonly snapshotDate: typeof OFFICIAL_PRICING_SNAPSHOT_DATE;
      readonly unresolvedModels: readonly string[];
      readonly sources: typeof OFFICIAL_PRICING_SOURCES;
    };

export const resolveOfficialPricing = (
  deepseekModel: string,
  geminiModel: string,
): OfficialPricingResolution => {
  const deepseek = DEEPSEEK_RATES[deepseekModel];
  const gemini = GEMINI_RATES[geminiModel];
  const unresolvedModels: string[] = [];
  if (deepseek === undefined) unresolvedModels.push(deepseekModel);
  if (gemini === undefined) unresolvedModels.push(geminiModel);
  if (deepseek === undefined || gemini === undefined) {
    return {
      status: 'UNRESOLVED',
      snapshotDate: OFFICIAL_PRICING_SNAPSHOT_DATE,
      unresolvedModels,
      sources: OFFICIAL_PRICING_SOURCES,
    };
  }
  return {
    status: 'RESOLVED',
    snapshotDate: OFFICIAL_PRICING_SNAPSHOT_DATE,
    rates: { deepseek, gemini },
    sources: OFFICIAL_PRICING_SOURCES,
    assumptions: Object.freeze([
      'DeepSeek input uses the official cache-miss rate.',
      'Gemini uses the standard paid interactive rate.',
      'Gemini output pricing includes thinking tokens.',
      'No grounding, search, maps, file search, or other paid provider tools are enabled.',
    ]),
  };
};
