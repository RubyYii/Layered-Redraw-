import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import {
  createModelBakeoffRepairGateReport,
  MODEL_BAKEOFF_REPAIR_TEST_FILES,
  type ModelBakeoffRepairAssertionResult,
  type ModelBakeoffRepairGateReport,
} from '../src/model-bakeoff-repair-gate.js';

interface CliArguments {
  readonly mode: 'local-scripted';
  readonly output: string;
}

interface VitestJsonAssertion {
  readonly title?: unknown;
  readonly status?: unknown;
}

interface VitestJsonTestResult {
  readonly name?: unknown;
  readonly assertionResults?: unknown;
}

interface VitestJsonReport {
  readonly testResults?: unknown;
}

const zeroCounters = Object.freeze({
  providerRequestsMade: 0,
  keychainReads: 0,
  externalNetworkRequests: 0,
  preflightsCreated: 0,
  runsStarted: 0,
} as const);

const forbiddenArguments = new Set([
  '--approval',
  '--credential',
  '--keychain',
  '--preflight',
  '--provider',
  '--run-id',
  '--run-root',
]);

function fail(code: string): never {
  throw new Error(code);
}

function parseArguments(argv: readonly string[]): CliArguments {
  let mode: string | undefined;
  let output: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_ARGUMENT_UNKNOWN');
    }
    if (forbiddenArguments.has(argument)) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_EXTERNAL_ARGUMENT_FORBIDDEN');
    }
    if (argument !== '--mode' && argument !== '--output') {
      fail('MODEL_BAKEOFF_REPAIR_GATE_ARGUMENT_UNKNOWN');
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_ARGUMENT_VALUE_MISSING');
    }
    if (argument === '--mode') {
      if (mode !== undefined) {
        fail('MODEL_BAKEOFF_REPAIR_GATE_ARGUMENT_DUPLICATE');
      }
      mode = value;
    } else {
      if (output !== undefined) {
        fail('MODEL_BAKEOFF_REPAIR_GATE_ARGUMENT_DUPLICATE');
      }
      output = value;
    }
    index += 1;
  }

  if (mode !== 'local-scripted') {
    fail('MODEL_BAKEOFF_REPAIR_GATE_MODE_INVALID');
  }
  if (output === undefined || output.length === 0) {
    fail('MODEL_BAKEOFF_REPAIR_GATE_OUTPUT_REQUIRED');
  }
  return { mode: 'local-scripted', output };
}

const normalizedSegments = (path: string): readonly string[] =>
  resolve(path).split(sep).filter((segment) => segment.length > 0);

function assertOutputAllowed(output: string): string {
  const absoluteOutput = resolve(output);
  const segments = normalizedSegments(absoluteOutput);
  for (let index = 0; index <= segments.length - 3; index += 1) {
    if (
      segments[index] === 'checkpoints'
      && segments[index + 1] === 'cp03'
      && segments[index + 2] === 'model-bakeoff'
    ) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_HISTORICAL_ROOT_FORBIDDEN');
    }
  }
  return absoluteOutput;
}

const guardSource = String.raw`'use strict';
const childProcess = require('node:child_process');
const originalFetch = globalThis.fetch;
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);
if (typeof originalFetch === 'function') {
  globalThis.fetch = async function guardedFetch(input, init) {
    const candidate = input instanceof Request ? input.url : String(input);
    const target = new URL(candidate);
    if (!loopbackHosts.has(target.hostname)) {
      throw new Error('MODEL_BAKEOFF_REPAIR_EXTERNAL_NETWORK_BLOCKED');
    }
    return originalFetch(input, init);
  };
}
const isSecurity = (command) => {
  const value = String(command);
  return value === '/usr/bin/security' || value.split('/').pop() === 'security';
};
for (const method of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = childProcess[method];
  childProcess[method] = function guardedChildProcess(command, ...args) {
    if (isSecurity(command)) {
      throw new Error('MODEL_BAKEOFF_REPAIR_KEYCHAIN_ACCESS_BLOCKED');
    }
    return original.call(this, command, ...args);
  };
}
`;

function parseVitestAssertions(raw: string): readonly ModelBakeoffRepairAssertionResult[] {
  const parsed = JSON.parse(raw) as VitestJsonReport;
  const testResults = parsed.testResults;
  if (!Array.isArray(testResults)) {
    fail('MODEL_BAKEOFF_REPAIR_GATE_VITEST_REPORT_INVALID');
  }
  const assertions: ModelBakeoffRepairAssertionResult[] = [];
  for (const rawResult of testResults) {
    const result = rawResult as VitestJsonTestResult;
    const resultName = result.name;
    const assertionResults = result.assertionResults;
    if (typeof resultName !== 'string' || !Array.isArray(assertionResults)) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_VITEST_RESULT_INVALID');
    }
    const file = `test/${basename(resultName)}`;
    for (const rawAssertion of assertionResults) {
      const assertion = rawAssertion as VitestJsonAssertion;
      const title = assertion.title;
      const status = assertion.status;
      if (typeof title !== 'string' || typeof status !== 'string') {
        fail('MODEL_BAKEOFF_REPAIR_GATE_VITEST_ASSERTION_INVALID');
      }
      assertions.push({
        file,
        title,
        status: status === 'passed' ? 'passed' : 'failed',
      });
    }
  }
  return assertions;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeReportFailClosed(
  output: string,
  report: ModelBakeoffRepairGateReport,
): Promise<void> {
  if (await fileExists(output)) {
    let existing: unknown;
    try {
      existing = JSON.parse(await readFile(output, 'utf8'));
    } catch {
      fail('MODEL_BAKEOFF_REPAIR_GATE_OUTPUT_EXISTS_DIFFERENT');
    }
    if (canonicalJson(existing) !== canonicalJson(report)) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_OUTPUT_EXISTS_DIFFERENT');
    }
    return;
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

function appendNodeRequire(current: string | undefined, guardPath: string): string {
  const option = `--require=${JSON.stringify(guardPath)}`;
  return current === undefined || current.length === 0 ? option : `${current} ${option}`;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const output = assertOutputAllowed(args.output);
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const outputRoot = dirname(output);
  const nonce = `${process.pid}`;
  const guardPath = `${output}.${nonce}.guard.cjs`;
  const vitestReportPath = `${output}.${nonce}.vitest.json`;
  const vitestEntry = join(packageRoot, 'node_modules', 'vitest', 'vitest.mjs');

  if (!isAbsolute(output) || relative(outputRoot, output).startsWith('..')) {
    fail('MODEL_BAKEOFF_REPAIR_GATE_OUTPUT_INVALID');
  }
  await mkdir(outputRoot, { recursive: true });

  try {
    await writeFile(guardPath, guardSource, { encoding: 'utf8', flag: 'wx' });
    const execution = spawnSync(process.execPath, [
      vitestEntry,
      'run',
      ...MODEL_BAKEOFF_REPAIR_TEST_FILES,
      '--reporter=json',
      `--outputFile=${vitestReportPath}`,
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: appendNodeRequire(process.env.NODE_OPTIONS, guardPath),
      },
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (execution.error !== undefined || execution.status === null) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_TEST_PROCESS_FAILED');
    }
    if (!await fileExists(vitestReportPath)) {
      fail('MODEL_BAKEOFF_REPAIR_GATE_VITEST_REPORT_MISSING');
    }
    const assertions = parseVitestAssertions(await readFile(vitestReportPath, 'utf8'));
    const report = createModelBakeoffRepairGateReport({
      mode: args.mode,
      assertions,
      counters: zeroCounters,
    });
    await writeReportFailClosed(output, report);
    if (execution.status !== 0 || report.status !== 'PASS') {
      fail('MODEL_BAKEOFF_REPAIR_GATE_FAILED');
    }
    process.stdout.write(`reportPath=${output}\nreportSha256=${report.repairGateSha256}\n`);
  } finally {
    await Promise.all([guardPath, vitestReportPath].map(async (path) => {
      try {
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }));
  }
}

await main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : 'MODEL_BAKEOFF_REPAIR_GATE_UNKNOWN_ERROR';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
