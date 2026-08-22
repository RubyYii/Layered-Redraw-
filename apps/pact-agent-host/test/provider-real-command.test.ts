import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { executeProviderRealCommand } from '../src/provider-real-command.js';
import type { ProviderRealRunApproval } from '../src/provider-real-run-gate.js';

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
        return {
          status: 'COMPLETED' as const,
          completedProbes: 8,
          sentDispatches: 12,
          attemptRecords: [],
        };
      },
    });

    expect(result).toMatchObject({
      status: 'COMPLETED',
      completedProbes: 8,
      sentDispatches: 12,
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
