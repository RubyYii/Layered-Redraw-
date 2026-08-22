export type CompatibilityProvider = 'deepseek' | 'gemini';

export const COMPATIBILITY_LIMITS = Object.freeze({
  deadlineMs: 12_000,
  targetDraftMs: 8_000,
  firstPublicTraceMs: 2_500,
  inputTokensPerDispatch: 32_768,
  maxOutputTokensPerDispatch: 2_048,
  reasoningEffort: Object.freeze({
    deepseek: 'off' as const,
    gemini: 'provider-default' as const,
  }),
  maxImageBytes: 2 * 1024 * 1024,
});

export const COMPATIBILITY_CREDENTIAL_REFS = Object.freeze({
  deepseek: 'DEEPSEEK_API_KEY',
  gemini: 'GEMINI_API_KEY',
} as const);

export interface ProviderSelection {
  readonly route: string;
  readonly model: string | undefined;
  readonly credentialRef: string;
  readonly credentialPresent: boolean;
}

export interface CompatibilityConfigInspection {
  readonly status: 'CONFIGURED' | 'NOT_CONFIGURED';
  readonly deepseek: ProviderSelection;
  readonly gemini: ProviderSelection;
  readonly maxUsd: number | undefined;
  readonly missing: readonly string[];
  readonly limits: typeof COMPATIBILITY_LIMITS;
}

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const positiveMoney = (value: string | undefined): number | undefined => {
  const normalized = nonEmpty(value);
  if (normalized === undefined) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Resolve selector and credential-presence facts without retaining, returning,
 * serializing, or logging either credential value.
 */
export const inspectCompatibilityConfig = (
  env: Readonly<NodeJS.ProcessEnv>,
): CompatibilityConfigInspection => {
  const deepseekModel = nonEmpty(env.PACT_DEEPSEEK_MODEL);
  const geminiRoute = nonEmpty(env.PACT_GEMINI_ROUTE);
  const geminiModel = nonEmpty(env.PACT_GEMINI_MODEL);
  const maxUsd = positiveMoney(env.PACT_COMPAT_MAX_USD);
  const deepseekCredentialPresent =
    nonEmpty(env[COMPATIBILITY_CREDENTIAL_REFS.deepseek]) !== undefined;
  const geminiCredentialPresent =
    nonEmpty(env[COMPATIBILITY_CREDENTIAL_REFS.gemini]) !== undefined;

  const missing: string[] = [];
  if (deepseekModel === undefined) missing.push('PACT_DEEPSEEK_MODEL');
  if (geminiRoute === undefined) missing.push('PACT_GEMINI_ROUTE');
  if (geminiModel === undefined) missing.push('PACT_GEMINI_MODEL');
  if (maxUsd === undefined) missing.push('PACT_COMPAT_MAX_USD');
  if (!deepseekCredentialPresent) {
    missing.push(COMPATIBILITY_CREDENTIAL_REFS.deepseek);
  }
  if (!geminiCredentialPresent) {
    missing.push(COMPATIBILITY_CREDENTIAL_REFS.gemini);
  }

  return Object.freeze({
    status: missing.length === 0 ? 'CONFIGURED' : 'NOT_CONFIGURED',
    deepseek: Object.freeze({
      route: 'deepseek-official',
      model: deepseekModel,
      credentialRef: COMPATIBILITY_CREDENTIAL_REFS.deepseek,
      credentialPresent: deepseekCredentialPresent,
    }),
    gemini: Object.freeze({
      route: geminiRoute ?? '',
      model: geminiModel,
      credentialRef: COMPATIBILITY_CREDENTIAL_REFS.gemini,
      credentialPresent: geminiCredentialPresent,
    }),
    maxUsd,
    missing: Object.freeze(missing),
    limits: COMPATIBILITY_LIMITS,
  });
};

export interface ConfiguredCompatibility {
  readonly deepseek: ProviderSelection & { readonly model: string };
  readonly gemini: ProviderSelection & { readonly model: string };
  readonly maxUsd: number;
  readonly limits: typeof COMPATIBILITY_LIMITS;
}

export const requireConfiguredCompatibility = (
  inspection: CompatibilityConfigInspection,
): ConfiguredCompatibility => {
  if (
    inspection.status !== 'CONFIGURED' ||
    inspection.deepseek.model === undefined ||
    inspection.gemini.model === undefined ||
    inspection.gemini.route.length === 0 ||
    inspection.maxUsd === undefined
  ) {
    throw new Error(
      `COMPATIBILITY_CONFIGURATION_INCOMPLETE: ${inspection.missing.join(', ')}`,
    );
  }
  return {
    deepseek: { ...inspection.deepseek, model: inspection.deepseek.model },
    gemini: { ...inspection.gemini, model: inspection.gemini.model },
    maxUsd: inspection.maxUsd,
    limits: inspection.limits,
  };
};
