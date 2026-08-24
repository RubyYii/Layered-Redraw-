import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import {
  createModelBakeoffRepairGateReport,
  MODEL_BAKEOFF_REPAIR_CHECKS,
} from '../src/model-bakeoff-repair-gate.js';

const zeroCounters = {
  providerRequestsMade: 0,
  keychainReads: 0,
  externalNetworkRequests: 0,
  preflightsCreated: 0,
  runsStarted: 0,
} as const;

const passingAssertions = () => MODEL_BAKEOFF_REPAIR_CHECKS.flatMap(({ evidence }) =>
  evidence.map(({ file, title }) => ({ file, title, status: 'passed' as const }))
);

const canonicalHash = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

describe('CP03 Stage B replacement repair gate', () => {
  it('hashes all 16 named local checks and five zero counters deterministically', () => {
    const first = createModelBakeoffRepairGateReport({
      mode: 'local-scripted',
      assertions: passingAssertions(),
      counters: zeroCounters,
    });
    const second = createModelBakeoffRepairGateReport({
      mode: 'local-scripted',
      assertions: passingAssertions().reverse(),
      counters: zeroCounters,
    });
    const { repairGateSha256, ...unsigned } = first;

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaVersion: 'cp03-stage-b-replacement-repair-gate/0.1',
      status: 'PASS',
      ...zeroCounters,
      providerCompatibilityProven: false,
    });
    expect(first.checks).toHaveLength(16);
    expect(first.checks.every(({ status }) => status === 'PASS')).toBe(true);
    expect(repairGateSha256).toBe(canonicalHash(unsigned));
  });

  it('fails closed on a missing assertion or any nonzero external-side-effect counter', () => {
    const assertions = passingAssertions();
    assertions.pop();
    const missing = createModelBakeoffRepairGateReport({
      mode: 'local-scripted',
      assertions,
      counters: zeroCounters,
    });
    const external = createModelBakeoffRepairGateReport({
      mode: 'local-scripted',
      assertions: passingAssertions(),
      counters: { ...zeroCounters, externalNetworkRequests: 1 },
    });

    expect(missing.status).toBe('FAIL');
    expect(missing.checks.some(({ status }) => status === 'FAIL')).toBe(true);
    expect(external.status).toBe('FAIL');
    expect(external.externalNetworkRequests).toBe(1);
  });

  it('executes the CLI into only the explicit temporary destination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cp03-repair-gate-'));
    const output = join(root, 'repair-gate-report.json');
    const script = fileURLToPath(new URL('../scripts/model-bakeoff-repair-gate.mts', import.meta.url));
    const execution = spawnSync(process.execPath, [
      '--import',
      'tsx/esm',
      script,
      '--mode',
      'local-scripted',
      '--output',
      output,
    ], {
      cwd: dirname(dirname(script)),
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(execution.status, execution.stderr).toBe(0);
    const report = JSON.parse(await readFile(output, 'utf8'));
    expect(report).toMatchObject({ status: 'PASS', ...zeroCounters });
    expect(await readdir(root)).toEqual(['repair-gate-report.json']);
    expect(execution.stdout).not.toMatch(/api.?key|bearer|prompt/i);
  }, 30_000);

  it('rejects provider and run arguments before creating output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cp03-repair-gate-reject-'));
    const output = join(root, 'repair-gate-report.json');
    const script = fileURLToPath(new URL('../scripts/model-bakeoff-repair-gate.mts', import.meta.url));
    const execution = spawnSync(process.execPath, [
      '--import',
      'tsx/esm',
      script,
      '--mode',
      'local-scripted',
      '--output',
      output,
      '--provider',
      'google',
      '--run-id',
      'forbidden',
    ], {
      cwd: dirname(dirname(script)),
      encoding: 'utf8',
      timeout: 5_000,
    });

    expect(execution.status).not.toBe(0);
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects an existing report that only copies the expected hash', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cp03-repair-gate-spoof-'));
    const output = join(root, 'repair-gate-report.json');
    const script = fileURLToPath(new URL('../scripts/model-bakeoff-repair-gate.mts', import.meta.url));
    const expected = createModelBakeoffRepairGateReport({
      mode: 'local-scripted',
      assertions: passingAssertions(),
      counters: zeroCounters,
    });
    const spoof = { repairGateSha256: expected.repairGateSha256 };
    await writeFile(output, JSON.stringify(spoof), 'utf8');

    const execution = spawnSync(process.execPath, [
      '--import',
      'tsx/esm',
      script,
      '--mode',
      'local-scripted',
      '--output',
      output,
    ], {
      cwd: dirname(dirname(script)),
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(execution.status).not.toBe(0);
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(spoof);
  }, 30_000);
});
