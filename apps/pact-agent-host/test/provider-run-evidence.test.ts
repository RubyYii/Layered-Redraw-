import { describe, expect, it } from 'vitest';

import {
  createProviderAttemptRecord,
  finalizeProviderAttemptRecord,
} from '../src/provider-envelope.js';
import {
  verifyProviderRunEvidence,
  type ProviderRunArchive,
} from '../src/provider-run-evidence.js';
import type { ProviderRealRunApproval } from '../src/provider-real-run-gate.js';
import {
  COMPATIBILITY_PROBES,
  probePlanSummary,
} from '../src/probe-plan.js';

const fixedProbeIds = COMPATIBILITY_PROBES.map((probe) => probe.id);
const plan = probePlanSummary(COMPATIBILITY_PROBES);

const approval = (): ProviderRealRunApproval => ({
  schemaVersion: 'cp03-provider-real-approval/0.1',
  approvalId: 'approval_cp03_evidence_20260822',
  approvedAt: '2026-08-22T18:00:00.000Z',
  runId: 'compat_evidence_20260822_a1b2c3',
  probeIds: fixedProbeIds,
  plannedDispatches: plan.plannedDispatches,
  maximumDispatches: plan.maximumDispatches,
  maxUsd: 0.5,
  selection: {
    deepseek: { route: 'deepseek-official', model: 'deepseek-v4-pro' },
    gemini: { route: 'google', model: 'gemini-3.5-flash' },
  },
  inputClasses: ['fictional_text', 'synthetic_checkerboard'],
});

const attemptRecords = () => {
  let sentOrdinal = 0;
  return COMPATIBILITY_PROBES.flatMap((probe) =>
    probe.dispatches.map((dispatch) => {
      sentOrdinal += 1;
      const startedAt = new Date(
        Date.parse('2026-08-22T18:01:00.000Z') + sentOrdinal * 10,
      ).toISOString();
      const pending = createProviderAttemptRecord({
        probeId: probe.id,
        provider: probe.provider,
        route: probe.provider === 'deepseek' ? 'deepseek-official' : 'google',
        model: probe.provider === 'deepseek'
          ? 'deepseek-v4-pro'
          : 'gemini-3.5-flash',
        purpose: dispatch.purpose,
        expectedOutcome: dispatch.expectedOutcome,
        providerKind: 'real',
        ...(dispatch.expectedTools === undefined
          ? {}
          : { expectedTools: dispatch.expectedTools }),
        ...(dispatch.syntheticImage === true
          ? { attachmentId: `sha256:${'a'.repeat(64)}` }
          : {}),
      }, approval().runId, 1, sentOrdinal,
      Date.parse('2026-08-22T18:02:00.000Z'), startedAt, null);
      return finalizeProviderAttemptRecord(pending, {
        outcome: dispatch.expectedOutcome,
        sideEffectAccepted: dispatch.expectedOutcome === 'structured-tool',
      }, new Date(Date.parse(startedAt) + 5).toISOString());
    })
  );
};

const archive = (): ProviderRunArchive => ({
  schemaVersion: 'cp03-provider-raw-run/0.1',
  approval: approval(),
  preflight: {
    status: 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL',
    counts: {
      intended: plan.intendedProbes,
      eligible: plan.intendedProbes,
      excluded: 0,
      plannedDispatches: plan.plannedDispatches,
      sentDispatches: 0,
      maximumDispatches: plan.maximumDispatches,
    },
    selection: {
      deepseek: { route: 'deepseek-official', model: 'deepseek-v4-pro' },
      gemini: { route: 'google', model: 'gemini-3.5-flash' },
    },
    pricing: { estimate: { userCapUsd: 0.5 } },
    probes: { eligible: fixedProbeIds, excluded: [] },
  },
  result: {
    status: 'COMPLETED',
    completedProbes: plan.intendedProbes,
    sentDispatches: plan.plannedDispatches,
    attemptRecords: attemptRecords(),
  },
});

describe('provider run evidence verifier', () => {
  it('accepts a complete real-provider archive bound to the approved plan', () => {
    const report = verifyProviderRunEvidence(JSON.stringify(archive()), []);

    expect(report).toMatchObject({
      schemaVersion: 'cp03-provider-evidence-report/0.1',
      status: 'PASS',
      runId: approval().runId,
      counts: {
        expectedProbes: 8,
        coveredProbes: 8,
        plannedDispatches: 8,
        sentDispatches: 8,
        attemptRecords: 8,
      },
      checks: {
        archive: 'PASS',
        completion: 'PASS',
        dispatchLedger: 'PASS',
        probeCoverage: 'PASS',
        selection: 'PASS',
        providerKind: 'PASS',
        contracts: 'PASS',
        secretScan: 'PASS',
      },
      findings: [],
    });
  });

  it('rejects scripted evidence and model drift without rewriting the archive', () => {
    const original = archive();
    const first = original.result.attemptRecords[0];
    if (first === undefined) throw new Error('fixture record missing');
    const changed: ProviderRunArchive = {
      ...original,
      result: {
        ...original.result,
        attemptRecords: [{
          ...first,
          contract: {
            ...first.contract,
            providerKind: 'scripted',
            modelId: 'unapproved-model',
          },
        }, ...original.result.attemptRecords.slice(1)],
      },
    };

    const report = verifyProviderRunEvidence(JSON.stringify(changed), []);

    expect(report.status).toBe('FAIL');
    expect(report.checks.providerKind).toBe('FAIL');
    expect(report.checks.selection).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      {
        code: 'PROVIDER_KIND_NOT_REAL',
        path: 'result.attemptRecords[0].contract.providerKind',
      },
      {
        code: 'APPROVED_SELECTION_MISMATCH',
        path: 'result.attemptRecords[0].contract.modelId',
      },
    ]));
  });

  it('rejects missing probe evidence even when the completion summary claims success', () => {
    const original = archive();
    const changed: ProviderRunArchive = {
      ...original,
      result: {
        ...original.result,
        attemptRecords: original.result.attemptRecords.filter(
          (record) => record.probeId !== 'probe-08',
        ),
      },
    };

    const report = verifyProviderRunEvidence(JSON.stringify(changed), []);

    expect(report.status).toBe('FAIL');
    expect(report.checks.dispatchLedger).toBe('FAIL');
    expect(report.checks.probeCoverage).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      { code: 'ATTEMPT_COUNT_MISMATCH', path: 'result.attemptRecords' },
      { code: 'PROBE_EVIDENCE_MISSING', path: 'result.attemptRecords.probe-08' },
    ]));
  });

  it('detects a credential field and exact secret value without echoing the secret', () => {
    const secret = 'provider-secret-value-for-test';
    const changed = {
      ...archive(),
      diagnostics: { apiKey: secret },
    };

    const report = verifyProviderRunEvidence(JSON.stringify(changed), [secret]);

    expect(report.status).toBe('FAIL');
    expect(report.checks.secretScan).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      { code: 'SECRET_FIELD_PRESENT', path: 'diagnostics.apiKey' },
      { code: 'SECRET_VALUE_PRESENT', path: '$serialized' },
    ]));
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it('reports a malformed provider envelope instead of crashing the verifier', () => {
    const original = archive();
    const first = original.result.attemptRecords[0];
    if (first === undefined) throw new Error('fixture record missing');
    const malformed = {
      ...original,
      result: {
        ...original.result,
        attemptRecords: [{
          ...first,
          contract: { ...first.contract, toolCalls: null },
        }, ...original.result.attemptRecords.slice(1)],
      },
    };

    expect(() => verifyProviderRunEvidence(
      JSON.stringify(malformed),
      [],
    )).not.toThrow();
    const report = verifyProviderRunEvidence(JSON.stringify(malformed), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.contracts).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      {
        code: 'PROVIDER_ENVELOPE_INVALID',
        path: 'result.attemptRecords[0].contract',
      },
    ]));
  });
});
