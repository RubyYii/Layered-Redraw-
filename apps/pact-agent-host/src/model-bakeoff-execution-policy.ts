import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import type { ModelBakeoffPhase } from './model-bakeoff-plan.js';

const SHA256 = /^[a-f0-9]{64}$/;

export type ModelBakeoffReasoningEffort = 'off' | 'low';

export interface ModelBakeoffExecutionPolicy {
  readonly schemaVersion: 'cp03-model-bakeoff-execution-policy/0.1';
  readonly roleCaps: Readonly<Record<ModelBakeoffPhase, number>>;
  readonly reasoningByModel: Readonly<Record<string, ModelBakeoffReasoningEffort>>;
  readonly roleSubmissionContract: 'council-role-submission/0.1';
  readonly commitSubmissionContract: 'conductor-commit-submission/0.1';
  readonly canonicalShardContract: 'cp03-council/0.2';
  readonly pairEligibilityPolicy: 'pair-local-two-repetition/0.1';
  readonly outputSanitizer: 'forbidden';
  readonly executionPolicySha256: string;
}

export interface ModelBakeoffExecutionPolicyAudit {
  readonly status: 'PASS' | 'FAIL';
  readonly findings: readonly string[];
}

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const canonicalHash = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

const EXPECTED_UNSIGNED = deepFreeze({
  schemaVersion: 'cp03-model-bakeoff-execution-policy/0.1' as const,
  roleCaps: {
    ConductorIntent: 1_024,
    ConductorCommit: 512,
    Archivist: 1_024,
    Guardian: 1_024,
    Witness: 1_024,
    Rewriter: 1_024,
  } satisfies Record<ModelBakeoffPhase, number>,
  reasoningByModel: {
    'deepseek-v4-pro': 'off',
    'deepseek-v4-flash': 'off',
    'gemini-3.5-flash': 'low',
    'gemini-3.6-flash': 'low',
    'gemini-3.7-flash': 'low',
  } satisfies Record<string, ModelBakeoffReasoningEffort>,
  roleSubmissionContract: 'council-role-submission/0.1' as const,
  commitSubmissionContract: 'conductor-commit-submission/0.1' as const,
  canonicalShardContract: 'cp03-council/0.2' as const,
  pairEligibilityPolicy: 'pair-local-two-repetition/0.1' as const,
  outputSanitizer: 'forbidden' as const,
});

export function createModelBakeoffExecutionPolicy(): ModelBakeoffExecutionPolicy {
  const unsigned = {
    ...EXPECTED_UNSIGNED,
    roleCaps: { ...EXPECTED_UNSIGNED.roleCaps },
    reasoningByModel: { ...EXPECTED_UNSIGNED.reasoningByModel },
  };
  return deepFreeze({
    ...unsigned,
    executionPolicySha256: canonicalHash(unsigned),
  });
}

export function verifyModelBakeoffExecutionPolicy(
  policy: ModelBakeoffExecutionPolicy,
): ModelBakeoffExecutionPolicyAudit {
  const findings: string[] = [];
  if (policy.schemaVersion !== EXPECTED_UNSIGNED.schemaVersion) {
    findings.push('EXECUTION_POLICY_SCHEMA_VERSION_INVALID');
  }
  const { executionPolicySha256, ...unsigned } = policy;
  if (canonicalJson(unsigned) !== canonicalJson(EXPECTED_UNSIGNED)) {
    findings.push('EXECUTION_POLICY_CONTENT_MISMATCH');
  }
  if (
    !SHA256.test(executionPolicySha256)
    || canonicalHash(unsigned) !== executionPolicySha256
  ) {
    findings.push('EXECUTION_POLICY_SHA256_MISMATCH');
  }
  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings: [...new Set(findings)],
  };
}
