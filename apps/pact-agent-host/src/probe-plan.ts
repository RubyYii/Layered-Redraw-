import type { CompatibilityProvider } from './compatibility-config.js';

export type ProbeId =
  | 'probe-01'
  | 'probe-02'
  | 'probe-03'
  | 'probe-04'
  | 'probe-05'
  | 'probe-06'
  | 'probe-07'
  | 'probe-08';

export type ProbeExpectedOutcome =
  | 'structured-tool'
  | 'terminal-after-tool-result'
  | 'hard-timeout-cancel'
  | 'cancel-after-first-chunk';

export type PactCompatibilityTool =
  | 'pact_publish_trace'
  | 'pact_route_turn'
  | 'pact_submit_contribution'
  | 'pact_submit_draft'
  | 'pact_submit_council_shard'
  | 'pact_submit_conductor_commit';

export interface ProbeDispatch {
  readonly purpose: string;
  readonly expectedOutcome: ProbeExpectedOutcome;
  readonly expectedTools?: readonly PactCompatibilityTool[];
  readonly syntheticImage?: true;
}

export interface CompatibilityProbe {
  readonly id: ProbeId;
  readonly label: string;
  readonly provider: CompatibilityProvider;
  readonly dependsOn: readonly ProbeId[];
  readonly dispatches: readonly ProbeDispatch[];
}

export const COMPATIBILITY_PROBES: readonly CompatibilityProbe[] = Object.freeze([
  {
    id: 'probe-01',
    label: 'DeepSeek schema contribution',
    provider: 'deepseek',
    dependsOn: [],
    dispatches: [{
      purpose: 'submit one schema-valid role contribution',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_contribution'],
    }],
  },
  {
    id: 'probe-02',
    label: 'DeepSeek conductor route/trace',
    provider: 'deepseek',
    dependsOn: [],
    dispatches: [{
      purpose: 'publish the first bounded public trace',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_publish_trace', 'pact_route_turn'],
    }],
  },
  {
    id: 'probe-03',
    label: 'Gemini schema contribution',
    provider: 'gemini',
    dependsOn: [],
    dispatches: [{
      purpose: 'submit one Gemini schema-valid role contribution',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_contribution'],
    }],
  },
  {
    id: 'probe-04',
    label: 'Gemini multimodal continuable Rewriter',
    provider: 'gemini',
    dependsOn: [],
    dispatches: [{
      purpose: 'read the synthetic checkerboard and emit the Rewriter contribution tool call',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_contribution'],
      syntheticImage: true,
    }],
  },
  {
    id: 'probe-05',
    label: 'DeepSeek parallel Guardian',
    provider: 'deepseek',
    dependsOn: [],
    dispatches: [{
      purpose: 'emit the parallel Guardian contribution tool call',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_contribution'],
    }],
  },
  {
    id: 'probe-06',
    label: 'DeepSeek conductor non-executable draft',
    provider: 'deepseek',
    dependsOn: ['probe-02', 'probe-04', 'probe-05'],
    dispatches: [{
      purpose: 'emit the non-executable conductor draft tool call',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_draft'],
    }],
  },
  {
    id: 'probe-07',
    label: 'DeepSeek hard-timeout cancel',
    provider: 'deepseek',
    dependsOn: [],
    dispatches: [{
      purpose: 'prove hard-deadline cancellation without draft promotion',
      expectedOutcome: 'hard-timeout-cancel',
    }],
  },
  {
    id: 'probe-08',
    label: 'Gemini cancel after first chunk',
    provider: 'gemini',
    dependsOn: [],
    dispatches: [{
      purpose: 'cancel after the first chunk without accepting a partial result',
      expectedOutcome: 'cancel-after-first-chunk',
    }],
  },
] satisfies readonly CompatibilityProbe[]);

/** Route/trace and the two fixed-role analyses deliberately share one wave. */
export const COMPATIBILITY_EXECUTION_WAVES: readonly (readonly ProbeId[])[] =
  Object.freeze([
    Object.freeze(['probe-01', 'probe-03'] as const),
    Object.freeze(['probe-02', 'probe-04', 'probe-05'] as const),
    Object.freeze(['probe-06'] as const),
    Object.freeze(['probe-07', 'probe-08'] as const),
  ]);

export interface ProbePlanSummary {
  readonly intendedProbes: number;
  readonly plannedDispatches: number;
  readonly maximumDispatches: number;
  readonly byProvider: Readonly<Record<CompatibilityProvider, {
    readonly probes: number;
    readonly plannedDispatches: number;
    readonly maximumDispatches: number;
  }>>;
}

export const probePlanSummary = (
  probes: readonly CompatibilityProbe[],
): ProbePlanSummary => {
  const deepseek = probes.filter((probe) => probe.provider === 'deepseek');
  const gemini = probes.filter((probe) => probe.provider === 'gemini');
  const summarize = (providerProbes: readonly CompatibilityProbe[]) => ({
    probes: providerProbes.length,
    plannedDispatches: providerProbes.reduce(
      (total, probe) => total + probe.dispatches.length,
      0,
    ),
    maximumDispatches: providerProbes.reduce(
      (total, probe) => total + probe.dispatches.length,
      0,
    ) + 1,
  });
  const deepseekSummary = summarize(deepseek);
  const geminiSummary = summarize(gemini);
  return {
    intendedProbes: probes.length,
    plannedDispatches:
      deepseekSummary.plannedDispatches + geminiSummary.plannedDispatches,
    maximumDispatches:
      deepseekSummary.maximumDispatches + geminiSummary.maximumDispatches,
    byProvider: {
      deepseek: deepseekSummary,
      gemini: geminiSummary,
    },
  };
};
