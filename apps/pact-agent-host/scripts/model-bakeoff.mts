import { open, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import { createModelBakeoffPlan } from '../src/model-bakeoff-plan.js';
import {
  createModelBakeoffPreflight,
  inspectInstalledModelBakeoffCandidateFacts,
  inspectModelBakeoffCredentialPresence,
  resolveModelBakeoffRunRoot,
  type ModelBakeoffKeychainReferenceManifest,
} from '../src/model-bakeoff-preflight.js';
import type {
  ModelBakeoffPricingManifest,
  ModelBakeoffRoleCapsManifest,
} from '../src/model-bakeoff-pricing.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '../../..');

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

const main = async (): Promise<void> => {
  const arguments_ = parseArguments(process.argv.slice(2));
  requireOnlyArguments(arguments_, [
    'mode',
    'run-id',
    'pricing-manifest',
    'role-caps',
    'keychain-references',
  ]);
  const mode = arguments_.get('mode') ?? 'preflight';
  if (mode === 'real') throw new Error('MODEL_BAKEOFF_REAL_MODE_NOT_IMPLEMENTED');
  if (mode !== 'preflight') throw new Error('MODEL_BAKEOFF_MODE_INVALID');

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

main().catch(() => {
  process.stderr.write('Model bakeoff preflight could not complete safely.\n');
  process.exitCode = 1;
});
