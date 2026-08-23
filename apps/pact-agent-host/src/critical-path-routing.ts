import { createHash } from 'node:crypto';

import { COUNCIL_ROLE_ORDER, type CouncilRole } from './critical-path-council.js';

export type CriticalPathDispatchRole = CouncilRole | 'ConductorCommit';
export type ProviderInputClass = 'text' | 'image' | 'audio' | 'scene';

export interface ProviderRoutingAssignment {
  readonly role: CriticalPathDispatchRole;
  readonly provider: 'deepseek' | 'gemini';
  readonly route: string;
  readonly model: string;
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly promptSha256: string;
  readonly supportedInputClasses: readonly ProviderInputClass[];
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly concurrencyCeiling: number;
  readonly conductorContinuityKey: string | null;
}

export interface ProviderRoutingManifest {
  readonly schemaVersion: 'pact-cp03-provider-routing/0.1';
  readonly manifestVersion: string;
  readonly approvalId: string;
  readonly approvedAt: string;
  readonly bakeoffEvidenceId: string;
  readonly plannedDispatches: 6;
  readonly maximumDispatches: 8;
  readonly assignments: readonly ProviderRoutingAssignment[];
}

export interface ProviderRoutingAudit {
  readonly schemaVersion: 'pact-cp03-provider-routing-audit/0.1';
  readonly status: 'PASS' | 'FAIL';
  readonly manifestSha256: string;
  readonly findings: readonly string[];
  readonly providerConcurrency: Readonly<Record<'deepseek' | 'gemini', {
    readonly required: number;
    readonly declared: number;
  }>>;
}

const roleOrder: readonly CriticalPathDispatchRole[] = [...COUNCIL_ROLE_ORDER, 'ConductorCommit'];
const SHA256 = /^[a-f0-9]{64}$/;
const safeId = /^[A-Za-z0-9@][A-Za-z0-9@._/:+-]{0,159}$/;
const hasText = (value: unknown): value is string => typeof value === 'string' && safeId.test(value);
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
};
const manifestHash = (manifest: ProviderRoutingManifest): string => createHash('sha256')
  .update(JSON.stringify(canonicalize(manifest)), 'utf8')
  .digest('hex');

const requiredInputsFor = (
  role: CriticalPathDispatchRole,
  turnInputs: readonly ProviderInputClass[],
): readonly ProviderInputClass[] => {
  switch (role) {
    case 'Witness':
      return turnInputs;
    case 'Rewriter':
      return turnInputs.filter((entry) => entry !== 'audio');
    case 'Archivist':
    case 'Guardian':
      return ['text', 'scene'];
    default:
      return ['text'];
  }
};

export function auditProviderRoutingManifest(
  manifest: ProviderRoutingManifest,
  turnInputClasses: readonly ProviderInputClass[] = ['text', 'image', 'scene'],
): ProviderRoutingAudit {
  const findings: string[] = [];
  const assignments = manifest?.assignments ?? [];
  if (manifest?.schemaVersion !== 'pact-cp03-provider-routing/0.1') findings.push('schemaVersion');
  if (!hasText(manifest?.manifestVersion)) findings.push('manifestVersion');
  if (!hasText(manifest?.approvalId)) findings.push('approvalId');
  if (!hasText(manifest?.bakeoffEvidenceId)) findings.push('bakeoffEvidenceId');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(manifest?.approvedAt ?? '')
    || !Number.isFinite(Date.parse(manifest?.approvedAt ?? ''))) findings.push('approvedAt');
  if (manifest?.plannedDispatches !== 6) findings.push('plannedDispatches');
  if (manifest?.maximumDispatches !== 8) findings.push('maximumDispatches');

  const byRole = new Map<CriticalPathDispatchRole, ProviderRoutingAssignment>();
  for (const [index, assignment] of assignments.entries()) {
    if (!roleOrder.includes(assignment.role)) {
      findings.push(`assignments[${index}].role`);
      continue;
    }
    if (byRole.has(assignment.role)) findings.push(`assignments.${assignment.role}.duplicate`);
    byRole.set(assignment.role, assignment);
    if (!['deepseek', 'gemini'].includes(assignment.provider)) findings.push(`assignments.${assignment.role}.provider`);
    for (const key of ['route', 'model', 'adapterPackage', 'adapterVersion'] as const) {
      if (!hasText(assignment[key])) findings.push(`assignments.${assignment.role}.${key}`);
    }
    if (!SHA256.test(assignment.promptSha256)) findings.push(`assignments.${assignment.role}.promptSha256`);
    if (!Number.isInteger(assignment.maxInputTokens) || assignment.maxInputTokens < 1_024) findings.push(`assignments.${assignment.role}.maxInputTokens`);
    if (!Number.isInteger(assignment.maxOutputTokens) || assignment.maxOutputTokens < 128 || assignment.maxOutputTokens > 2_048) findings.push(`assignments.${assignment.role}.maxOutputTokens`);
    if (!Number.isInteger(assignment.timeoutMs) || assignment.timeoutMs < 250 || assignment.timeoutMs >= 12_000) findings.push(`assignments.${assignment.role}.timeoutMs`);
    if (!Number.isInteger(assignment.concurrencyCeiling) || assignment.concurrencyCeiling < 1) findings.push(`assignments.${assignment.role}.concurrencyCeiling`);
    const missingInputs = requiredInputsFor(assignment.role, turnInputClasses)
      .filter((input) => !assignment.supportedInputClasses.includes(input));
    if (missingInputs.length > 0) findings.push(`assignments.${assignment.role}.supportedInputClasses:${missingInputs.join('+')}`);
  }
  for (const role of roleOrder) if (!byRole.has(role)) findings.push(`assignments.${role}.missing`);
  if (assignments.length !== roleOrder.length) findings.push('assignments.count');

  const intent = byRole.get('ConductorIntent');
  const commit = byRole.get('ConductorCommit');
  if (intent && commit) {
    const samePinnedRoute = ['provider', 'route', 'model', 'adapterPackage', 'adapterVersion']
      .every((key) => intent[key as keyof ProviderRoutingAssignment] === commit[key as keyof ProviderRoutingAssignment]);
    if (!samePinnedRoute) findings.push('conductor.pinnedRoute');
    if (!intent.conductorContinuityKey || intent.conductorContinuityKey !== commit.conductorContinuityKey) {
      findings.push('conductor.continuityKey');
    }
  }
  for (const role of COUNCIL_ROLE_ORDER) {
    if (byRole.get(role)?.conductorContinuityKey !== null && role !== 'ConductorIntent') {
      findings.push(`assignments.${role}.conductorContinuityKey`);
    }
  }
  const providers = new Set(assignments.map((assignment) => assignment.provider));
  if (!providers.has('deepseek') || !providers.has('gemini')) findings.push('providers.dualProviderRequired');

  const providerConcurrency = Object.fromEntries((['deepseek', 'gemini'] as const).map((provider) => {
    const waveAssignments = COUNCIL_ROLE_ORDER.map((role) => byRole.get(role)).filter((entry) => entry?.provider === provider);
    const declared = Math.min(...waveAssignments.map((entry) => entry!.concurrencyCeiling), Infinity);
    const required = waveAssignments.length;
    if (!Number.isFinite(declared) || declared < required) findings.push(`providers.${provider}.concurrencyCeiling`);
    return [provider, { required, declared: Number.isFinite(declared) ? declared : 0 }];
  })) as ProviderRoutingAudit['providerConcurrency'];

  return {
    schemaVersion: 'pact-cp03-provider-routing-audit/0.1',
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    manifestSha256: manifestHash(manifest),
    findings: [...new Set(findings)],
    providerConcurrency,
  };
}
