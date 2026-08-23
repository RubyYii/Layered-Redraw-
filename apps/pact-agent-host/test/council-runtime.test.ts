import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LlmAdapter, LlmError, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  runCouncilRuntime,
  type CouncilAttemptRecord,
  type CouncilRuntimeResult,
} from '../src/council-runtime.js';
import type {
  CouncilRole,
  CouncilShard,
  ConductorDraftCommit,
  ProviderRoutingManifest,
} from '../src/contract-types.js';
import { type FrozenCouncilTurn } from '../src/council-turn.js';
import {
  createFullCouncilFixtures,
  roleOrder,
  type FullCouncilFixtures,
} from './council-fixtures.js';
import { textResponse, toolCallResponse } from './scripted-adapter.js';

type RuntimeSuccess = Extract<CouncilRuntimeResult, { status: 'COMPLETED' }>;
type RuntimeFailure = Exclude<CouncilRuntimeResult, RuntimeSuccess>;

interface TestClock {
  readonly now: () => number;
  set(value: number): void;
  advance(value: number): void;
}

const clock = (initial: number): TestClock => {
  let value = initial;
  return {
    now: () => value,
    set(next) {
      value = next;
    },
    advance(delta) {
      value += delta;
    },
  };
};

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const textOf = (options: GenerateOptions): string => options.messages
  .flatMap((message) => message.content)
  .flatMap((block) => block.type === 'text' ? [block.text] : [])
  .join('\n');

const roleOf = (options: GenerateOptions): CouncilRole => {
  const role = options.system?.match(
    /role=(CaseConductor|Witness|Archivist|Rewriter|Guardian)/,
  )?.[1];
  if (role === undefined) throw new Error('test adapter role missing');
  return role as CouncilRole;
};

const phaseOf = (options: GenerateOptions): 'SHARD' | 'CONDUCTOR_COMMIT' =>
  textOf(options).includes('COUNCIL_COMMIT')
    ? 'CONDUCTOR_COMMIT'
    : 'SHARD';

const ordinalOf = (role: CouncilRole, phase: 'SHARD' | 'CONDUCTOR_COMMIT'): number =>
  phase === 'CONDUCTOR_COMMIT' ? 6 : roleOrder.indexOf(role) + 1;

interface AdapterOptions {
  readonly fixtures: FullCouncilFixtures;
  readonly turn: FrozenCouncilTurn;
  readonly clock: TestClock;
  readonly missingRole?: CouncilRole;
  readonly lateRole?: CouncilRole;
  readonly withholdGuardian?: boolean;
  readonly failFirstOrdinals?: readonly number[];
  readonly reverseSameProviderFailures?: boolean;
  readonly draftAtMonotonicMs?: number;
  readonly assemblyAtMonotonicMs?: number;
}

interface RequestObservation {
  readonly options: GenerateOptions;
  readonly role: CouncilRole;
  readonly phase: 'SHARD' | 'CONDUCTOR_COMMIT';
  readonly declaredDispatchOrdinal: number;
}

/** A local-only adapter whose barrier makes a serial council wave observable. */
class CouncilScriptedAdapter extends LlmAdapter {
  readonly requests: RequestObservation[] = [];
  private readonly firstWaveOpened = deferred<void>();
  private readonly firstWaveFailures = new Set<number>();
  private readonly attemptsByOrdinal = new Map<number, number>();
  private readonly shardsByRole = new Map<CouncilRole, CouncilShard>();

  constructor(private readonly options: AdapterOptions) {
    super();
    for (const ordinal of options.failFirstOrdinals ?? []) {
      this.firstWaveFailures.add(ordinal);
    }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const role = roleOf(options);
    const phase = phaseOf(options);
    const declaredDispatchOrdinal = ordinalOf(role, phase);
    const observation = {
      options,
      role,
      phase,
      declaredDispatchOrdinal,
    } satisfies RequestObservation;
    this.requests.push(observation);

    if (phase === 'SHARD') {
      if (this.requests.filter((request) => request.phase === 'SHARD').length === 5) {
        this.firstWaveOpened.resolve();
      }
      await this.firstWaveOpened.promise;
    }

    const attempt = (this.attemptsByOrdinal.get(declaredDispatchOrdinal) ?? 0) + 1;
    this.attemptsByOrdinal.set(declaredDispatchOrdinal, attempt);
    if (
      this.firstWaveFailures.has(declaredDispatchOrdinal) &&
      attempt === 1
    ) {
      if (
        this.options.reverseSameProviderFailures &&
        declaredDispatchOrdinal === 3
      ) {
        await Promise.resolve();
      }
      throw new LlmError(
        `synthetic transport reset at dispatch ${declaredDispatchOrdinal}`,
        'TRANSPORT',
      );
    }

    if (this.options.missingRole === role) {
      yield* textResponse(`missing ${role} shard`);
      return;
    }
    if (this.options.lateRole === role) {
      this.options.clock.set(this.options.turn.deadlineAtMonotonicMs);
    }
    if (phase === 'CONDUCTOR_COMMIT' && this.options.draftAtMonotonicMs !== undefined) {
      this.options.clock.set(this.options.draftAtMonotonicMs);
    }

    if (phase === 'CONDUCTOR_COMMIT') {
      const commit = await this.commit();
      yield* toolCallResponse(
        `tool_commit_${declaredDispatchOrdinal}_${attempt}`,
        'pact_submit_conductor_commit',
        commit,
      );
      return;
    }

    const shard = await this.shard(role, options);
    this.shardsByRole.set(role, shard);
    yield* toolCallResponse(
      `tool_shard_${declaredDispatchOrdinal}_${attempt}`,
      'pact_submit_council_shard',
      shard,
    );
  }

  private async shard(role: CouncilRole, request: GenerateOptions): Promise<CouncilShard> {
    const source = this.options.fixtures.shards[role];
    const shard = structuredClone({
      ...source,
      childSessionId: String(request.sessionId),
      ...(role === 'Guardian' && this.options.withholdGuardian === true
        ? {
            content: {
              ...source.content,
              disposition: 'WITHHOLD' as const,
            },
          }
        : role === 'Guardian'
          ? {
              content: {
                ...source.content,
                contestedEvidenceIds: [],
              },
            }
        : {}),
    }) as CouncilShard;
    return shard;
  }

  private async commit(): Promise<ConductorDraftCommit> {
    const hashes = await Promise.all(roleOrder.map(async (role) => {
      const shard = this.shardsByRole.get(role);
      if (shard === undefined) throw new Error(`missing scripted ${role} shard`);
      return sha256Canonical(shard);
    }));
    const guardian = this.shardsByRole.get('Guardian');
    if (guardian?.kind !== 'GUARDIAN') throw new Error('missing scripted Guardian shard');
    return {
      schemaVersion: 'cp03-council/0.2',
      turnId: this.options.turn.snapshot.turnId,
      status: this.options.withholdGuardian === true ? 'WITHHELD' : 'PROPOSED',
      actionSequence: ['Reframe', 'Continue'],
      selectedShardHashes: hashes,
      selectedDissentIds: guardian.content.requiredDissentRecords.map(
        (record) => record.dissentId,
      ),
      terminalIntent: 'Continue',
    };
  }
}

const testRoot = (): string => {
  const root = join(tmpdir(), `pact-cp03-council-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
};

const manifestFor = (fixtures: FullCouncilFixtures): ProviderRoutingManifest =>
  fixtures.routingManifest;

const run = async (
  adapterOptions: Partial<AdapterOptions> = {},
): Promise<{ readonly result: CouncilRuntimeResult; readonly adapter: CouncilScriptedAdapter; readonly turn: FrozenCouncilTurn }> => {
  const time = clock(1_000);
  const fixtures = await createFullCouncilFixtures(time.now);
  const adapter = new CouncilScriptedAdapter({
    fixtures,
    turn: fixtures.turn,
    clock: time,
    ...adapterOptions,
  });
  const routingManifest = manifestFor(fixtures);
  const result = await runCouncilRuntime({
    runId: `council_test_${randomUUID().replaceAll('-', '')}`,
    turn: fixtures.turn,
    routingManifest,
    persistenceRoot: testRoot(),
    providerKind: 'scripted',
    now: time.now,
    mountAdapters(ctx) {
      ctx.llm.registerAdapter(
        ['deepseek-official', 'gemini-official'],
        adapter,
      );
      if (adapterOptions.assemblyAtMonotonicMs !== undefined) {
        ctx.on('session/event', (_session, event) => {
          if (event.type === 'pact/conductor-commit') {
            time.set(adapterOptions.assemblyAtMonotonicMs!);
          }
        });
      }
    },
  });
  return { result, adapter, turn: fixtures.turn };
};

const success = (result: CouncilRuntimeResult): RuntimeSuccess => {
  expect(result.status).toBe('COMPLETED');
  return result as RuntimeSuccess;
};

const failure = (result: CouncilRuntimeResult): RuntimeFailure => {
  expect(result.status).not.toBe('COMPLETED');
  return result as RuntimeFailure;
};

describe('Task 5 council-v2 critical path', () => {
  afterEach(() => {
    // Runtime owns and disposes its DSH harness; this assertion keeps the
    // adapter local and makes accidental provider work visible in failures.
  });

  it('opens all five shard streams before any scripted result is released and performs exactly six dispatches', async () => {
    const { result, adapter } = await run();
    const completed = success(result);

    expect(adapter.requests.filter((request) => request.phase === 'SHARD')).toHaveLength(5);
    expect(completed.providerRequestsMade).toBe(6);
    expect(completed.attemptRecords).toHaveLength(6);
    expect(completed.attemptRecords.map((record) => record.council.declaredDispatchOrdinal))
      .toEqual([1, 2, 3, 4, 5, 6]);
    expect(completed.selectionBarrierClosed).toBe(true);
  });

  it('records one retry slot for DeepSeek, one retry slot for Gemini, and never retries a second same-provider failure', async () => {
    const deepseekRetry = await run({ failFirstOrdinals: [3] });
    expect(success(deepseekRetry.result).providerRequestsMade).toBe(7);

    const bothProviderRetries = await run({ failFirstOrdinals: [3, 4] });
    expect(success(bothProviderRetries.result).providerRequestsMade).toBe(8);

    const secondDeepSeekFailure = await run({ failFirstOrdinals: [3, 5] });
    const failed = failure(secondDeepSeekFailure.result);
    expect(failed.providerRequestsMade).toBe(6);
    expect(failed.attemptRecords.filter((record) => record.provider === 'deepseek'))
      .toHaveLength(4);
    expect(failed.attemptRecords.filter((record) => record.attempt > 1))
      .toHaveLength(1);
  });

  it('gives the lower declared ordinal the sole retry slot when same-provider failures resolve in reverse order', async () => {
    const { result } = await run({
      failFirstOrdinals: [3, 5],
      reverseSameProviderFailures: true,
    });
    const records = failure(result).attemptRecords.filter(
      (record) => record.provider === 'deepseek',
    );
    expect(records.filter((record) => record.attempt > 1).map(
      (record) => record.council.declaredDispatchOrdinal,
    )).toEqual([3]);
  });

  it('keeps the active Conductor to two explicit turns and uses four blocked settlement sinks without opening streams', async () => {
    const { result, adapter } = await run();
    const completed = success(result);
    expect(completed.orchestration.activeConductorTurns).toBe(2);
    expect(completed.orchestration.settlementSinkTurns).toBe(4);
    expect(completed.orchestration.blockedSettlementSinkTurns).toBe(4);
    expect(completed.orchestration.undeclaredProviderStreams).toBe(0);
    expect(adapter.requests.filter((request) => request.phase === 'SHARD')).toHaveLength(5);
  });

  it('exposes only council shard/commit tools and never exposes or calls pact_submit_draft', async () => {
    const { result, adapter } = await run();
    success(result);
    expect(adapter.requests.flatMap((request) =>
      request.options.tools?.map((tool) => tool.name) ?? [],
    )).not.toContain('pact_submit_draft');
    expect(adapter.requests.every((request) =>
      (request.options.tools?.map((tool) => tool.name) ?? []).every((name) =>
        name === 'pact_submit_council_shard' ||
        name === 'pact_submit_conductor_commit'
      ),
    )).toBe(true);
    expect(result.attemptRecords.flatMap((record) => record.contract.toolCalls.map(
      (tool) => tool.name,
    ))).not.toContain('pact_submit_draft');
  });

  it('binds every attempt to role, phase, frozen snapshot, prompt hash, and declared ordinal', async () => {
    const { result, turn } = await run();
    const completed = success(result);
    expect(completed.attemptRecords.every((record: CouncilAttemptRecord) =>
      record.council.snapshotHash === turn.snapshotHash &&
      /^[a-f0-9]{64}$/.test(record.council.promptHash) &&
      record.council.declaredDispatchOrdinal >= 1 &&
      record.council.declaredDispatchOrdinal <= 6 &&
      (record.council.phase === 'SHARD' || record.council.phase === 'CONDUCTOR_COMMIT'),
    )).toBe(true);
    expect(completed.attemptRecords.map((record) => record.council.role)).toEqual([
      'CaseConductor', 'Witness', 'Archivist', 'Rewriter', 'Guardian', 'CaseConductor',
    ]);
  });

  it('uses the same route, model, and Session handle for ConductorIntent and commit', async () => {
    const { result, adapter } = await run();
    const completed = success(result);
    const conductorRequests = adapter.requests.filter(
      (request) => request.role === 'CaseConductor',
    );
    expect(conductorRequests).toHaveLength(2);
    expect(conductorRequests[0]?.options.provider).toBe(conductorRequests[1]?.options.provider);
    expect(conductorRequests[0]?.options.model).toBe(conductorRequests[1]?.options.model);
    expect(conductorRequests[0]?.options.sessionId).toBe(conductorRequests[1]?.options.sessionId);
    expect(completed.attemptRecords.filter((record) => record.council.role === 'CaseConductor'))
      .toHaveLength(2);
  });

  it('publishes the first exact Witness/Rewriter trace only after its shard durability receipt', async () => {
    const { result } = await run();
    const completed = success(result);
    expect(completed.firstPublicTrace?.role).toMatch(/Witness|Rewriter/);
    expect(completed.firstPublicTrace?.text).toBe('A bounded synthetic council contribution.');
    expect(completed.firstPublicTrace?.sourceContributionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(completed.firstPublicTrace?.durableAtMonotonicMs)
      .toBeGreaterThanOrEqual(completed.firstPublicTrace?.projectedAtMonotonicMs ?? 0);
    expect(completed.timing.firstPublicTraceAtMonotonicMs)
      .toBe(completed.firstPublicTrace?.durableAtMonotonicMs);
  });

  it('closes the selection barrier before commit and keeps a late optional output from changing the accepted draft', async () => {
    const first = success((await run()).result);
    const second = success((await run()).result);
    const stableDraftView = (draft: RuntimeSuccess['draft']) => ({
      decision: draft.decision,
      creative: draft.creative,
      materials: draft.materials,
      execution: draft.execution,
      agency: {
        ...draft.agency,
        contributions: (
          draft.agency.contributions as readonly { readonly role: string }[]
        ).map((contribution) => contribution.role),
      },
    });
    expect(stableDraftView(second.draft)).toEqual(stableDraftView(first.draft));
    expect(second.providerRequestsMade).toBe(6);
    expect(second.durableShardReceipts).toHaveLength(5);
    expect(second.durableConductorCommitReceipt.status).toBe('DURABLE');
    expect(second.selectionBarrierClosed).toBe(true);
  });

  it('does not commit or promote a draft when a required shard is missing, malformed, or late', async () => {
    const missing = failure((await run({ missingRole: 'Guardian' })).result);
    expect(missing.status).toBe('FAILED_NO_MUTATION');
    expect(missing.durableConductorCommitReceipt).toBeNull();
    expect(missing.draft).toBeNull();

    const late = failure((await run({ lateRole: 'Witness' })).result);
    expect(['FAILED_NO_MUTATION', 'LATE_QUARANTINED']).toContain(late.status);
    expect(late.durableConductorCommitReceipt).toBeNull();
    expect(late.draft).toBeNull();
    expect(late.reasonCodes.join('|')).toMatch(/late|missing|required|deadline/i);
  });

  it('records Guardian WITHHOLD without producing a current executable draft', async () => {
    const result = failure((await run({ withholdGuardian: true })).result);
    expect(result.status).toBe('WITHHELD');
    expect(result.draft).toBeNull();
    expect(result.draftHash).toBeNull();
    expect(result.durableConductorCommitReceipt).not.toBeNull();
  });

  it('reports normal 2.5/8/12-second targets from one monotonic epoch', async () => {
    const result = success((await run()).result);
    expect(result.timing).toMatchObject({
      firstPublicTraceTargetMet: true,
      requiredShardsTargetMet: true,
      conductorCommitTargetMet: true,
      draftTargetMet: true,
      hardDeadlineMet: true,
    });
    expect(result.timing.startedAtMonotonicMs).toBe(1_000);
    expect(result.timing.firstPublicTraceAtMonotonicMs)
      .toBeLessThan(result.timing.startedAtMonotonicMs + 2_500);
  });

  it('accepts a draft at 8,001ms before the hard deadline while reporting draftTargetMet false', async () => {
    const result = success((await run({ draftAtMonotonicMs: 9_001 })).result);
    expect(result.timing.draftTargetMet).toBe(false);
    expect(result.timing.hardDeadlineMet).toBe(true);
    expect(result.draft).not.toBeNull();
  });

  it('quarantines assembly at exactly 12,000ms and never promotes its draft', async () => {
    const result = failure((await run({
      draftAtMonotonicMs: 8_000,
      assemblyAtMonotonicMs: 13_000,
    })).result);
    expect(result.status).toBe('LATE_QUARANTINED');
    expect(result.draft).toBeNull();
    expect(result.draftHash).toBeNull();
    expect(result.timing.hardDeadlineMet).toBe(false);
  });
});
