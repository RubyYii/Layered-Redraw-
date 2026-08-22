import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';

import {
  inspectCompatibilityConfig,
  type CompatibilityConfigInspection,
  type CompatibilityProvider,
} from './compatibility-config.js';
import {
  resolveProviderCatalog,
  type ProviderCatalogFact,
} from './catalog-eligibility.js';
import {
  OFFICIAL_PRICING_SOURCES,
  resolveOfficialPricing,
} from './official-pricing.js';
import { estimateWorstCaseCost } from './pricing-budget.js';
import {
  COMPATIBILITY_PROBES,
  probePlanSummary,
} from './probe-plan.js';
import { saveSyntheticCheckerboard } from './synthetic-checkerboard.js';

export interface PreflightCatalogReport {
  readonly deepseek: ProviderCatalogFact | null;
  readonly gemini: ProviderCatalogFact | null;
  readonly error: string | null;
}

const selectorReady = (
  inspection: CompatibilityConfigInspection,
): inspection is CompatibilityConfigInspection & {
  readonly deepseek: CompatibilityConfigInspection['deepseek'] & {
    readonly model: string;
  };
  readonly gemini: CompatibilityConfigInspection['gemini'] & {
    readonly model: string;
  };
} => inspection.deepseek.model !== undefined &&
  inspection.gemini.route.length > 0 &&
  inspection.gemini.model !== undefined;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const buildProviderPreflightReport = async (
  env: Readonly<NodeJS.ProcessEnv>,
  attachments: AttachmentStore,
) => {
  const inspected = inspectCompatibilityConfig(env);
  const plan = probePlanSummary(COMPATIBILITY_PROBES);
  const syntheticInput = await saveSyntheticCheckerboard(attachments);

  let catalog: PreflightCatalogReport = {
    deepseek: null,
    gemini: null,
    error: null,
  };
  if (selectorReady(inspected)) {
    try {
      const resolved = await resolveProviderCatalog({
        deepseekModel: inspected.deepseek.model,
        geminiRoute: inspected.gemini.route,
        geminiModel: inspected.gemini.model,
      });
      try {
        catalog = {
          deepseek: resolved.deepseek,
          gemini: resolved.gemini,
          error: null,
        };
      } finally {
        await resolved.dispose();
      }
    } catch (error) {
      catalog = { deepseek: null, gemini: null, error: messageOf(error) };
    }
  }

  const pricing = selectorReady(inspected)
    ? resolveOfficialPricing(
        inspected.deepseek.model,
        inspected.gemini.model,
      )
    : null;
  const cost = pricing?.status === 'RESOLVED' && inspected.maxUsd !== undefined
    ? estimateWorstCaseCost(pricing.rates, inspected.maxUsd)
    : null;

  const globalReasons: string[] = [];
  if (inspected.missing.length > 0) {
    globalReasons.push(`missing configuration: ${inspected.missing.join(', ')}`);
  }
  if (selectorReady(inspected) && catalog.error !== null) {
    globalReasons.push(`catalog resolution failed: ${catalog.error}`);
  }
  if (
    selectorReady(inspected) && catalog.error === null &&
    (catalog.deepseek?.catalogEligible !== true ||
      catalog.gemini?.catalogEligible !== true)
  ) {
    globalReasons.push('one or more exact models lack required local catalog modalities');
  }
  if (pricing?.status === 'UNRESOLVED') {
    globalReasons.push(
      `official pricing unresolved for: ${pricing.unresolvedModels.join(', ')}`,
    );
  }
  if (selectorReady(inspected) && pricing === null) {
    globalReasons.push('official pricing resolution unavailable');
  }
  if (cost !== null && !cost.withinUserCap) {
    globalReasons.push(
      `worst-case cost ${cost.worstCaseUsd.toFixed(6)} USD exceeds user cap ${cost.userCapUsd.toFixed(6)} USD`,
    );
  }

  const runEligible =
    inspected.status === 'CONFIGURED' &&
    globalReasons.length === 0 &&
    catalog.deepseek?.catalogEligible === true &&
    catalog.gemini?.catalogEligible === true &&
    cost?.withinUserCap === true;
  const eligibleProbeIds = runEligible
    ? COMPATIBILITY_PROBES.map((probe) => probe.id)
    : [];
  const excluded = runEligible
    ? []
    : COMPATIBILITY_PROBES.map((probe) => ({
        probeId: probe.id,
        provider: probe.provider,
        reasons: [...globalReasons],
      }));

  const providerCounts = (provider: CompatibilityProvider) => ({
    intended: plan.byProvider[provider].probes,
    eligible: eligibleProbeIds.filter((probeId) =>
      COMPATIBILITY_PROBES.find((probe) => probe.id === probeId)?.provider ===
        provider
    ).length,
    completed: 0,
    plannedDispatches: plan.byProvider[provider].plannedDispatches,
    sentDispatches: 0,
    maximumDispatches: plan.byProvider[provider].maximumDispatches,
  });

  return Object.freeze({
    schemaVersion: 'cp03-provider-preflight/0.1',
    status: runEligible
      ? 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL'
      : 'NOT_ELIGIBLE',
    realDispatchAuthorized: false,
    counts: {
      intended: plan.intendedProbes,
      eligible: eligibleProbeIds.length,
      excluded: excluded.length,
      completed: 0,
      plannedDispatches: plan.plannedDispatches,
      sentDispatches: 0,
      maximumDispatches: plan.maximumDispatches,
      byProvider: {
        deepseek: providerCounts('deepseek'),
        gemini: providerCounts('gemini'),
      },
    },
    retryPolicy: {
      dispatcher: 'one pre-side-effect transport retry per provider per run',
      afterSideEffect: 'refused',
      adapterInternalRetries: 0,
    },
    limits: inspected.limits,
    selection: {
      deepseek: {
        ...inspected.deepseek,
        model: inspected.deepseek.model ?? null,
      },
      gemini: {
        ...inspected.gemini,
        route: inspected.gemini.route || null,
        model: inspected.gemini.model ?? null,
      },
    },
    catalog,
    pricing: {
      resolution: pricing,
      estimate: cost,
      officialSources: OFFICIAL_PRICING_SOURCES,
    },
    input: {
      textClass: 'fictional_text',
      generation: 'in-memory 64x64 black-white PNG checkerboard',
      localEnvelope: syntheticInput.envelope,
      messageBlock: syntheticInput.messageBlock,
      sentToProvider: false,
      sourceImage: null,
      repositoryContent: null,
      privateUserContent: null,
    },
    probes: {
      eligible: eligibleProbeIds,
      excluded,
    },
    disclosure: {
      providerRequestsMade: 0,
      providerDataSent: [],
      externalToolsEnabled: [],
      realRunRequiresFreshExplicitApproval: true,
      catalogEligibilityIsCompatibilityPass: false,
    },
  });
};
