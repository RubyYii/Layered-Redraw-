import { COMPATIBILITY_LIMITS } from './compatibility-config.js';

export interface ProviderTokenRates {
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
}

export interface CompatibilityTokenRates {
  readonly deepseek: ProviderTokenRates;
  readonly gemini: ProviderTokenRates;
}

export interface WorstCaseCostEstimate {
  readonly dispatches: { readonly deepseek: 9; readonly gemini: 5 };
  readonly inputTokensPerDispatch: number;
  readonly maxOutputTokensPerDispatch: number;
  readonly worstCaseUsd: number;
  readonly userCapUsd: number;
  readonly withinUserCap: boolean;
}

const validRate = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

export const estimateWorstCaseCost = (
  rates: CompatibilityTokenRates,
  userCapUsd: number,
): WorstCaseCostEstimate => {
  if (
    !validRate(rates.deepseek.inputUsdPerMillionTokens) ||
    !validRate(rates.deepseek.outputUsdPerMillionTokens) ||
    !validRate(rates.gemini.inputUsdPerMillionTokens) ||
    !validRate(rates.gemini.outputUsdPerMillionTokens) ||
    !Number.isFinite(userCapUsd) || userCapUsd <= 0
  ) {
    throw new TypeError('COMPATIBILITY_PRICING_INVALID');
  }
  const dispatches = { deepseek: 9 as const, gemini: 5 as const };
  const providerCost = (
    count: number,
    rate: ProviderTokenRates,
  ): number => count * (
    COMPATIBILITY_LIMITS.inputTokensPerDispatch *
      rate.inputUsdPerMillionTokens / 1_000_000 +
    COMPATIBILITY_LIMITS.maxOutputTokensPerDispatch *
      rate.outputUsdPerMillionTokens / 1_000_000
  );
  const worstCaseUsd =
    providerCost(dispatches.deepseek, rates.deepseek) +
    providerCost(dispatches.gemini, rates.gemini);
  return {
    dispatches,
    inputTokensPerDispatch: COMPATIBILITY_LIMITS.inputTokensPerDispatch,
    maxOutputTokensPerDispatch:
      COMPATIBILITY_LIMITS.maxOutputTokensPerDispatch,
    worstCaseUsd,
    userCapUsd,
    withinUserCap: worstCaseUsd <= userCapUsd,
  };
};
