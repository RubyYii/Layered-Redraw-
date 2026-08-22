import { createRequire } from 'node:module';

import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, {
  type LlmResolvedModelInfo,
  type ModelModality,
} from '@deepseek-ai/dsh-llm';
import * as DeepSeekLlm from '@deepseek-ai/dsh-llm-deepseek';

import { COMPATIBILITY_LIMITS } from './compatibility-config.js';

const require = createRequire(import.meta.url);
const PI_AI_ADAPTER = '@deepseek-ai/dsh-llm-pi-ai';

const packageVersion = (name: string): string => {
  const value: unknown = require(`${name}/package.json`);
  if (
    typeof value !== 'object' || value === null ||
    !('version' in value) || typeof value.version !== 'string'
  ) {
    throw new Error(`PACKAGE_VERSION_UNRESOLVED: ${name}`);
  }
  return value.version;
};

export const DEEPSEEK_ENDPOINT_BASE = 'https://api.deepseek.com';
export const GOOGLE_GEMINI_ENDPOINT_BASE =
  'https://generativelanguage.googleapis.com/v1beta';

export interface ProviderCatalogFact {
  readonly route: string;
  readonly model: string;
  readonly modelName: string;
  readonly adapter: string;
  readonly adapterVersion: string;
  readonly endpointBase: string;
  readonly inputModalities: readonly ModelModality[];
  readonly contextWindow: number | null;
  readonly adapterDefaultMaxTokens: number | null;
  readonly advertisedReasoningEfforts: readonly string[];
  readonly requestedReasoningEffort: 'off' | 'provider-default';
  readonly requestedMaxOutputTokens: number;
  readonly catalogListed: boolean;
  readonly catalogEligible: boolean;
  readonly compatibilityPassed: false;
}

export interface ProviderCatalogResolution {
  readonly deepseek: ProviderCatalogFact;
  readonly gemini: ProviderCatalogFact;
  dispose(): Promise<void>;
}

export interface ProviderCatalogRequest {
  readonly deepseekModel: string;
  readonly geminiRoute: string;
  readonly geminiModel: string;
}

const catalogFact = (
  model: LlmResolvedModelInfo,
  options: {
    readonly adapter: string;
    readonly endpointBase: string;
    readonly catalogListed: boolean;
    readonly requestedReasoningEffort: 'off' | 'provider-default';
    readonly requiredModalities: readonly ModelModality[];
  },
): ProviderCatalogFact => {
  const modalities = model.inputModalities ?? [];
  const catalogEligible = options.requiredModalities.every((required) =>
    modalities.includes(required)
  );
  return Object.freeze({
    route: model.provider,
    model: model.id,
    modelName: model.name,
    adapter: options.adapter,
    adapterVersion: packageVersion(options.adapter),
    endpointBase: options.endpointBase,
    inputModalities: Object.freeze([...modalities]),
    contextWindow: model.context?.contextWindow ?? null,
    adapterDefaultMaxTokens: model.defaultMaxTokens ?? null,
    advertisedReasoningEfforts: Object.freeze(
      model.reasoning?.efforts.map((effort) => String(effort.id)) ?? [],
    ),
    requestedReasoningEffort: options.requestedReasoningEffort,
    requestedMaxOutputTokens:
      COMPATIBILITY_LIMITS.maxOutputTokensPerDispatch,
    catalogListed: options.catalogListed,
    catalogEligible,
    compatibilityPassed: false,
  });
};

const endpointForGeminiRoute = (route: string): string => {
  if (route === 'google') return GOOGLE_GEMINI_ENDPOINT_BASE;
  throw new Error(
    `GEMINI_ENDPOINT_UNRESOLVED: ${route}; this gate supports only the installed official google route`,
  );
};

/**
 * Mount the exact locked DSH adapters and query only their local catalogs.
 * No stream is opened, no credential is resolved, and no provider request is
 * sent. Catalog eligibility remains explicitly distinct from compatibility.
 */
export const resolveProviderCatalog = async (
  request: ProviderCatalogRequest,
): Promise<ProviderCatalogResolution> => {
  const ctx = new Context();
  let active = true;
  try {
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(DeepSeekLlm, {
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      thinking: 'disabled',
      reasoningEffort: 'off',
      maxTokens: COMPATIBILITY_LIMITS.maxOutputTokensPerDispatch,
      streamIdleTimeoutMs: COMPATIBILITY_LIMITS.deadlineMs,
      retryPolicy: { mode: 'normal', maxRetries: 0 },
    });
    // Keep the optional pi-ai provider SDK types out of the host's public type
    // graph. The locked runtime plugin remains the implementation authority.
    const piAiLlm = await import(PI_AI_ADAPTER);
    await ctx.plugin(piAiLlm, {
      providers: {
        [request.geminiRoute]: {
          apiKeyEnv: 'GEMINI_API_KEY',
          streamIdleTimeoutMs: COMPATIBILITY_LIMITS.deadlineMs,
          timeoutMs: COMPATIBILITY_LIMITS.deadlineMs,
          retryPolicy: { mode: 'normal', maxRetries: 0 },
        },
      },
    });

    const [deepseekModels, geminiModels, deepseekModel, geminiModel] =
      await Promise.all([
        ctx.llm.listModels('deepseek-official'),
        ctx.llm.listModels(request.geminiRoute),
        ctx.llm.resolveModelInfo('deepseek-official', request.deepseekModel),
        ctx.llm.resolveModelInfo(request.geminiRoute, request.geminiModel),
      ]);
    const deepseek = catalogFact(deepseekModel, {
      adapter: '@deepseek-ai/dsh-llm-deepseek',
      endpointBase: DEEPSEEK_ENDPOINT_BASE,
      catalogListed: deepseekModels.some((model) => model.id === request.deepseekModel),
      requestedReasoningEffort:
        COMPATIBILITY_LIMITS.reasoningEffort.deepseek,
      requiredModalities: ['text'],
    });
    const gemini = catalogFact(geminiModel, {
      adapter: PI_AI_ADAPTER,
      endpointBase: endpointForGeminiRoute(request.geminiRoute),
      catalogListed: geminiModels.some((model) => model.id === request.geminiModel),
      requestedReasoningEffort: COMPATIBILITY_LIMITS.reasoningEffort.gemini,
      requiredModalities: ['text', 'image'],
    });
    return {
      deepseek,
      gemini,
      async dispose() {
        if (!active) return;
        active = false;
        await ctx.fiber.dispose();
      },
    };
  } catch (error) {
    if (active) {
      active = false;
      await ctx.fiber.dispose();
    }
    throw error;
  }
};
