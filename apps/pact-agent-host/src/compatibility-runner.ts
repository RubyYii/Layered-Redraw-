import {
  COMPATIBILITY_LIMITS,
  requireConfiguredCompatibility,
  type CompatibilityConfigInspection,
  type CompatibilityProvider,
} from './compatibility-config.js';
import {
  CompatibilityDispatchError,
  ProviderDispatcher,
  type ProviderAttemptResult,
  type ProviderTransport,
} from './dispatch-budget.js';
import {
  COMPATIBILITY_EXECUTION_WAVES,
  COMPATIBILITY_PROBES,
  probePlanSummary,
  type ProbeId,
} from './probe-plan.js';
import type { ProviderAttemptRecord } from './provider-envelope.js';

export interface CompatibilityRunResult {
  readonly completedProbes: number;
  readonly sentDispatches: number;
  readonly retriesUsed: readonly CompatibilityProvider[];
  readonly attemptRecords: ReturnType<ProviderDispatcher['attemptRecords']>;
}

export interface CompatibilityRunOptions {
  readonly config: CompatibilityConfigInspection;
  readonly transport: ProviderTransport;
  readonly runId: string;
  readonly syntheticAttachmentId: string;
  readonly now?: () => number;
}

export const runCompatibilityPlan = async (
  options: CompatibilityRunOptions,
): Promise<CompatibilityRunResult> => {
  const config = requireConfiguredCompatibility(options.config);
  const now = options.now ?? Date.now;
  const summary = probePlanSummary(COMPATIBILITY_PROBES);
  const dispatcher = new ProviderDispatcher({
    deadlineAt: now() + COMPATIBILITY_LIMITS.deadlineMs,
    maximumDispatches: summary.maximumDispatches,
    transport: options.transport,
    now,
  });
  const probes = new Map(COMPATIBILITY_PROBES.map((probe) => [probe.id, probe]));
  const completed = new Set<ProbeId>();

  for (const wave of COMPATIBILITY_EXECUTION_WAVES) {
    await Promise.all(wave.map(async (probeId) => {
      const probe = probes.get(probeId);
      if (probe === undefined) {
        throw new CompatibilityDispatchError(
          'PROBE_PLAN_INVALID',
          `missing probe ${probeId}`,
        );
      }
      for (const dependency of probe.dependsOn) {
        if (!completed.has(dependency)) {
          throw new CompatibilityDispatchError(
            'PROBE_DEPENDENCY_INCOMPLETE',
            `${probe.id} requires ${dependency}`,
          );
        }
      }
      const selection = probe.provider === 'deepseek'
        ? config.deepseek
        : config.gemini;
      for (const dispatch of probe.dispatches) {
        const result = await dispatcher.dispatch({
          probeId: probe.id,
          provider: probe.provider,
          route: selection.route,
          model: selection.model,
          purpose: dispatch.purpose,
          expectedOutcome: dispatch.expectedOutcome,
          ...(dispatch.expectedTools === undefined
            ? {}
            : { expectedTools: dispatch.expectedTools }),
          ...(dispatch.syntheticImage === true
            ? { attachmentId: options.syntheticAttachmentId }
            : {}),
        }, options.runId);
        if (
          dispatch.expectedOutcome === 'structured-tool' &&
          result.outcome !== 'structured-tool'
        ) {
          throw new CompatibilityDispatchError(
            'STRUCTURED_SUBMISSION_MISSING',
            `${probe.id} returned ${result.outcome} without its required tool submission`,
          );
        }
        if (
          dispatch.expectedOutcome !== 'structured-tool' &&
          result.outcome !== dispatch.expectedOutcome
        ) {
          throw new CompatibilityDispatchError(
            'EXPECTED_PROVIDER_OUTCOME_MISSING',
            `${probe.id} returned ${result.outcome}; expected ${dispatch.expectedOutcome}`,
          );
        }
      }
      completed.add(probe.id);
    }));
  }

  return {
    completedProbes: completed.size,
    sentDispatches: dispatcher.sentDispatches,
    retriesUsed: dispatcher.retriesUsed(),
    attemptRecords: dispatcher.attemptRecords(),
  };
};

export interface FakeTransportOptions {
  readonly resetBeforeSideEffect?: readonly CompatibilityProvider[];
  readonly plainJsonForProbe?: ProbeId;
}

export type FakeCompatibilityTransport = ProviderTransport & {
  readonly attempts: ProviderAttemptRecord[];
};

export const createFakeCompatibilityTransport = (
  options: FakeTransportOptions = {},
): FakeCompatibilityTransport => {
  const attempts: ProviderAttemptRecord[] = [];
  const resets = new Set(options.resetBeforeSideEffect ?? []);
  const transport = (async (
    record: ProviderAttemptRecord,
  ): Promise<ProviderAttemptResult> => {
    attempts.push(record);
    if (resets.delete(record.provider)) {
      return {
        kind: 'failure',
        code: 'TRANSPORT_RESET',
        message: `synthetic ${record.provider} pre-side-effect reset`,
        preSideEffect: true,
        sideEffectAccepted: false,
      };
    }
    if (record.probeId === options.plainJsonForProbe) {
      return {
        kind: 'success',
        outcome: 'plain-json',
        sideEffectAccepted: false,
      };
    }
    return {
      kind: 'success',
      outcome: record.expectedOutcome,
      sideEffectAccepted: record.expectedOutcome === 'structured-tool',
    };
  }) as FakeCompatibilityTransport;
  Object.defineProperty(transport, 'attempts', {
    value: attempts,
    enumerable: true,
  });
  return transport;
};
