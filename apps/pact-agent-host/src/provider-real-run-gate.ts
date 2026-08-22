import {
  COMPATIBILITY_PROBES,
  probePlanSummary,
  type ProbeId,
} from './probe-plan.js';

export interface ProviderRealRunApproval {
  readonly schemaVersion: 'cp03-provider-real-approval/0.1';
  readonly approvalId: string;
  readonly approvedAt: string;
  readonly runId: string;
  readonly probeIds: readonly ProbeId[];
  readonly plannedDispatches: number;
  readonly maximumDispatches: number;
  readonly maxUsd: number;
  readonly selection: {
    readonly deepseek: { readonly route: string; readonly model: string };
    readonly gemini: { readonly route: string; readonly model: string };
  };
  readonly inputClasses: readonly [
    'fictional_text',
    'synthetic_checkerboard',
  ];
}

export interface ProviderRealRunPreflightFacts {
  readonly status: 'NOT_ELIGIBLE' | 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL';
  readonly counts: {
    readonly intended: number;
    readonly eligible: number;
    readonly excluded: number;
    readonly plannedDispatches: number;
    readonly sentDispatches: number;
    readonly maximumDispatches: number;
  };
  readonly selection: {
    readonly deepseek: {
      readonly route: string;
      readonly model: string | null;
    };
    readonly gemini: {
      readonly route: string | null;
      readonly model: string | null;
    };
  };
  readonly pricing: {
    readonly estimate: { readonly userCapUsd: number } | null;
  };
  readonly probes: {
    readonly eligible: readonly string[];
    readonly excluded: readonly unknown[];
  };
}

export interface ExecuteAuthorizedProviderRunOptions<TResult> {
  readonly preflight: ProviderRealRunPreflightFacts;
  readonly approval: ProviderRealRunApproval;
  readonly execute: () => Promise<TResult>;
}

export type ProviderRealRunRefusal =
  | {
      readonly status: 'REFUSED';
      readonly code: 'PROVIDER_PREFLIGHT_NOT_ELIGIBLE';
      readonly providerRequestsMade: 0;
      readonly counts: ProviderRealRunPreflightFacts['counts'];
    }
  | {
      readonly status: 'REFUSED';
      readonly code: 'PROVIDER_PREFLIGHT_PLAN_MISMATCH';
      readonly mismatches: readonly string[];
      readonly providerRequestsMade: 0;
    }
  | {
      readonly status: 'REFUSED';
      readonly code: 'PROVIDER_APPROVAL_RECORD_INVALID';
      readonly invalid: readonly string[];
      readonly providerRequestsMade: 0;
    }
  | {
      readonly status: 'REFUSED';
      readonly code: 'PROVIDER_APPROVAL_SCOPE_MISMATCH';
      readonly mismatches: readonly string[];
      readonly providerRequestsMade: 0;
    };

const fixedProbeIds = COMPATIBILITY_PROBES.map((probe) => probe.id);
const fixedPlan = probePlanSummary(COMPATIBILITY_PROBES);
const fixedInputClasses = [
  'fictional_text',
  'synthetic_checkerboard',
] as const;

const sameStrings = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.length === right.length &&
  left.every((value, index) => value === right[index]);

const safeRecordId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value);

const utcIsoTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

export const executeAuthorizedProviderRun = async <TResult>(
  options: ExecuteAuthorizedProviderRunOptions<TResult>,
): Promise<TResult | ProviderRealRunRefusal> => {
  if (options.preflight.status !== 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL') {
    return {
      status: 'REFUSED',
      code: 'PROVIDER_PREFLIGHT_NOT_ELIGIBLE',
      providerRequestsMade: 0,
      counts: { ...options.preflight.counts },
    };
  }
  const preflightMismatches: string[] = [];
  if (options.preflight.counts.intended !== fixedPlan.intendedProbes) {
    preflightMismatches.push('counts.intended');
  }
  if (options.preflight.counts.eligible !== fixedPlan.intendedProbes) {
    preflightMismatches.push('counts.eligible');
  }
  if (options.preflight.counts.excluded !== 0) {
    preflightMismatches.push('counts.excluded');
  }
  if (
    options.preflight.counts.plannedDispatches !== fixedPlan.plannedDispatches
  ) {
    preflightMismatches.push('counts.plannedDispatches');
  }
  if (options.preflight.counts.sentDispatches !== 0) {
    preflightMismatches.push('counts.sentDispatches');
  }
  if (
    options.preflight.counts.maximumDispatches !== fixedPlan.maximumDispatches
  ) {
    preflightMismatches.push('counts.maximumDispatches');
  }
  if (!sameStrings(options.preflight.probes.eligible, fixedProbeIds)) {
    preflightMismatches.push('probes.eligible');
  }
  if (preflightMismatches.length > 0) {
    return {
      status: 'REFUSED',
      code: 'PROVIDER_PREFLIGHT_PLAN_MISMATCH',
      mismatches: preflightMismatches,
      providerRequestsMade: 0,
    };
  }
  const invalid: string[] = [];
  if (!safeRecordId(options.approval.runId)) invalid.push('runId');
  if (!safeRecordId(options.approval.approvalId)) invalid.push('approvalId');
  if (!utcIsoTimestamp(options.approval.approvedAt)) {
    invalid.push('approvedAt');
  }
  if (invalid.length > 0) {
    return {
      status: 'REFUSED',
      code: 'PROVIDER_APPROVAL_RECORD_INVALID',
      invalid,
      providerRequestsMade: 0,
    };
  }
  const mismatches: string[] = [];
  if (!sameStrings(options.approval.probeIds, fixedProbeIds)) {
    mismatches.push('probeIds');
  }
  if (
    options.approval.plannedDispatches !== fixedPlan.plannedDispatches ||
    options.approval.plannedDispatches !==
      options.preflight.counts.plannedDispatches
  ) {
    mismatches.push('plannedDispatches');
  }
  if (
    options.approval.maximumDispatches !== fixedPlan.maximumDispatches ||
    options.approval.maximumDispatches !==
      options.preflight.counts.maximumDispatches
  ) {
    mismatches.push('maximumDispatches');
  }
  if (
    options.approval.selection.deepseek.route !==
      options.preflight.selection.deepseek.route
  ) {
    mismatches.push('selection.deepseek.route');
  }
  if (
    options.approval.selection.deepseek.model !==
      options.preflight.selection.deepseek.model
  ) {
    mismatches.push('selection.deepseek.model');
  }
  if (
    options.approval.selection.gemini.route !==
      options.preflight.selection.gemini.route
  ) {
    mismatches.push('selection.gemini.route');
  }
  if (
    options.approval.selection.gemini.model !==
      options.preflight.selection.gemini.model
  ) {
    mismatches.push('selection.gemini.model');
  }
  if (
    options.preflight.pricing.estimate === null ||
    options.approval.maxUsd !==
      options.preflight.pricing.estimate.userCapUsd
  ) {
    mismatches.push('maxUsd');
  }
  if (!sameStrings(options.approval.inputClasses, fixedInputClasses)) {
    mismatches.push('inputClasses');
  }
  if (mismatches.length > 0) {
    return {
      status: 'REFUSED',
      code: 'PROVIDER_APPROVAL_SCOPE_MISMATCH',
      mismatches,
      providerRequestsMade: 0,
    };
  }
  return options.execute();
};
