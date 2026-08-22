import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createProviderAttemptRecord,
  finalizeProviderAttemptRecord,
} from '../src/provider-envelope.js';
import { executeProviderRealCommand } from '../src/provider-real-command.js';
import { ProviderRunEvidenceError } from '../src/provider-run-evidence.js';
import type { ProviderRealRunApproval } from '../src/provider-real-run-gate.js';
import {
  COMPATIBILITY_PROBES,
  probePlanSummary,
} from '../src/probe-plan.js';

const fixedProbeIds = [
  'probe-01',
  'probe-02',
  'probe-03',
  'probe-04',
  'probe-05',
  'probe-06',
  'probe-07',
  'probe-08',
] as const;

const approval = (): ProviderRealRunApproval => ({
  schemaVersion: 'cp03-provider-real-approval/0.1',
  approvalId: 'approval_cp03_command_20260822',
  approvedAt: '2026-08-22T18:00:00.000Z',
  runId: 'compat_command_20260822_a1b2c3',
  probeIds: fixedProbeIds,
  plannedDispatches: 12,
  maximumDispatches: 14,
  maxUsd: 0.5,
  selection: {
    deepseek: { route: 'deepseek-official', model: 'deepseek-v4-pro' },
    gemini: { route: 'google', model: 'gemini-3.5-flash' },
  },
  inputClasses: ['fictional_text', 'synthetic_checkerboard'],
});

const eligiblePreflight = () => ({
  status: 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL' as const,
  counts: {
    intended: 8,
    eligible: 8,
    excluded: 0,
    completed: 0,
    plannedDispatches: 12,
    sentDispatches: 0,
    maximumDispatches: 14,
  },
  selection: {
    deepseek: { route: 'deepseek-official', model: 'deepseek-v4-pro' },
    gemini: { route: 'google', model: 'gemini-3.5-flash' },
  },
  pricing: { estimate: { userCapUsd: 0.5 } },
  probes: { eligible: fixedProbeIds, excluded: [] },
});

const completeEnv = (): NodeJS.ProcessEnv => ({
  PACT_DEEPSEEK_MODEL: 'deepseek-v4-pro',
  PACT_GEMINI_ROUTE: 'google',
  PACT_GEMINI_MODEL: 'gemini-3.5-flash',
  PACT_COMPAT_MAX_USD: '0.50',
  DEEPSEEK_API_KEY: 'test-only-not-forwarded-by-command',
  GEMINI_API_KEY: 'test-only-not-forwarded-by-command',
});

const completedResult = () => {
  let sentOrdinal = 0;
  const records = COMPATIBILITY_PROBES.flatMap((probe) =>
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
  const compatibilityPlan = probePlanSummary(COMPATIBILITY_PROBES);
  return {
    status: 'COMPLETED' as const,
    completedProbes: compatibilityPlan.intendedProbes,
    sentDispatches: compatibilityPlan.plannedDispatches,
    attemptRecords: records,
  };
};

describe('authorised real-provider command boundary', () => {
  it('creates the isolated run directory only after approval and persists the raw result', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pact-real-command-'));
    const calls: unknown[] = [];
    const result = await executeProviderRealCommand({
      cwd,
      env: completeEnv(),
      preflight: eligiblePreflight(),
      approval: approval(),
      executeReal: async (options) => {
        calls.push(options);
        return completedResult();
      },
    });

    expect(result).toMatchObject({
      status: 'COMPLETED',
      completedProbes: 8,
      sentDispatches: 12,
      evidence: { status: 'PASS', runId: approval().runId },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      runId: 'compat_command_20260822_a1b2c3',
      cancellationDelayMs: 11_750,
      persistenceRoot: join(
        cwd,
        'artifacts/provider-compatibility/compat_command_20260822_a1b2c3/sessions',
      ),
      dshHome: join(
        cwd,
        'artifacts/provider-compatibility/compat_command_20260822_a1b2c3/dsh',
      ),
    });
    const rawPath = join(
      cwd,
      'artifacts/provider-compatibility/compat_command_20260822_a1b2c3/raw-run.json',
    );
    const raw = readFileSync(rawPath, 'utf8');
    expect(JSON.parse(raw)).toMatchObject({
      schemaVersion: 'cp03-provider-raw-run/0.1',
      approval: { approvalId: 'approval_cp03_command_20260822' },
      result: { status: 'COMPLETED', sentDispatches: 12 },
    });
    expect(raw).not.toContain('test-only-not-forwarded-by-command');
    const evidencePath = join(
      cwd,
      'artifacts/provider-compatibility/compat_command_20260822_a1b2c3/evidence-report.json',
    );
    expect(JSON.parse(readFileSync(evidencePath, 'utf8'))).toMatchObject({
      schemaVersion: 'cp03-provider-evidence-report/0.1',
      status: 'PASS',
      checks: { secretScan: 'PASS', probeCoverage: 'PASS' },
    });
  });

  it('blocks a secret-bearing raw archive while retaining only a redacted failure report', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pact-real-command-leak-'));
    const secret = completeEnv().DEEPSEEK_API_KEY;
    if (secret === undefined) throw new Error('test secret missing');

    await expect(executeProviderRealCommand({
      cwd,
      env: completeEnv(),
      preflight: eligiblePreflight(),
      approval: approval(),
      executeReal: async () => Object.assign(completedResult(), {
        diagnostics: { apiKey: secret },
      }),
    })).rejects.toMatchObject({
      name: ProviderRunEvidenceError.name,
      code: 'PROVIDER_RUN_SECRET_LEAK_BLOCKED',
      report: {
        status: 'FAIL',
        checks: { secretScan: 'FAIL' },
      },
    });

    const runRoot = join(
      cwd,
      'artifacts/provider-compatibility/compat_command_20260822_a1b2c3',
    );
    expect(existsSync(join(runRoot, 'raw-run.json'))).toBe(false);
    const report = readFileSync(join(runRoot, 'evidence-report.json'), 'utf8');
    expect(report).not.toContain(secret);
    expect(JSON.parse(report)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining([
        { code: 'SECRET_FIELD_PRESENT', path: 'result.diagnostics.apiKey' },
        { code: 'SECRET_VALUE_PRESENT', path: '$serialized' },
      ]),
    });
  });

  it('retains a non-secret invalid archive with a failing evidence report', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pact-real-command-invalid-'));
    const incomplete = completedResult();

    await expect(executeProviderRealCommand({
      cwd,
      env: completeEnv(),
      preflight: eligiblePreflight(),
      approval: approval(),
      executeReal: async () => ({
        ...incomplete,
        attemptRecords: incomplete.attemptRecords.filter(
          (record) => record.probeId !== 'probe-08',
        ),
      }),
    })).rejects.toMatchObject({
      name: ProviderRunEvidenceError.name,
      code: 'PROVIDER_RUN_EVIDENCE_INVALID',
      report: {
        status: 'FAIL',
        checks: { secretScan: 'PASS', probeCoverage: 'FAIL' },
      },
    });

    const runRoot = join(
      cwd,
      'artifacts/provider-compatibility/compat_command_20260822_a1b2c3',
    );
    expect(existsSync(join(runRoot, 'raw-run.json'))).toBe(true);
    expect(JSON.parse(readFileSync(
      join(runRoot, 'evidence-report.json'),
      'utf8',
    ))).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining([
        expect.objectContaining({ code: 'PROBE_EVIDENCE_MISSING' }),
      ]),
    });
  });

  it('refuses an ineligible preflight without creating a run directory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pact-real-command-refused-'));
    let calls = 0;
    const result = await executeProviderRealCommand({
      cwd,
      env: {},
      preflight: {
        ...eligiblePreflight(),
        status: 'NOT_ELIGIBLE',
        counts: {
          ...eligiblePreflight().counts,
          eligible: 0,
          excluded: 8,
        },
        probes: { eligible: [], excluded: fixedProbeIds },
      },
      approval: approval(),
      executeReal: async () => {
        calls += 1;
        throw new Error('must not execute');
      },
    });

    expect(result).toMatchObject({
      status: 'REFUSED',
      code: 'PROVIDER_PREFLIGHT_NOT_ELIGIBLE',
      providerRequestsMade: 0,
    });
    expect(calls).toBe(0);
    expect(existsSync(join(cwd, 'artifacts'))).toBe(false);
  });
});
