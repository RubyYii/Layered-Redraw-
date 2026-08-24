import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import {
  createModelBakeoffFixtures,
  type ModelBakeoffFixtureManifest,
} from './model-bakeoff-fixtures.js';
import {
  BAKEOFF_DEEPSEEK_MODELS,
  BAKEOFF_GEMINI_MODELS,
  BAKEOFF_MAXIMUM_DISPATCHES,
  BAKEOFF_PLANNED_DISPATCHES,
  createModelBakeoffPlan,
  type ModelBakeoffCase,
  type ModelBakeoffProvider,
} from './model-bakeoff-plan.js';
import {
  estimateModelBakeoffWorstCaseUsd,
  verifyModelBakeoffPricingManifest,
  verifyModelBakeoffRoleCapsManifest,
  type ModelBakeoffPricingManifest,
  type ModelBakeoffRoleCapsManifest,
} from './model-bakeoff-pricing.js';
import { inspectInstalledGemini37Catalog } from './model-catalog-audit.js';

const require = createRequire(import.meta.url);
const SHA256 = /^[a-f0-9]{64}$/;
const RUN_ID = /^cp03-model-bakeoff-\d{8}T\d{6}Z$/;
const SAFE_KEYCHAIN_REF = /^[A-Za-z0-9@._:+/-]{1,160}$/;
const DEEPSEEK_ADAPTER = '@deepseek-ai/dsh-llm-deepseek';
const GEMINI_ADAPTER = '@deepseek-ai/dsh-llm-pi-ai';
const PI_AI_CATALOG = '@earendil-works/pi-ai';

export interface CandidateCatalogFact {
  readonly provider: ModelBakeoffProvider;
  readonly route: 'deepseek-official' | 'google';
  readonly model: string;
  readonly name: string;
  readonly inputModalities: readonly string[];
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly catalogPackage: string | null;
  readonly catalogVersion: string | null;
}

export interface ModelBakeoffKeychainReference {
  readonly provider: ModelBakeoffProvider;
  readonly envRef: 'DEEPSEEK_API_KEY' | 'GEMINI_API_KEY';
  readonly keychainService: string;
  readonly keychainAccount: string;
}

export interface ModelBakeoffKeychainReferenceManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-keychain-references/0.1';
  readonly references: readonly ModelBakeoffKeychainReference[];
  readonly manifestSha256: string;
}

export interface ModelBakeoffCredentialPresence extends ModelBakeoffKeychainReference {
  readonly present: boolean;
}

export interface ModelBakeoffPreflight {
  readonly schemaVersion: 'cp03-model-bakeoff-preflight/0.1';
  readonly status: 'NOT_ELIGIBLE' | 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL';
  readonly runId: string;
  readonly counts: {
    readonly intended: 28;
    readonly eligible: number;
    readonly excluded: number;
    readonly sent: 0;
    readonly plannedDispatches: 28;
    readonly maximumDispatches: 30;
  };
  readonly planSha256: string;
  readonly fixtureManifestSha256: string;
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly pricingManifestSha256: string;
  readonly roleCapsSha256: string;
  readonly keychainReferencesSha256: string;
  readonly worstCaseEstimatedUsd: number | null;
  readonly credentials: readonly ModelBakeoffCredentialPresence[];
  readonly candidateFacts: readonly CandidateCatalogFact[];
  readonly exclusions: readonly {
    readonly caseId: string;
    readonly reason: string;
  }[];
  readonly providerRequestsMade: 0;
  readonly preflightSha256: string;
}

export interface KeychainPresenceCommand {
  readonly file: '/usr/bin/security';
  readonly args: readonly string[];
  readonly stdio: 'ignore';
}

const expectedCandidates = [
  ...BAKEOFF_DEEPSEEK_MODELS.map((model) => ({
    provider: 'deepseek' as const,
    route: 'deepseek-official' as const,
    model,
    requiredModalities: ['text'] as const,
    adapterPackage: DEEPSEEK_ADAPTER,
    catalogPackage: null,
    catalogVersion: null,
  })),
  ...BAKEOFF_GEMINI_MODELS.map((model) => ({
    provider: 'gemini' as const,
    route: 'google' as const,
    model,
    requiredModalities: ['text', 'image'] as const,
    adapterPackage: GEMINI_ADAPTER,
    catalogPackage: PI_AI_CATALOG,
    catalogVersion: '0.84.2',
  })),
] as const;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      deepFreeze(entry);
    }
    Object.freeze(value);
  }
  return value;
};

const canonicalHash = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

const packageVersion = (packageName: string): string => {
  const parsed: unknown = JSON.parse(
    readFileSync(require.resolve(`${packageName}/package.json`), 'utf8'),
  );
  if (
    typeof parsed !== 'object'
    || parsed === null
    || Array.isArray(parsed)
    || typeof (parsed as Record<string, unknown>).version !== 'string'
  ) {
    throw new Error(`PACKAGE_VERSION_UNRESOLVED:${packageName}`);
  }
  return (parsed as { readonly version: string }).version;
};

const referenceKey = (reference: ModelBakeoffKeychainReference): string =>
  [
    reference.provider,
    reference.envRef,
    reference.keychainService,
    reference.keychainAccount,
  ].join('\u0000');

export function createModelBakeoffKeychainReferenceManifest(
  references: readonly ModelBakeoffKeychainReference[],
): ModelBakeoffKeychainReferenceManifest {
  const unsigned = {
    schemaVersion: 'cp03-model-bakeoff-keychain-references/0.1' as const,
    references: references.map((reference) => ({ ...reference })),
  };
  return deepFreeze({ ...unsigned, manifestSha256: canonicalHash(unsigned) });
}

export function verifyModelBakeoffKeychainReferenceManifest(
  manifest: ModelBakeoffKeychainReferenceManifest,
): { readonly status: 'PASS' | 'FAIL'; readonly findings: readonly string[] } {
  const findings: string[] = [];
  if (manifest.schemaVersion !== 'cp03-model-bakeoff-keychain-references/0.1') {
    findings.push('KEYCHAIN_SCHEMA_VERSION_INVALID');
  }
  const providers = manifest.references.map(({ provider }) => provider).sort();
  if (providers.length !== 2 || providers[0] !== 'deepseek' || providers[1] !== 'gemini') {
    findings.push('KEYCHAIN_PROVIDER_SET_INVALID');
  }
  if (new Set(manifest.references.map(referenceKey)).size !== manifest.references.length) {
    findings.push('KEYCHAIN_REFERENCE_DUPLICATED');
  }
  for (const reference of manifest.references) {
    const expectedEnv = reference.provider === 'deepseek'
      ? 'DEEPSEEK_API_KEY'
      : 'GEMINI_API_KEY';
    if (reference.envRef !== expectedEnv) findings.push('KEYCHAIN_ENV_REF_INVALID');
    if (
      !SAFE_KEYCHAIN_REF.test(reference.keychainService)
      || !SAFE_KEYCHAIN_REF.test(reference.keychainAccount)
    ) {
      findings.push('KEYCHAIN_REFERENCE_INVALID');
    }
  }
  const { manifestSha256, ...unsigned } = manifest;
  if (!SHA256.test(manifestSha256) || canonicalHash(unsigned) !== manifestSha256) {
    findings.push('KEYCHAIN_SHA256_MISMATCH');
  }
  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings: [...new Set(findings)],
  };
}

export function buildKeychainPresenceCommand(
  reference: ModelBakeoffKeychainReference,
): KeychainPresenceCommand {
  return {
    file: '/usr/bin/security',
    args: [
      'find-generic-password',
      '-s',
      reference.keychainService,
      '-a',
      reference.keychainAccount,
    ],
    stdio: 'ignore',
  };
}

const runPresenceCommand = (command: KeychainPresenceCommand): Promise<boolean> =>
  new Promise((resolvePresence) => {
    const child = spawn(command.file, [...command.args], { stdio: command.stdio });
    child.once('error', () => resolvePresence(false));
    child.once('exit', (code) => resolvePresence(code === 0));
  });

export async function inspectModelBakeoffCredentialPresence(
  manifest: ModelBakeoffKeychainReferenceManifest,
  probe: (command: KeychainPresenceCommand) => Promise<boolean> = runPresenceCommand,
): Promise<readonly ModelBakeoffCredentialPresence[]> {
  if (verifyModelBakeoffKeychainReferenceManifest(manifest).status !== 'PASS') {
    throw new Error('MODEL_BAKEOFF_KEYCHAIN_REFERENCES_INVALID');
  }
  return Promise.all(manifest.references.map(async (reference) => ({
    ...reference,
    present: await probe(buildKeychainPresenceCommand(reference)),
  })));
}

export async function inspectInstalledModelBakeoffCandidateFacts(): Promise<
  readonly CandidateCatalogFact[]
> {
  const [googleSource, deepseekFacts] = await Promise.all([
    inspectInstalledGemini37Catalog(),
    (async (): Promise<readonly CandidateCatalogFact[]> => {
      const ctx = new Context();
      try {
        await ctx.plugin(LlmRuntime);
        const adapter = await import(DEEPSEEK_ADAPTER);
        await ctx.plugin(adapter, { providers: { 'deepseek-official': {} } });
        const listed = await ctx.llm.listModels('deepseek-official');
        const adapterVersion = packageVersion(DEEPSEEK_ADAPTER);
        return listed.map((entry) => ({
          provider: 'deepseek',
          route: 'deepseek-official',
          model: entry.id,
          name: entry.name,
          inputModalities: [...(entry.inputModalities ?? [])],
          adapterPackage: DEEPSEEK_ADAPTER,
          adapterVersion,
          catalogPackage: null,
          catalogVersion: null,
        }));
      } finally {
        await ctx.fiber.dispose();
      }
    })(),
  ]);

  const googleFacts: CandidateCatalogFact[] = googleSource.entries.map((entry) => ({
    provider: 'gemini',
    route: 'google',
    model: entry.id,
    name: entry.name,
    inputModalities: [...entry.inputModalities],
    adapterPackage: GEMINI_ADAPTER,
    adapterVersion: googleSource.dshAdapter.version,
    catalogPackage: PI_AI_CATALOG,
    catalogVersion: googleSource.catalogPackage.version,
  }));
  return deepFreeze([...deepseekFacts, ...googleFacts]);
}

const candidateEligibility = (
  facts: readonly CandidateCatalogFact[],
): ReadonlyMap<string, { readonly eligible: boolean; readonly reason: string }> => {
  const result = new Map<string, { readonly eligible: boolean; readonly reason: string }>();
  for (const expected of expectedCandidates) {
    const exact = facts.filter((fact) =>
      fact.provider === expected.provider
      && fact.route === expected.route
      && fact.model === expected.model
    );
    const fact = exact[0];
    let reason = '';
    if (exact.length === 0) reason = 'EXACT_CANDIDATE_MISSING';
    else if (exact.length > 1) reason = 'EXACT_CANDIDATE_DUPLICATED';
    else if (!expected.requiredModalities.every((modality) =>
      fact!.inputModalities.includes(modality)
    )) reason = 'CANDIDATE_MODALITY_MISSING';
    else if (fact!.adapterPackage !== expected.adapterPackage) {
      reason = 'CANDIDATE_ADAPTER_PACKAGE_MISMATCH';
    }
    else if (fact!.adapterVersion !== '0.1.0-rc.6') {
      reason = 'CANDIDATE_ADAPTER_VERSION_MISMATCH';
    } else if (
      fact!.catalogPackage !== expected.catalogPackage
      || fact!.catalogVersion !== expected.catalogVersion
    ) reason = 'CANDIDATE_CATALOG_VERSION_MISMATCH';
    result.set(expected.model, { eligible: reason === '', reason });
  }
  return result;
};

const planFindings = (
  plan: readonly ModelBakeoffCase[],
  fixtures: ModelBakeoffFixtureManifest,
): readonly string[] => {
  const findings: string[] = [];
  if (plan.length !== BAKEOFF_PLANNED_DISPATCHES) findings.push('PLAN_COUNT_INVALID');
  if (new Set(plan.map(({ caseId }) => caseId)).size !== plan.length) {
    findings.push('PLAN_CASE_ID_DUPLICATED');
  }
  if (!plan.every((entry, index) => entry.plannedOrdinal === index + 1)) {
    findings.push('PLAN_ORDINAL_INVALID');
  }
  if (plan.filter(({ provider }) => provider === 'deepseek').length !== 16) {
    findings.push('PLAN_DEEPSEEK_COUNT_INVALID');
  }
  if (plan.filter(({ provider }) => provider === 'gemini').length !== 12) {
    findings.push('PLAN_GEMINI_COUNT_INVALID');
  }
  if (canonicalHash(plan) !== canonicalHash(createModelBakeoffPlan(fixtures))) {
    findings.push('PLAN_EXACT_MATRIX_MISMATCH');
  }
  for (const entry of plan) {
    if (
      entry.fixtureManifestSha256 !== fixtures.fixtureManifestSha256
      || entry.promptManifestSha256 !== fixtures.promptManifestSha256
      || entry.schemaManifestSha256 !== fixtures.schemaManifestSha256
    ) {
      findings.push('PLAN_FIXTURE_BINDING_MISMATCH');
      break;
    }
  }
  return findings;
};

const fixtureFindings = (fixtures: ModelBakeoffFixtureManifest): readonly string[] =>
  canonicalHash(fixtures) === canonicalHash(createModelBakeoffFixtures().manifest)
    ? []
    : ['FIXTURE_MANIFEST_MISMATCH'];

const credentialFindings = (
  manifest: ModelBakeoffKeychainReferenceManifest,
  presence: readonly ModelBakeoffCredentialPresence[],
): readonly string[] => {
  const findings: string[] = [];
  const expected = new Map(manifest.references.map((reference) => [
    referenceKey(reference),
    reference,
  ]));
  if (presence.length !== expected.size) findings.push('KEYCHAIN_PRESENCE_COUNT_INVALID');
  const occurrenceCounts = new Map<string, number>();
  for (const credential of presence) {
    const key = referenceKey(credential);
    occurrenceCounts.set(key, (occurrenceCounts.get(key) ?? 0) + 1);
    if (!expected.has(key)) findings.push('KEYCHAIN_PRESENCE_REF_MISMATCH');
    if (!credential.present) findings.push(`KEYCHAIN_ITEM_MISSING:${credential.provider}`);
  }
  for (const key of expected.keys()) {
    if (occurrenceCounts.get(key) !== 1) findings.push('KEYCHAIN_PRESENCE_REF_MISMATCH');
  }
  return findings;
};

export function createModelBakeoffPreflight(input: {
  readonly runId: string;
  readonly plan: readonly ModelBakeoffCase[];
  readonly fixtures: ModelBakeoffFixtureManifest;
  readonly pricing: ModelBakeoffPricingManifest;
  readonly roleCaps: ModelBakeoffRoleCapsManifest;
  readonly keychainReferences: ModelBakeoffKeychainReferenceManifest;
  readonly credentialPresence: readonly ModelBakeoffCredentialPresence[];
  readonly candidateFacts: readonly CandidateCatalogFact[];
  readonly now?: number;
}): ModelBakeoffPreflight {
  const globalFindings: string[] = [];
  if (!RUN_ID.test(input.runId)) globalFindings.push('RUN_ID_INVALID');
  globalFindings.push(
    ...verifyModelBakeoffPricingManifest(input.pricing, input.now ?? Date.now()).findings,
    ...verifyModelBakeoffRoleCapsManifest(input.roleCaps).findings,
    ...verifyModelBakeoffKeychainReferenceManifest(input.keychainReferences).findings,
    ...fixtureFindings(input.fixtures),
    ...planFindings(input.plan, input.fixtures),
    ...credentialFindings(input.keychainReferences, input.credentialPresence),
  );

  const candidateStatus = candidateEligibility(input.candidateFacts);
  const exclusions = input.plan.flatMap((entry) => {
    const reasons = [...globalFindings];
    const candidate = candidateStatus.get(entry.model);
    if (candidate === undefined || !candidate.eligible) {
      reasons.push(candidate?.reason || 'CANDIDATE_NOT_IN_FIXED_MATRIX');
    }
    return reasons.length === 0
      ? []
      : [{ caseId: entry.caseId, reason: [...new Set(reasons)].join('+') }];
  });
  const eligible = input.plan.length - exclusions.length;
  const selectedFacts = input.candidateFacts.filter((fact) =>
    expectedCandidates.some((candidate) =>
      candidate.provider === fact.provider
      && candidate.route === fact.route
      && candidate.model === fact.model
    )
  );
  const canEstimate = globalFindings.length === 0;
  const worstCaseEstimatedUsd = canEstimate
    ? estimateModelBakeoffWorstCaseUsd({
      plan: input.plan,
      pricing: input.pricing,
      roleCaps: input.roleCaps,
    }).worstCaseEstimatedUsd
    : null;

  const unsigned = {
    schemaVersion: 'cp03-model-bakeoff-preflight/0.1' as const,
    status: input.plan.length === BAKEOFF_PLANNED_DISPATCHES
      && eligible === BAKEOFF_PLANNED_DISPATCHES
      && exclusions.length === 0
      ? 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL' as const
      : 'NOT_ELIGIBLE' as const,
    runId: input.runId,
    counts: {
      intended: 28 as const,
      eligible,
      excluded: exclusions.length,
      sent: 0 as const,
      plannedDispatches: BAKEOFF_PLANNED_DISPATCHES,
      maximumDispatches: BAKEOFF_MAXIMUM_DISPATCHES,
    },
    planSha256: canonicalHash(input.plan),
    fixtureManifestSha256: input.fixtures.fixtureManifestSha256,
    promptManifestSha256: input.fixtures.promptManifestSha256,
    schemaManifestSha256: input.fixtures.schemaManifestSha256,
    pricingManifestSha256: input.pricing.manifestSha256,
    roleCapsSha256: input.roleCaps.manifestSha256,
    keychainReferencesSha256: input.keychainReferences.manifestSha256,
    worstCaseEstimatedUsd,
    credentials: input.credentialPresence.map((credential) => ({ ...credential })),
    candidateFacts: selectedFacts.map((fact) => ({
      ...fact,
      inputModalities: [...fact.inputModalities],
    })),
    exclusions,
    providerRequestsMade: 0 as const,
  };
  return deepFreeze({ ...unsigned, preflightSha256: canonicalHash(unsigned) });
}

export function verifyModelBakeoffPreflight(
  preflight: ModelBakeoffPreflight,
): { readonly status: 'PASS' | 'FAIL'; readonly findings: readonly string[] } {
  const findings: string[] = [];
  if (preflight.schemaVersion !== 'cp03-model-bakeoff-preflight/0.1') {
    findings.push('PREFLIGHT_SCHEMA_VERSION_INVALID');
  }
  if (!RUN_ID.test(preflight.runId)) findings.push('PREFLIGHT_RUN_ID_INVALID');
  if (
    preflight.counts.intended !== 28
    || preflight.counts.plannedDispatches !== 28
    || preflight.counts.maximumDispatches !== 30
    || preflight.counts.eligible + preflight.counts.excluded !== 28
    || preflight.counts.excluded !== preflight.exclusions.length
  ) findings.push('PREFLIGHT_COUNTS_INVALID');
  if (preflight.counts.sent !== 0) findings.push('PREFLIGHT_SENT_NONZERO');
  if (preflight.providerRequestsMade !== 0) findings.push('PREFLIGHT_REQUESTS_NONZERO');
  if (
    (preflight.status === 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL'
      && (preflight.counts.eligible !== 28 || preflight.exclusions.length !== 0))
    || (preflight.status === 'NOT_ELIGIBLE' && preflight.counts.eligible === 28)
  ) findings.push('PREFLIGHT_STATUS_INCONSISTENT');
  if (preflight.status === 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL') {
    const credentialProviders = preflight.credentials.map(({ provider }) => provider).sort();
    const credentialKeys = preflight.credentials.map(referenceKey);
    if (
      credentialProviders.length !== 2
      || credentialProviders[0] !== 'deepseek'
      || credentialProviders[1] !== 'gemini'
      || new Set(credentialKeys).size !== 2
      || preflight.credentials.some(({ present }) => !present)
    ) findings.push('PREFLIGHT_CREDENTIALS_INVALID');

    const candidateStatus = candidateEligibility(preflight.candidateFacts);
    if (
      preflight.candidateFacts.length !== expectedCandidates.length
      || [...candidateStatus.values()].some(({ eligible }) => !eligible)
    ) findings.push('PREFLIGHT_CANDIDATES_INVALID');
  }
  for (const hash of [
    preflight.planSha256,
    preflight.fixtureManifestSha256,
    preflight.promptManifestSha256,
    preflight.schemaManifestSha256,
    preflight.pricingManifestSha256,
    preflight.roleCapsSha256,
    preflight.keychainReferencesSha256,
  ]) {
    if (!SHA256.test(hash)) findings.push('PREFLIGHT_BINDING_SHA256_INVALID');
  }
  const { preflightSha256, ...unsigned } = preflight;
  if (!SHA256.test(preflightSha256) || canonicalHash(unsigned) !== preflightSha256) {
    findings.push('PREFLIGHT_SHA256_MISMATCH');
  }
  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings: [...new Set(findings)],
  };
}

export function resolveModelBakeoffRunRoot(repoRoot: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new Error('MODEL_BAKEOFF_RUN_ID_INVALID');
  const archiveRoot = resolve(repoRoot, 'checkpoints', 'cp03', 'model-bakeoff');
  const runRoot = resolve(archiveRoot, runId);
  const relativeRunRoot = relative(archiveRoot, runRoot);
  if (
    relativeRunRoot.length === 0
    || relativeRunRoot === '..'
    || relativeRunRoot.startsWith(`..${sep}`)
    || isAbsolute(relativeRunRoot)
  ) {
    throw new Error('MODEL_BAKEOFF_RUN_ROOT_INVALID');
  }
  return runRoot;
}
