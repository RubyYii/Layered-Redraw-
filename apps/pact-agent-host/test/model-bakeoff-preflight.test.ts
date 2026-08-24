import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import { createModelBakeoffPlan } from '../src/model-bakeoff-plan.js';
import {
  createModelBakeoffPricingManifest,
  createModelBakeoffRoleCapsManifest,
} from '../src/model-bakeoff-pricing.js';
import {
  buildKeychainPresenceCommand,
  createModelBakeoffKeychainReferenceManifest,
  createModelBakeoffPreflight,
  resolveModelBakeoffRunRoot,
  verifyModelBakeoffPreflight,
  type CandidateCatalogFact,
  type ModelBakeoffCredentialPresence,
} from '../src/model-bakeoff-preflight.js';

const NOW = Date.parse('2000-01-01T12:00:00.000Z');
const RUN_ID = 'cp03-model-bakeoff-20000101T120000Z';

const pricing = () => createModelBakeoffPricingManifest({
  retrievedAt: '2000-01-01T00:00:00.000Z',
  sources: [
    {
      provider: 'deepseek',
      url: 'https://api-docs.deepseek.com/quick_start/pricing',
      pageSha256: 'a'.repeat(64),
    },
    {
      provider: 'gemini',
      url: 'https://ai.google.dev/gemini-api/docs/pricing',
      pageSha256: 'b'.repeat(64),
    },
  ],
  rates: Object.fromEntries([
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
  ].map((model) => [model, {
    inputUsdPerMillionTokens: 1,
    outputUsdPerMillionTokens: 2,
    assumption: 'synthetic test-only rate; not current official pricing',
  }])),
});

const roleCaps = () => createModelBakeoffRoleCapsManifest({
  ConductorIntent: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Archivist: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Guardian: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  ConductorCommit: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Witness: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Rewriter: { maxInputTokens: 1_000, maxOutputTokens: 100 },
});

const keychain = () => createModelBakeoffKeychainReferenceManifest([
  {
    provider: 'deepseek',
    envRef: 'DEEPSEEK_API_KEY',
    keychainService: 'pact-test-deepseek',
    keychainAccount: 'fictional-test-account',
  },
  {
    provider: 'gemini',
    envRef: 'GEMINI_API_KEY',
    keychainService: 'pact-test-gemini',
    keychainAccount: 'fictional-test-account',
  },
]);

const candidates = (): CandidateCatalogFact[] => [
  {
    provider: 'deepseek',
    route: 'deepseek-official',
    model: 'deepseek-v4-pro',
    name: 'DeepSeek-V4-Pro',
    inputModalities: ['text'],
    adapterPackage: '@deepseek-ai/dsh-llm-deepseek',
    adapterVersion: '0.1.0-rc.6',
    catalogPackage: null,
    catalogVersion: null,
  },
  {
    provider: 'deepseek',
    route: 'deepseek-official',
    model: 'deepseek-v4-flash',
    name: 'DeepSeek-V4-Flash',
    inputModalities: ['text'],
    adapterPackage: '@deepseek-ai/dsh-llm-deepseek',
    adapterVersion: '0.1.0-rc.6',
    catalogPackage: null,
    catalogVersion: null,
  },
  ...['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash'].map(
    (model): CandidateCatalogFact => ({
      provider: 'gemini',
      route: 'google',
      model,
      name: model,
      inputModalities: ['text', 'image'],
      adapterPackage: '@deepseek-ai/dsh-llm-pi-ai',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: '@earendil-works/pi-ai',
      catalogVersion: '0.84.2',
    }),
  ),
];

const present = (): ModelBakeoffCredentialPresence[] => keychain().references.map(
  (reference) => ({ ...reference, present: true }),
);

const validInput = () => {
  const fixtures = createModelBakeoffFixtures();
  return {
    runId: RUN_ID,
    plan: createModelBakeoffPlan(fixtures.manifest),
    fixtures: fixtures.manifest,
    pricing: pricing(),
    roleCaps: roleCaps(),
    keychainReferences: keychain(),
    credentialPresence: present(),
    candidateFacts: candidates(),
    now: NOW,
  } as const;
};

describe('model bakeoff preflight', () => {
  it('creates one canonical 28/28 zero-call preflight awaiting explicit approval', () => {
    const preflight = createModelBakeoffPreflight(validInput());
    const { preflightSha256, ...unsigned } = preflight;

    expect(preflight).toMatchObject({
      schemaVersion: 'cp03-model-bakeoff-preflight/0.1',
      status: 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL',
      runId: RUN_ID,
      counts: {
        intended: 28,
        eligible: 28,
        excluded: 0,
        sent: 0,
        plannedDispatches: 28,
        maximumDispatches: 30,
      },
      providerRequestsMade: 0,
      exclusions: [],
    });
    expect(preflight.candidateFacts).toHaveLength(5);
    expect(preflight.credentials).toHaveLength(2);
    expect(createHash('sha256').update(canonicalJson(unsigned)).digest('hex')).toBe(
      preflightSha256,
    );
    expect(verifyModelBakeoffPreflight(preflight)).toEqual({
      status: 'PASS',
      findings: [],
    });
  });

  it.each([
    ['absent model', (facts: CandidateCatalogFact[]) =>
      facts.filter(({ model }) => model !== 'gemini-3.7-flash')],
    ['duplicate model', (facts: CandidateCatalogFact[]) => [...facts, { ...facts[0]! }]],
    ['aliased model', (facts: CandidateCatalogFact[]) => facts.map((fact) =>
      fact.model === 'gemini-3.7-flash' ? { ...fact, model: 'gemini-flash-latest' } : fact)],
    ['wrong route', (facts: CandidateCatalogFact[]) => facts.map((fact) =>
      fact.model === 'deepseek-v4-pro'
        ? { ...fact, route: 'google' as const }
        : fact)],
    ['missing modality', (facts: CandidateCatalogFact[]) => facts.map((fact) =>
      fact.model === 'gemini-3.6-flash'
        ? { ...fact, inputModalities: ['text'] }
        : fact)],
  ] as const)('fails closed for an %s without shrinking the run silently', (_label, mutate) => {
    const input = validInput();
    const preflight = createModelBakeoffPreflight({
      ...input,
      candidateFacts: mutate(candidates()) as CandidateCatalogFact[],
    });

    expect(preflight.status).toBe('NOT_ELIGIBLE');
    expect(preflight.counts.eligible).toBeLessThan(28);
    expect(preflight.counts.excluded).toBe(28 - preflight.counts.eligible);
    expect(preflight.counts.sent).toBe(0);
    expect(preflight.providerRequestsMade).toBe(0);
  });

  it('rejects stale pricing, missing Keychain presence, and altered fixture bindings', () => {
    const base = validInput();
    const stale = createModelBakeoffPreflight({ ...base, now: Date.now() });
    const missingCredential = createModelBakeoffPreflight({
      ...base,
      credentialPresence: present().map((entry) =>
        entry.provider === 'gemini' ? { ...entry, present: false } : entry),
    });
    const alteredPlan = base.plan.map((entry, index) => index === 0
      ? { ...entry, fixtureManifestSha256: 'f'.repeat(64) }
      : entry);
    const alteredFixture = createModelBakeoffPreflight({ ...base, plan: alteredPlan });

    for (const result of [stale, missingCredential, alteredFixture]) {
      expect(result.status).toBe('NOT_ELIGIBLE');
      expect(result.counts.eligible).toBeLessThan(28);
      expect(result.providerRequestsMade).toBe(0);
    }
  });

  it('rejects missing or duplicated credential-presence records', () => {
    const base = validInput();
    const missing = createModelBakeoffPreflight({
      ...base,
      credentialPresence: present().slice(0, 1),
    });
    const duplicated = createModelBakeoffPreflight({
      ...base,
      credentialPresence: [present()[0]!, present()[0]!],
    });

    for (const result of [missing, duplicated]) {
      expect(result.status).toBe('NOT_ELIGIBLE');
      expect(result.counts.eligible).toBe(0);
      expect(result.providerRequestsMade).toBe(0);
    }
  });

  it('rejects a reordered plan and mismatched locked adapter identity', () => {
    const base = validInput();
    const [first, second, ...remaining] = base.plan;
    const reorderedPlan = [
      { ...second!, plannedOrdinal: 1 },
      { ...first!, plannedOrdinal: 2 },
      ...remaining,
    ];
    const wrongAdapter = candidates().map((fact) => fact.model === 'gemini-3.7-flash'
      ? { ...fact, adapterPackage: '@example/not-the-locked-adapter' }
      : fact);

    expect(createModelBakeoffPreflight({ ...base, plan: reorderedPlan }).status)
      .toBe('NOT_ELIGIBLE');
    expect(createModelBakeoffPreflight({
      ...base,
      candidateFacts: wrongAdapter,
    }).status).toBe('NOT_ELIGIBLE');
  });

  it('builds a presence-only Keychain command without exposing a value', () => {
    const command = buildKeychainPresenceCommand(keychain().references[0]!);

    expect(command).toEqual({
      file: '/usr/bin/security',
      args: [
        'find-generic-password',
        '-s',
        'pact-test-deepseek',
        '-a',
        'fictional-test-account',
      ],
      stdio: 'ignore',
    });
    expect(command.args).not.toContain('-w');
  });

  it('resolves only exact run IDs below the new isolated archive root', () => {
    expect(resolveModelBakeoffRunRoot('/tmp/pact-repo', RUN_ID)).toBe(
      resolve('/tmp/pact-repo', 'checkpoints', 'cp03', 'model-bakeoff', RUN_ID),
    );
    expect(() => resolveModelBakeoffRunRoot(
      '/tmp/pact-repo',
      '../provider-compatibility/run-01',
    )).toThrow('MODEL_BAKEOFF_RUN_ID_INVALID');
  });

  it('detects any post-creation count or provider-request claim tampering', () => {
    const preflight = createModelBakeoffPreflight(validInput());

    expect(verifyModelBakeoffPreflight({
      ...preflight,
      counts: { ...preflight.counts, sent: 1 as 0 },
    })).toMatchObject({ status: 'FAIL' });
    expect(verifyModelBakeoffPreflight({
      ...preflight,
      providerRequestsMade: 1 as 0,
    })).toMatchObject({ status: 'FAIL' });
    const semanticallyTampered = {
      ...preflight,
      credentials: [preflight.credentials[0]!, preflight.credentials[0]!],
    };
    const { preflightSha256: _oldHash, ...unsigned } = semanticallyTampered;
    expect(verifyModelBakeoffPreflight({
      ...semanticallyTampered,
      preflightSha256: createHash('sha256')
        .update(canonicalJson(unsigned))
        .digest('hex'),
    })).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['PREFLIGHT_CREDENTIALS_INVALID']),
    });
  });
});
