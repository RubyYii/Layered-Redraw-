import { describe, expect, it } from 'vitest';

import {
  bindingForSnapshot,
  COUNCIL_ROLE_ORDER,
  CouncilTransportError,
  InMemoryCouncilDurability,
  runCriticalPathCouncil,
  type ConductorDraftCommit,
  type CouncilProviderAdapter,
  type CouncilRole,
  type CouncilShard,
  type CouncilTurnSnapshot,
  type GuardianDisposition,
} from '../src/critical-path-council.js';

const hash = (character: string): string => character.repeat(64);

const snapshot = (): CouncilTurnSnapshot => ({
  schemaVersion: 'pact-cp03-turn-snapshot/0.1',
  caseSessionId: 'case_cp03_test',
  turnId: 'turn_cp03_test_01',
  parentSceneHash: hash('a'),
  registryVersion: 'registry/1',
  capabilityEnvelopeHash: hash('b'),
  actionStateHash: hash('c'),
  routingManifestVersion: 'routing/1',
  epochMonotonicMs: 0,
  deadlineMonotonicMs: 12_000,
  inputClasses: ['text', 'image', 'scene'],
  requiredRoles: [...COUNCIL_ROLE_ORDER],
});

const shardFor = (
  role: CouncilRole,
  turnSnapshot: CouncilTurnSnapshot,
  disposition: GuardianDisposition = 'ALLOW',
): CouncilShard => {
  const common = {
    schemaVersion: 'pact-cp03-council-shard/0.1' as const,
    childSessionId: `child_${role}`,
    binding: bindingForSnapshot(turnSnapshot),
    publicTrace: `${role} exact trace`,
  };
  switch (role) {
    case 'ConductorIntent':
      return { ...common, role, payload: {
        interpretation: 'The cup is remembered through an uncertain hand.',
        candidateActionSequence: ['Translate', 'Reframe'],
        terminalIntent: 'Continue',
        relevantRoles: [...COUNCIL_ROLE_ORDER],
      } };
    case 'Witness':
      return { ...common, role, payload: {
        observations: ['A hand approaches the cup.'],
        uncertainties: ['The owner of the hand is uncertain.'],
        evidenceAnchors: ['viewer-text:1', 'synthetic-image:1'],
      } };
    case 'Archivist':
      return { ...common, role, payload: {
        assetReferences: [{ id: 'cup-registered', source: 'local-registry', licence: 'cleared-test', registryVersion: turnSnapshot.registryVersion }],
        unavailableReferences: [],
        provenanceNotes: ['No external retrieval.'],
      } };
    case 'Rewriter':
      return { ...common, role, payload: {
        spatial: { relation: 'hand-near-cup' },
        visual: { treatment: 'cyan-echo' },
        camera: { framing: 'medium' },
        light: { change: 'none' },
        sound: { cue: 'room-tone' },
        poeticText: 'The hand arrives before its name.',
        semanticCapabilityIds: ['scene.translate'],
        expectedChanges: ['Move the registered cup within the governed room.'],
      } };
    case 'Guardian':
      return { ...common, role, payload: {
        disposition,
        forbiddenCapabilityIds: ['runtime.raw-code'],
        requiredSourceLocks: ['cup-registered'],
        requiredRightsConditions: ['cleared-test'],
        requiredRollbackCapabilities: ['scene.rollback'],
        contestedEvidenceIds: ['viewer-text:1'],
        dissent: [{ id: 'dissent-owner-uncertain', text: 'Do not resolve ownership as fact.' }],
        publicChallenge: 'Ownership remains uncertain.',
      } };
  }
};

const providers: Readonly<Record<CouncilRole | 'ConductorCommit', string>> = {
  ConductorIntent: 'deepseek',
  Witness: 'gemini',
  Archivist: 'deepseek',
  Rewriter: 'gemini',
  Guardian: 'deepseek',
  ConductorCommit: 'deepseek',
};

const adapter = (
  turnSnapshot: CouncilTurnSnapshot,
  options: {
    readonly guardian?: GuardianDisposition;
    readonly omitDissent?: boolean;
    readonly onShard?: (role: CouncilRole, attempt: number) => void;
    readonly beforeShardReturn?: (role: CouncilRole) => void;
  } = {},
): CouncilProviderAdapter => ({
  async dispatchShard(request) {
    options.onShard?.(request.role, request.attempt);
    await Promise.resolve();
    options.beforeShardReturn?.(request.role);
    return shardFor(request.role, turnSnapshot, options.guardian);
  },
  async dispatchCommit(request) {
    const guardian = request.shards.find((entry) => entry.role === 'Guardian')?.shard;
    const dissent = guardian?.role === 'Guardian' ? guardian.payload.dissent.map((entry) => entry.id) : [];
    return {
      schemaVersion: 'pact-cp03-conductor-commit/0.1',
      turnId: turnSnapshot.turnId,
      status: 'PROPOSED',
      actionSequence: ['Translate'],
      selectedShardHashes: request.shards.map((entry) => entry.hash),
      selectedDissentIds: options.omitDissent ? [] : dissent,
      terminalIntent: 'Continue',
    } satisfies ConductorDraftCommit;
  },
});

describe('CP03 parallel critical-path council', () => {
  it('rejects a snapshot that omits any one of the five required roles', async () => {
    const incomplete: CouncilTurnSnapshot = { ...snapshot(), requiredRoles: COUNCIL_ROLE_ORDER.slice(0, -1) };
    const result = await runCriticalPathCouncil({
      snapshot: incomplete,
      adapter: adapter(incomplete),
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
      now: () => 1_000,
    });

    expect(result).toMatchObject({ status: 'FAILED_NO_MUTATION', code: 'TURN_SNAPSHOT_INVALID', sentDispatches: 0 });
  });

  it('starts all five typed shards in parallel and assembles an exact durable trace', async () => {
    const turnSnapshot = snapshot();
    const starts: CouncilRole[] = [];
    const startCountsAtCompletion: number[] = [];
    const result = await runCriticalPathCouncil({
      snapshot: turnSnapshot,
      adapter: adapter(turnSnapshot, {
        onShard(role) { starts.push(role); },
        beforeShardReturn() { startCountsAtCompletion.push(starts.length); },
      }),
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
      now: () => 1_000,
    });

    expect(starts).toEqual(COUNCIL_ROLE_ORDER);
    expect(Math.min(...startCountsAtCompletion)).toBe(5);
    expect(result.status).toBe('PROPOSED');
    expect(result.sentDispatches).toBe(6);
    expect(result.trace).toMatchObject({
      role: 'Witness', text: 'Witness exact trace', acceptanceSequence: 2, provisional: true,
    });
    if (result.status !== 'PROPOSED') throw new Error('proposed result required');
    expect(result.draft.creative).toMatchObject({ poeticText: 'The hand arrives before its name.' });
    expect(result.draft.agency).toMatchObject({
      dissent: [{ id: 'dissent-owner-uncertain', text: 'Do not resolve ownership as fact.' }],
    });
  });

  it('is deterministically hash-stable for identical frozen inputs', async () => {
    const turnSnapshot = snapshot();
    const run = () => runCriticalPathCouncil({
      snapshot: turnSnapshot,
      adapter: adapter(turnSnapshot),
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
      now: () => 1_500,
    });
    const first = await run();
    const second = await run();

    expect(first.status).toBe('PROPOSED');
    expect(second.status).toBe('PROPOSED');
    if (!('draftHash' in first) || !('draftHash' in second)) throw new Error('draft hashes required');
    expect(second.draftHash).toBe(first.draftHash);
  });

  it('rejects a minimal commit that drops required Guardian dissent', async () => {
    const turnSnapshot = snapshot();
    const result = await runCriticalPathCouncil({
      snapshot: turnSnapshot,
      adapter: adapter(turnSnapshot, { omitDissent: true }),
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
      now: () => 2_000,
    });

    expect(result).toMatchObject({ status: 'FAILED_NO_MUTATION', code: 'CONDUCTOR_COMMIT_INVALID', draft: null });
  });

  it('preserves Guardian WITHHOLD as a non-executable durable draft', async () => {
    const turnSnapshot = snapshot();
    const result = await runCriticalPathCouncil({
      snapshot: turnSnapshot,
      adapter: adapter(turnSnapshot, { guardian: 'WITHHOLD' }),
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
      now: () => 2_000,
    });

    expect(result.status).toBe('WITHHELD');
    if (result.status !== 'WITHHELD') throw new Error('withheld result required');
    expect(result.draft.decision.status).toBe('WITHHELD');
  });

  it('quarantines a shard accepted exactly at the hard deadline', async () => {
    const turnSnapshot = snapshot();
    let clock = 2_000;
    const result = await runCriticalPathCouncil({
      snapshot: turnSnapshot,
      adapter: adapter(turnSnapshot, { beforeShardReturn(role) { if (role === 'Rewriter') clock = 12_000; } }),
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
      now: () => clock,
    });

    expect(result.status).toBe('LATE_QUARANTINED');
    expect(result.draft).toBeNull();
    expect(result.dispatches.some((entry) => entry.outcome === 'LATE_QUARANTINED')).toBe(true);
  });

  it('actively aborts a hung provider at the hard deadline without assembling a draft', async () => {
    const epoch = performance.now();
    const turnSnapshot: CouncilTurnSnapshot = {
      ...snapshot(),
      epochMonotonicMs: epoch,
      deadlineMonotonicMs: epoch + 30,
    };
    const baseAdapter = adapter(turnSnapshot);
    let witnessAborted = false;
    const hanging: CouncilProviderAdapter = {
      dispatchShard(request) {
        if (request.role !== 'Witness') return baseAdapter.dispatchShard(request);
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => {
            witnessAborted = true;
            reject(new Error('provider aborted'));
          }, { once: true });
        });
      },
      dispatchCommit: (request) => baseAdapter.dispatchCommit(request),
    };

    const result = await runCriticalPathCouncil({
      snapshot: turnSnapshot,
      adapter: hanging,
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
    });

    expect(witnessAborted).toBe(true);
    expect(result).toMatchObject({ status: 'LATE_QUARANTINED', code: 'REQUIRED_SHARD_LATE', draft: null });
    expect(result.dispatches.find((entry) => entry.role === 'Witness')).toMatchObject({
      outcome: 'LATE_QUARANTINED',
      code: 'COUNCIL_DEADLINE_EXCEEDED',
    });
  });

  it('uses one pre-side-effect retry for a provider without exceeding the 6/8 budget', async () => {
    const turnSnapshot = snapshot();
    const attempts = new Map<CouncilRole, number>();
    const baseAdapter = adapter(turnSnapshot);
    const retrying: CouncilProviderAdapter = {
      async dispatchShard(request) {
        const attempt = (attempts.get(request.role) ?? 0) + 1;
        attempts.set(request.role, attempt);
        if (request.role === 'Witness' && attempt === 1) {
          throw new CouncilTransportError('gemini', true, false, 'temporary transport failure');
        }
        return baseAdapter.dispatchShard(request);
      },
      dispatchCommit: (request) => baseAdapter.dispatchCommit(request),
    };
    const result = await runCriticalPathCouncil({
      snapshot: turnSnapshot,
      adapter: retrying,
      durability: new InMemoryCouncilDurability(),
      providerForRole: providers,
      now: () => 2_000,
    });

    expect(result.status).toBe('PROPOSED');
    expect(result.sentDispatches).toBe(7);
    expect(attempts.get('Witness')).toBe(2);
    expect(result.dispatches.filter((entry) => entry.role === 'Witness')).toHaveLength(2);
  });
});
