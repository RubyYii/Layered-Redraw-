import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { open, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import {
  authorizeModelBakeoff,
  type ModelBakeoffApproval,
} from '../src/model-bakeoff-gate.js';
import { createModelBakeoffPlan } from '../src/model-bakeoff-plan.js';
import {
  createModelBakeoffDshTransport,
  type ModelBakeoffDshDiagnostic,
} from '../src/model-bakeoff-dsh-transport.js';
import {
  createModelBakeoffPreflight,
  inspectInstalledModelBakeoffCandidateFacts,
  inspectModelBakeoffCredentialPresence,
  resolveModelBakeoffRunRoot,
  type ModelBakeoffKeychainReference,
  type ModelBakeoffKeychainReferenceManifest,
  type ModelBakeoffPreflight,
} from '../src/model-bakeoff-preflight.js';
import type {
  ModelBakeoffPricingManifest,
  ModelBakeoffRoleCapsManifest,
} from '../src/model-bakeoff-pricing.js';
import {
  runModelBakeoff,
  type ModelBakeoffRunResult,
} from '../src/model-bakeoff-runner.js';
import { mountCompatibilityProviderAdapters } from '../src/catalog-eligibility.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../../..');
const scriptPath = fileURLToPath(import.meta.url);
const CHILD_CAPABILITY_ENV = 'PACT_MODEL_BAKEOFF_CHILD_CAPABILITY';
const sha256 = (value: string): string => createHash('sha256')
  .update(value, 'utf8')
  .digest('hex');

const parseArguments = (arguments_: readonly string[]): ReadonlyMap<string, string> => {
  const parsed = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (!argument.startsWith('--')) throw new Error('MODEL_BAKEOFF_ARGUMENT_INVALID');
    const separator = argument.indexOf('=');
    const name = separator >= 0 ? argument.slice(2, separator) : argument.slice(2);
    const value = separator >= 0 ? argument.slice(separator + 1) : arguments_[index + 1];
    if (!name || !value || value.startsWith('--') || parsed.has(name)) {
      throw new Error('MODEL_BAKEOFF_ARGUMENT_INVALID');
    }
    parsed.set(name, value);
    if (separator < 0) index += 1;
  }
  return parsed;
};

const requireOnlyArguments = (
  arguments_: ReadonlyMap<string, string>,
  allowed: readonly string[],
): void => {
  if ([...arguments_.keys()].some((name) => !allowed.includes(name))) {
    throw new Error('MODEL_BAKEOFF_ARGUMENT_INVALID');
  }
};

const requireArgument = (arguments_: ReadonlyMap<string, string>, name: string): string => {
  const value = arguments_.get(name);
  if (!value) throw new Error(`MODEL_BAKEOFF_ARGUMENT_REQUIRED:${name}`);
  return value;
};

const resolveInputBelowRunRoot = (runRoot: string, inputPath: string): string => {
  const absolute = resolve(process.cwd(), inputPath);
  const fromRoot = relative(runRoot, absolute);
  if (!fromRoot || fromRoot.startsWith('..') || resolve(runRoot, fromRoot) !== absolute) {
    throw new Error('MODEL_BAKEOFF_INPUT_OUTSIDE_RUN_ROOT');
  }
  return absolute;
};

const readJson = async <T,>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;

const writeExclusiveCanonicalJson = async (path: string, value: unknown): Promise<void> => {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(`${canonicalJson(value)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error !== null
      && typeof error === 'object'
      && (error as { readonly code?: unknown }).code === 'ENOENT'
    ) return false;
    throw error;
  }
};

const exactRealInputs = async (
  preflightPath: string,
  approvalPath: string,
) => {
  const preflight = await readJson<ModelBakeoffPreflight>(preflightPath);
  const runRoot = resolveModelBakeoffRunRoot(repositoryRoot, preflight.runId);
  const expectedPreflight = resolve(runRoot, 'preflight.json');
  const expectedApproval = resolve(runRoot, 'approval.json');
  if (
    resolve(process.cwd(), preflightPath) !== expectedPreflight
    || resolve(process.cwd(), approvalPath) !== expectedApproval
  ) {
    throw new Error('MODEL_BAKEOFF_REAL_INPUT_PATH_MISMATCH');
  }
  const [approval, pricing, roleCaps, keychainReferences] = await Promise.all([
    readJson<ModelBakeoffApproval>(expectedApproval),
    readJson<ModelBakeoffPricingManifest>(
      resolve(runRoot, 'preflight-inputs', 'pricing-manifest.json'),
    ),
    readJson<ModelBakeoffRoleCapsManifest>(
      resolve(runRoot, 'preflight-inputs', 'role-caps.json'),
    ),
    readJson<ModelBakeoffKeychainReferenceManifest>(
      resolve(runRoot, 'preflight-inputs', 'keychain-references.json'),
    ),
  ]);
  return {
    runRoot,
    preflightPath: expectedPreflight,
    approvalPath: expectedApproval,
    preflight,
    approval,
    pricing,
    roleCaps,
    keychainReferences,
  } as const;
};

const authorizeExactRealInputs = (
  inputs: Awaited<ReturnType<typeof exactRealInputs>>,
  archiveState: { readonly resultExists: boolean; readonly pendingResultExists: boolean },
): void => {
  const fixtures = createModelBakeoffFixtures();
  const plan = createModelBakeoffPlan(fixtures.manifest);
  const authorization = authorizeModelBakeoff({
    approval: inputs.approval,
    preflight: inputs.preflight,
    plan,
    fixtures: fixtures.manifest,
    pricing: inputs.pricing,
    roleCaps: inputs.roleCaps,
    keychainReferences: inputs.keychainReferences,
    archiveState,
  });
  if (authorization.status !== 'AUTHORIZED') {
    throw new Error('MODEL_BAKEOFF_REAL_AUTHORIZATION_REFUSED');
  }
};

const readKeychainValue = (
  reference: ModelBakeoffKeychainReference,
): Promise<string> => new Promise((resolveValue, reject) => {
  const child = spawn('/usr/bin/security', [
    'find-generic-password',
    '-s',
    reference.keychainService,
    '-a',
    reference.keychainAccount,
    '-w',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  const chunks: Buffer[] = [];
  let byteLength = 0;
  child.stdout.on('data', (chunk: Buffer) => {
    byteLength += chunk.byteLength;
    if (byteLength > 16_384) {
      child.kill();
      reject(new Error('MODEL_BAKEOFF_KEYCHAIN_VALUE_INVALID'));
      return;
    }
    chunks.push(chunk);
  });
  child.once('error', () => reject(new Error('MODEL_BAKEOFF_KEYCHAIN_READ_FAILED')));
  child.once('exit', (code) => {
    const value = Buffer.concat(chunks).toString('utf8').trim();
    if (code !== 0 || value.length === 0 || value.includes('\0')) {
      reject(new Error('MODEL_BAKEOFF_KEYCHAIN_READ_FAILED'));
      return;
    }
    resolveValue(value);
  });
});

const childEnvironment = (
  values: ReadonlyMap<ModelBakeoffKeychainReference['envRef'], string>,
): NodeJS.ProcessEnv => {
  const environment = { ...process.env };
  delete environment.DEEPSEEK_API_KEY;
  delete environment.GEMINI_API_KEY;
  delete environment[CHILD_CAPABILITY_ENV];
  const deepseek = values.get('DEEPSEEK_API_KEY');
  const gemini = values.get('GEMINI_API_KEY');
  if (!deepseek || !gemini) throw new Error('MODEL_BAKEOFF_KEYCHAIN_VALUE_MISSING');
  environment.DEEPSEEK_API_KEY = deepseek;
  environment.GEMINI_API_KEY = gemini;
  return environment;
};

const runChildProcess = (
  inputs: Awaited<ReturnType<typeof exactRealInputs>>,
  environment: NodeJS.ProcessEnv,
  childCapability: string,
): Promise<void> => new Promise((resolveChild, reject) => {
  const child = spawn(process.execPath, [
    '--import',
    'tsx/esm',
    scriptPath,
    '--mode',
    'real-child',
    '--preflight',
    inputs.preflightPath,
    '--approval',
    inputs.approvalPath,
  ], {
    cwd: process.cwd(),
    env: { ...environment, [CHILD_CAPABILITY_ENV]: childCapability },
    stdio: 'inherit',
  });
  child.once('error', () => reject(new Error('MODEL_BAKEOFF_CHILD_START_FAILED')));
  child.once('exit', (code, signal) => {
    if (code === 0 && signal === null) resolveChild();
    else reject(new Error('MODEL_BAKEOFF_CHILD_FAILED'));
  });
});

const actualCostUsd = (
  pricing: ModelBakeoffPricingManifest,
  model: string,
  usage: { readonly inputTokens: number; readonly outputTokens: number },
): number => {
  const rate = pricing.rates[model];
  if (rate === undefined) throw new Error('MODEL_BAKEOFF_RATE_MISSING');
  return Number(((
    usage.inputTokens * rate.inputUsdPerMillionTokens
    + usage.outputTokens * rate.outputUsdPerMillionTokens
  ) / 1_000_000).toFixed(12));
};

const verifyPendingArchive = (input: {
  readonly result: ModelBakeoffRunResult;
  readonly diagnostics: readonly ModelBakeoffDshDiagnostic[];
  readonly secrets: readonly string[];
}): void => {
  if (
    input.result.counts.planned !== 28
    || input.result.counts.maximum !== 30
    || input.result.counts.sent > 30
    || input.result.cases.length !== 28
    || input.result.attempts.length !== input.result.counts.sent
    || input.result.transportDisposed !== true
    || input.diagnostics.length !== input.result.counts.sent
  ) throw new Error('MODEL_BAKEOFF_PENDING_ARCHIVE_INCOMPLETE');
  const serialized = canonicalJson({
    result: input.result,
    diagnostics: input.diagnostics,
  });
  if (input.secrets.some((secret) => secret.length > 0 && serialized.includes(secret))) {
    throw new Error('MODEL_BAKEOFF_SECRET_SCAN_FAILED');
  }
};

const runRealParent = async (
  arguments_: ReadonlyMap<string, string>,
): Promise<void> => {
  requireOnlyArguments(arguments_, ['mode', 'preflight', 'approval']);
  const inputs = await exactRealInputs(
    requireArgument(arguments_, 'preflight'),
    requireArgument(arguments_, 'approval'),
  );
  const resultRoot = resolve(inputs.runRoot, 'result');
  const pendingRoot = resolve(inputs.runRoot, 'pending-result');
  authorizeExactRealInputs(inputs, {
    resultExists: await exists(resultRoot),
    pendingResultExists: await exists(pendingRoot),
  });

  // This exclusive directory is the one-run claim. It is acquired after the
  // approval gate and before any Keychain value is read.
  await mkdir(pendingRoot, { recursive: false, mode: 0o700 });
  const childCapability = randomUUID();
  await writeExclusiveCanonicalJson(
    resolve(pendingRoot, 'child-capability.json'),
    { sha256: sha256(childCapability) },
  );
  const values = new Map<ModelBakeoffKeychainReference['envRef'], string>();
  for (const reference of inputs.keychainReferences.references) {
    values.set(reference.envRef, await readKeychainValue(reference));
  }
  await runChildProcess(inputs, childEnvironment(values), childCapability);
};

const runRealChild = async (
  arguments_: ReadonlyMap<string, string>,
): Promise<void> => {
  requireOnlyArguments(arguments_, ['mode', 'preflight', 'approval']);
  const inputs = await exactRealInputs(
    requireArgument(arguments_, 'preflight'),
    requireArgument(arguments_, 'approval'),
  );
  const pendingRoot = resolve(inputs.runRoot, 'pending-result');
  const resultRoot = resolve(inputs.runRoot, 'result');
  if (!await exists(pendingRoot) || await exists(resultRoot)) {
    throw new Error('MODEL_BAKEOFF_PENDING_ARCHIVE_INVALID');
  }
  const childCapability = process.env[CHILD_CAPABILITY_ENV];
  delete process.env[CHILD_CAPABILITY_ENV];
  const capabilityRecord = await readJson<{ readonly sha256: string }>(
    resolve(pendingRoot, 'child-capability.json'),
  );
  if (
    !childCapability
    || capabilityRecord.sha256 !== sha256(childCapability)
  ) throw new Error('MODEL_BAKEOFF_CHILD_CAPABILITY_INVALID');
  // The parent already owns the pending directory; all other approval bindings
  // are revalidated in the child immediately before mounting provider adapters.
  authorizeExactRealInputs(inputs, {
    resultExists: false,
    pendingResultExists: false,
  });
  const deepseekSecret = process.env.DEEPSEEK_API_KEY;
  const geminiSecret = process.env.GEMINI_API_KEY;
  if (!deepseekSecret || !geminiSecret) {
    throw new Error('MODEL_BAKEOFF_CHILD_CREDENTIAL_MISSING');
  }
  const fixtures = createModelBakeoffFixtures();
  const plan = createModelBakeoffPlan(fixtures.manifest);
  const persistenceRoot = resolve(pendingRoot, 'sessions');
  const dshHome = resolve(pendingRoot, 'dsh-home');
  await mkdir(persistenceRoot, { recursive: false, mode: 0o700 });
  await mkdir(dshHome, { recursive: false, mode: 0o700 });
  const forbidden = [
    deepseekSecret,
    geminiSecret,
    childCapability,
    repositoryRoot,
    inputs.runRoot,
    pendingRoot,
    persistenceRoot,
    dshHome,
  ];
  const transport = await createModelBakeoffDshTransport({
    fixtures,
    persistenceRoot,
    dshHome,
    providerKind: 'real',
    forbiddenSubstrings: forbidden,
    roleCaps: inputs.roleCaps.caps,
    mountAdapters: (ctx) => mountCompatibilityProviderAdapters(ctx, {
      geminiRoute: 'google',
    }),
    estimateCostUsd: (entry, usage) => actualCostUsd(
      inputs.pricing,
      entry.model,
      usage,
    ),
  });
  const result = await runModelBakeoff({
    approval: inputs.approval,
    preflight: inputs.preflight,
    plan,
    transport,
  });
  const diagnostics = transport.diagnostics();
  await writeExclusiveCanonicalJson(resolve(pendingRoot, 'result.json'), result);
  await writeExclusiveCanonicalJson(
    resolve(pendingRoot, 'dsh-diagnostics.json'),
    diagnostics,
  );
  verifyPendingArchive({
    result,
    diagnostics,
    secrets: [deepseekSecret, geminiSecret],
  });
  await writeExclusiveCanonicalJson(resolve(pendingRoot, 'archive-manifest.json'), {
    schemaVersion: 'cp03-model-bakeoff-archive/0.1',
    runId: inputs.preflight.runId,
    approvalId: inputs.approval.approvalId,
    status: result.status,
    providerRequestsMade: result.providerRequestsMade,
    counts: result.counts,
    evidenceVerifiedBeforePublish: true,
    fullCouncilTimingProven: false,
  });
  await rename(pendingRoot, resultRoot);
  process.stdout.write(`${canonicalJson({
    status: result.status,
    runId: inputs.preflight.runId,
    counts: result.counts,
    providerRequestsMade: result.providerRequestsMade,
    estimatedCostUsd: result.estimatedCostUsd,
  })}\n`);
};

const runPreflight = async (
  arguments_: ReadonlyMap<string, string>,
): Promise<void> => {
  requireOnlyArguments(arguments_, [
    'mode',
    'run-id',
    'pricing-manifest',
    'role-caps',
    'keychain-references',
  ]);
  const runId = requireArgument(arguments_, 'run-id');
  const runRoot = resolveModelBakeoffRunRoot(repositoryRoot, runId);
  const pricingPath = resolveInputBelowRunRoot(
    runRoot,
    requireArgument(arguments_, 'pricing-manifest'),
  );
  const roleCapsPath = resolveInputBelowRunRoot(
    runRoot,
    requireArgument(arguments_, 'role-caps'),
  );
  const keychainReferencesPath = resolveInputBelowRunRoot(
    runRoot,
    requireArgument(arguments_, 'keychain-references'),
  );

  const [pricing, roleCaps, keychainReferences, candidateFacts] = await Promise.all([
    readJson<ModelBakeoffPricingManifest>(pricingPath),
    readJson<ModelBakeoffRoleCapsManifest>(roleCapsPath),
    readJson<ModelBakeoffKeychainReferenceManifest>(keychainReferencesPath),
    inspectInstalledModelBakeoffCandidateFacts(),
  ]);
  const credentialPresence = await inspectModelBakeoffCredentialPresence(keychainReferences);
  const fixtures = createModelBakeoffFixtures();
  const plan = createModelBakeoffPlan(fixtures.manifest);
  const preflight = createModelBakeoffPreflight({
    runId,
    plan,
    fixtures: fixtures.manifest,
    pricing,
    roleCaps,
    keychainReferences,
    credentialPresence,
    candidateFacts,
  });

  await writeExclusiveCanonicalJson(resolve(runRoot, 'preflight.json'), preflight);
  process.stdout.write(`${canonicalJson(preflight)}\n`);
  if (preflight.status !== 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL') process.exitCode = 2;
};

const main = async (): Promise<void> => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const mode = arguments_.get('mode') ?? 'preflight';
  if (mode === 'preflight') return runPreflight(arguments_);
  if (mode === 'real') return runRealParent(arguments_);
  if (mode === 'real-child') return runRealChild(arguments_);
  throw new Error('MODEL_BAKEOFF_MODE_INVALID');
};

main().catch(() => {
  process.stderr.write('Model bakeoff command could not complete safely.\n');
  process.exitCode = 1;
});
