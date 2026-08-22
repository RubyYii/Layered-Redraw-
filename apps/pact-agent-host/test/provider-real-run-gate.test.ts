import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  executeAuthorizedProviderRun,
  type ProviderRealRunApproval,
} from '../src/provider-real-run-gate.js';

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

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const approval = (): ProviderRealRunApproval => ({
  schemaVersion: 'cp03-provider-real-approval/0.1',
  approvalId: 'approval_cp03_provider_gate_20260822',
  approvedAt: '2026-08-22T15:00:00.000Z',
  runId: 'compat_20260822T150000Z_a1b2c3',
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
    plannedDispatches: 12,
    sentDispatches: 0,
    maximumDispatches: 14,
  },
  selection: {
    deepseek: {
      route: 'deepseek-official',
      model: 'deepseek-v4-pro',
    },
    gemini: { route: 'google', model: 'gemini-3.5-flash' },
  },
  pricing: { estimate: { userCapUsd: 0.5 } },
  probes: { eligible: fixedProbeIds, excluded: [] },
});

describe('real provider authorization gate', () => {
  it('refuses an ineligible preflight before invoking provider transport', async () => {
    let transportInvocations = 0;

    const result = await executeAuthorizedProviderRun({
      preflight: {
        status: 'NOT_ELIGIBLE',
        counts: {
          intended: 8,
          eligible: 0,
          excluded: 8,
          plannedDispatches: 12,
          sentDispatches: 0,
          maximumDispatches: 14,
        },
        selection: {
          deepseek: { route: 'deepseek-official', model: null },
          gemini: { route: null, model: null },
        },
        pricing: { estimate: null },
        probes: { eligible: [], excluded: fixedProbeIds },
      },
      approval: approval(),
      execute: async () => {
        transportInvocations += 1;
        return { completedProbes: 8, sentDispatches: 12 };
      },
    });

    expect(result).toEqual({
      status: 'REFUSED',
      code: 'PROVIDER_PREFLIGHT_NOT_ELIGIBLE',
      providerRequestsMade: 0,
      counts: {
        intended: 8,
        eligible: 0,
        excluded: 8,
        plannedDispatches: 12,
        sentDispatches: 0,
        maximumDispatches: 14,
      },
    });
    expect(transportInvocations).toBe(0);
  });

  it('refuses when the approval does not cover the exact eight-probe scope', async () => {
    let transportInvocations = 0;
    const narrowedApproval = {
      ...approval(),
      probeIds: fixedProbeIds.slice(0, 7),
    };

    const result = await executeAuthorizedProviderRun({
      preflight: eligiblePreflight(),
      approval: narrowedApproval,
      execute: async () => {
        transportInvocations += 1;
        return { completedProbes: 8, sentDispatches: 12 };
      },
    });

    expect(result).toEqual({
      status: 'REFUSED',
      code: 'PROVIDER_APPROVAL_SCOPE_MISMATCH',
      mismatches: ['probeIds'],
      providerRequestsMade: 0,
    });
    expect(transportInvocations).toBe(0);
  });

  it.each([
    {
      label: 'planned dispatch count',
      mismatch: 'plannedDispatches',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        plannedDispatches: 11,
      }),
    },
    {
      label: 'maximum dispatch count',
      mismatch: 'maximumDispatches',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        maximumDispatches: 15,
      }),
    },
    {
      label: 'model selection',
      mismatch: 'selection.gemini.model',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        selection: {
          ...base.selection,
          gemini: {
            ...base.selection.gemini,
            model: 'gemini-unapproved-preview',
          },
        },
      }),
    },
    {
      label: 'monetary cap',
      mismatch: 'maxUsd',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        maxUsd: 0.75,
      }),
    },
    {
      label: 'input classes',
      mismatch: 'inputClasses',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        inputClasses: [
          'synthetic_checkerboard',
          'fictional_text',
        ] as unknown as ProviderRealRunApproval['inputClasses'],
      }),
    },
  ])('refuses approval drift in $label before provider transport', async ({
    mismatch,
    mutate,
  }) => {
    let transportInvocations = 0;
    const result = await executeAuthorizedProviderRun({
      preflight: eligiblePreflight(),
      approval: mutate(approval()),
      execute: async () => {
        transportInvocations += 1;
        return { completedProbes: 8, sentDispatches: 12 };
      },
    });

    expect(result).toEqual({
      status: 'REFUSED',
      code: 'PROVIDER_APPROVAL_SCOPE_MISMATCH',
      mismatches: [mismatch],
      providerRequestsMade: 0,
    });
    expect(transportInvocations).toBe(0);
  });

  it('refuses an internally inconsistent eligible preflight ledger', async () => {
    let transportInvocations = 0;
    const inconsistent = eligiblePreflight();
    const result = await executeAuthorizedProviderRun({
      preflight: {
        ...inconsistent,
        counts: {
          ...inconsistent.counts,
          eligible: 7,
          excluded: 1,
        },
        probes: {
          eligible: fixedProbeIds.slice(0, 7),
          excluded: ['probe-08'],
        },
      },
      approval: approval(),
      execute: async () => {
        transportInvocations += 1;
        return { completedProbes: 8, sentDispatches: 12 };
      },
    });

    expect(result).toEqual({
      status: 'REFUSED',
      code: 'PROVIDER_PREFLIGHT_PLAN_MISMATCH',
      mismatches: ['counts.eligible', 'counts.excluded', 'probes.eligible'],
      providerRequestsMade: 0,
    });
    expect(transportInvocations).toBe(0);
  });

  it.each([
    {
      label: 'path-like run id',
      invalid: 'runId',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        runId: '../outside-artifacts',
      }),
    },
    {
      label: 'blank approval id',
      invalid: 'approvalId',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        approvalId: '   ',
      }),
    },
    {
      label: 'invalid approval timestamp',
      invalid: 'approvedAt',
      mutate: (base: ProviderRealRunApproval): ProviderRealRunApproval => ({
        ...base,
        approvedAt: 'not-a-timestamp',
      }),
    },
  ])('refuses an approval record with $label', async ({ invalid, mutate }) => {
    let transportInvocations = 0;
    const result = await executeAuthorizedProviderRun({
      preflight: eligiblePreflight(),
      approval: mutate(approval()),
      execute: async () => {
        transportInvocations += 1;
        return { completedProbes: 8, sentDispatches: 12 };
      },
    });

    expect(result).toEqual({
      status: 'REFUSED',
      code: 'PROVIDER_APPROVAL_RECORD_INVALID',
      invalid: [invalid],
      providerRequestsMade: 0,
    });
    expect(transportInvocations).toBe(0);
  });

  it('runs real mode through preflight and refuses 0/8 before transport', () => {
    const child = spawnSync(process.execPath, [
      '--import',
      'tsx/esm',
      'scripts/provider-compatibility.mts',
      '--mode',
      'real',
      '--run-id',
      'compat_cli_ineligible',
      '--approval-id',
      'approval_cli_ineligible',
      '--approved-at',
      '2026-08-22T15:00:00.000Z',
      '--approved-max-usd',
      '0.50',
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
        TMPDIR: process.env.TMPDIR ?? '/tmp',
        PACT_DEEPSEEK_MODEL: '',
        PACT_GEMINI_ROUTE: '',
        PACT_GEMINI_MODEL: '',
        PACT_COMPAT_MAX_USD: '',
        DEEPSEEK_API_KEY: '',
        GEMINI_API_KEY: '',
      },
    });

    expect(child.status).toBe(2);
    expect(child.stderr).toBe('');
    expect(JSON.parse(child.stdout)).toMatchObject({
      status: 'REFUSED',
      code: 'PROVIDER_PREFLIGHT_NOT_ELIGIBLE',
      providerRequestsMade: 0,
      counts: {
        intended: 8,
        eligible: 0,
        excluded: 8,
        plannedDispatches: 12,
        sentDispatches: 0,
        maximumDispatches: 14,
      },
    });
  });
});
