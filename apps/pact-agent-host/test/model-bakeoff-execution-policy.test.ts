import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import {
  createModelBakeoffExecutionPolicy,
  verifyModelBakeoffExecutionPolicy,
  type ModelBakeoffExecutionPolicy,
} from '../src/model-bakeoff-execution-policy.js';

const canonicalHash = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

describe('model bakeoff execution policy', () => {
  it('freezes the exact phase, model, contract, and evidence policy behind one hash', () => {
    const policy = createModelBakeoffExecutionPolicy();
    const { executionPolicySha256, ...unsigned } = policy;

    expect(policy).toMatchObject({
      schemaVersion: 'cp03-model-bakeoff-execution-policy/0.1',
      roleCaps: {
        ConductorIntent: 1_024,
        ConductorCommit: 512,
        Archivist: 1_024,
        Guardian: 1_024,
        Witness: 1_024,
        Rewriter: 1_024,
      },
      reasoningByModel: {
        'deepseek-v4-pro': 'off',
        'deepseek-v4-flash': 'off',
        'gemini-3.5-flash': 'low',
        'gemini-3.6-flash': 'low',
        'gemini-3.7-flash': 'low',
      },
      roleSubmissionContract: 'council-role-submission/0.1',
      commitSubmissionContract: 'conductor-commit-submission/0.1',
      canonicalShardContract: 'cp03-council/0.2',
      pairEligibilityPolicy: 'pair-local-two-repetition/0.1',
      outputSanitizer: 'forbidden',
    });
    expect(executionPolicySha256).toBe(canonicalHash(unsigned));
    expect(verifyModelBakeoffExecutionPolicy(policy)).toEqual({
      status: 'PASS',
      findings: [],
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.roleCaps)).toBe(true);
    expect(Object.isFrozen(policy.reasoningByModel)).toBe(true);
  });

  it.each([
    ['phase cap', (policy: ModelBakeoffExecutionPolicy) => ({
      ...policy,
      roleCaps: { ...policy.roleCaps, ConductorCommit: 1_024 },
    })],
    ['model set', (policy: ModelBakeoffExecutionPolicy) => {
      const { ['gemini-3.7-flash']: _removed, ...reasoningByModel } =
        policy.reasoningByModel;
      return { ...policy, reasoningByModel };
    }],
    ['reasoning effort', (policy: ModelBakeoffExecutionPolicy) => ({
      ...policy,
      reasoningByModel: {
        ...policy.reasoningByModel,
        'gemini-3.7-flash': 'off',
      },
    })],
    ['role submission contract', (policy: ModelBakeoffExecutionPolicy) => ({
      ...policy,
      roleSubmissionContract: 'council-shard/0.1',
    })],
    ['commit submission contract', (policy: ModelBakeoffExecutionPolicy) => ({
      ...policy,
      commitSubmissionContract: 'conductor-draft-commit/0.1',
    })],
    ['canonical contract', (policy: ModelBakeoffExecutionPolicy) => ({
      ...policy,
      canonicalShardContract: 'cp03-council/0.1',
    })],
    ['pair evidence policy', (policy: ModelBakeoffExecutionPolicy) => ({
      ...policy,
      pairEligibilityPolicy: 'global-all-cases/0.1',
    })],
    ['output sanitizer', (policy: ModelBakeoffExecutionPolicy) => ({
      ...policy,
      outputSanitizer: 'allowed',
    })],
  ] as const)('rejects a tampered %s even when the attacker recomputes the hash', (
    _label,
    mutate,
  ) => {
    const changed = mutate(createModelBakeoffExecutionPolicy()) as unknown as
      ModelBakeoffExecutionPolicy;
    const { executionPolicySha256: _oldHash, ...unsigned } = changed;
    const rehashed = {
      ...changed,
      executionPolicySha256: canonicalHash(unsigned),
    } as ModelBakeoffExecutionPolicy;

    const result = verifyModelBakeoffExecutionPolicy(rehashed);
    expect(result.status).toBe('FAIL');
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('rejects hash drift without accepting semantically unchanged content', () => {
    const policy = createModelBakeoffExecutionPolicy();

    expect(verifyModelBakeoffExecutionPolicy({
      ...policy,
      executionPolicySha256: 'f'.repeat(64),
    })).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['EXECUTION_POLICY_SHA256_MISMATCH']),
    });
  });
});
