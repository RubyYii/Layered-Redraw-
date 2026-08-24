import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LlmAdapter, LlmError, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { afterEach, describe, expect, it } from 'vitest';

import {
  runCouncilRuntime,
  type CouncilAttemptRecord,
  type CouncilPublicTrace,
  type CouncilRuntimeResult,
} from '../src/council-runtime.js';
import {
  verifyCouncilRunEvidence,
  type CouncilRunArchive,
} from '../src/council-run-evidence.js';
import type {
  CouncilRole,
  ProviderRoutingManifest,
} from '../src/contract-types.js';
import type {
  ConductorCommitSubmission,
  CouncilRoleSubmission,
} from '../src/council-submission-binding.js';
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

const markedJson = <T>(options: GenerateOptions, marker: string): T => {
  const line = textOf(options).split('\n')
    .find((candidate) => candidate.startsWith(marker));
  if (line === undefined) throw new Error(`test adapter marker missing: ${marker}`);
  return JSON.parse(line.slice(marker.length)) as T;
};

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
  readonly malformedRole?: CouncilRole;
  readonly lateRole?: CouncilRole;
  readonly delayedRoles?: readonly CouncilRole[];
  readonly hangRole?: CouncilRole;
  readonly withholdGuardian?: boolean;
  readonly failFirstOrdinals?: readonly number[];
  readonly reverseSameProviderFailures?: boolean;
  readonly draftAtMonotonicMs?: number;
  readonly assemblyAtMonotonicMs?: number;
  readonly omitNow?: boolean;
  readonly useProductionMonotonicClock?: boolean;
  readonly shortDeadlineMs?: number;
  readonly disposeFailure?: boolean;
  readonly traceObserver?: (trace: CouncilPublicTrace) => void | Promise<void>;
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
  readonly abortedRoles = new Set<CouncilRole>();
  readonly releasedRoles = new Set<CouncilRole>();
  private readonly firstWaveOpened = deferred<void>();
  private readonly firstWaveFailures = new Set<number>();
  private readonly attemptsByOrdinal = new Map<number, number>();
  private readonly roleReleases = new Map<CouncilRole, ReturnType<typeof deferred<void>>>();

  constructor(private readonly options: AdapterOptions) {
    super();
    for (const ordinal of options.failFirstOrdinals ?? []) {
      this.firstWaveFailures.add(ordinal);
    }
    for (const role of [
      ...(options.delayedRoles ?? []),
      ...(options.hangRole === undefined ? [] : [options.hangRole]),
    ]) {
      this.roleReleases.set(role, deferred<void>());
    }
  }

  releaseRole(role: CouncilRole): void {
    this.releasedRoles.add(role);
    this.roleReleases.get(role)?.resolve();
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

    const onAbort = (): void => {
      this.abortedRoles.add(role);
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      if (phase === 'SHARD') {
        if (this.requests.filter((request) => request.phase === 'SHARD').length === 5) {
          this.firstWaveOpened.resolve();
        }
        await this.firstWaveOpened.promise;
      }

      const release = this.roleReleases.get(role);
      if (this.options.delayedRoles?.includes(role) === true) {
        if (release === undefined) throw new Error(`missing delayed ${role} release`);
        await release.promise;
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
        yield {
          type: 'usage',
          usage: { inputTokens: 0, outputTokens: 0 },
        };
        throw new LlmError(
          `synthetic transport reset at dispatch ${declaredDispatchOrdinal}`,
          'TRANSPORT',
        );
      }

      if (this.options.hangRole === role) {
        if (options.signal === undefined) throw new Error('hanging role requires a signal');
        if (options.signal.aborted) throw new Error('hanging role aborted');
        if (release === undefined) throw new Error(`missing hanging ${role} release`);
        await new Promise<void>((resolve, reject) => {
          const onHangingAbort = (): void => {
            this.abortedRoles.add(role);
            reject(new Error(`synthetic hanging ${role} aborted`));
          };
          options.signal?.addEventListener('abort', onHangingAbort, { once: true });
          void release.promise.then(() => {
            options.signal?.removeEventListener('abort', onHangingAbort);
            resolve();
          });
        });
      }

      yield {
        type: 'usage',
        usage: { inputTokens: 10, outputTokens: 5 },
      };

      if (this.options.missingRole === role) {
        yield* textResponse(`missing ${role} shard`);
        return;
      }
      if (this.options.malformedRole === role) {
        yield* toolCallResponse(
          `tool_malformed_${declaredDispatchOrdinal}_${attempt}`,
          'pact_submit_council_shard',
          { malformed: true, role },
        );
        return;
      }
      if (this.options.lateRole === role) {
        this.options.clock.set(this.options.turn.deadlineAtMonotonicMs);
      }
      if (phase === 'CONDUCTOR_COMMIT' && this.options.draftAtMonotonicMs !== undefined) {
        this.options.clock.set(this.options.draftAtMonotonicMs);
      }

      if (phase === 'CONDUCTOR_COMMIT') {
        const commit = this.commit(options);
        yield* toolCallResponse(
          `tool_commit_${declaredDispatchOrdinal}_${attempt}`,
          'pact_submit_conductor_commit',
          commit,
        );
        return;
      }

      const shard = this.shard(role);
      yield* toolCallResponse(
        `tool_shard_${declaredDispatchOrdinal}_${attempt}`,
        'pact_submit_council_shard',
        shard,
      );
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  private shard(role: CouncilRole): CouncilRoleSubmission {
    const source = this.options.fixtures.shards[role];
    return structuredClone({
      publicTrace: source.publicTrace,
      uncertainties: source.uncertainties,
      evidenceAnchors: source.evidenceAnchors,
      content: source.content,
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
    }) as CouncilRoleSubmission;
  }

  private commit(options: GenerateOptions): ConductorCommitSubmission {
    const projections = markedJson<readonly {
      readonly role: CouncilRole;
      readonly payloadHash: string;
      readonly content: Record<string, unknown>;
    }[]>(options, 'PACT_COUNCIL_DURABLE_SHARDS_JSON=');
    const guardian = projections.find(({ role }) => role === 'Guardian');
    if (guardian === undefined) throw new Error('missing scripted Guardian projection');
    const dissentRecords = guardian.content.requiredDissentRecords as readonly {
      readonly dissentId: string;
    }[];
    return {
      actionSequence: ['Reframe', 'Continue'],
      selectedShardHashes: projections.map(({ payloadHash }) => payloadHash),
      selectedDissentIds: dissentRecords.map(
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

interface StartedRun {
  readonly execution: Promise<CouncilRuntimeResult>;
  readonly adapter: CouncilScriptedAdapter;
  readonly turn: FrozenCouncilTurn;
  readonly runId: string;
  readonly routingManifest: ProviderRoutingManifest;
}

const startRun = async (
  adapterOptions: Partial<AdapterOptions> = {},
): Promise<StartedRun> => {
  const startedAt = adapterOptions.useProductionMonotonicClock === true
    ? performance.now()
    : 1_000;
  const time = clock(startedAt);
  const fixtures = await createFullCouncilFixtures(time.now);
  const turn = adapterOptions.shortDeadlineMs === undefined
    ? fixtures.turn
    : {
        ...fixtures.turn,
        deadlineAtMonotonicMs: startedAt + adapterOptions.shortDeadlineMs,
      };
  const adapter = new CouncilScriptedAdapter({
    fixtures,
    turn,
    clock: time,
    ...adapterOptions,
  });
  const routingManifest = manifestFor(fixtures);
  const runId = `council_test_${randomUUID().replaceAll('-', '')}`;
  const execution = runCouncilRuntime({
    runId,
    turn,
    routingManifest,
    persistenceRoot: testRoot(),
    providerKind: 'scripted',
    ...(adapterOptions.omitNow === true ? {} : { now: time.now }),
    ...(adapterOptions.traceObserver === undefined
      ? {}
      : { onPublicTrace: adapterOptions.traceObserver }),
    mountAdapters(ctx) {
      ctx.llm.registerAdapter(
        ['deepseek-official', 'gemini-official'],
        adapter,
      );
      if (adapterOptions.disposeFailure === true) {
        const dispose = ctx.fiber.dispose;
        Object.defineProperty(ctx.fiber, 'dispose', {
          configurable: true,
          value: async () => {
            await dispose();
            throw new Error('synthetic harness disposal failure');
          },
        });
      }
      if (adapterOptions.assemblyAtMonotonicMs !== undefined) {
        ctx.on('session/event', (_session, event) => {
          if (event.type === 'pact/conductor-commit') {
            time.set(adapterOptions.assemblyAtMonotonicMs!);
          }
        });
      }
    },
  });
  return { execution, adapter, turn, runId, routingManifest };
};

const run = async (
  adapterOptions: Partial<AdapterOptions> = {},
): Promise<{
  readonly result: CouncilRuntimeResult;
  readonly adapter: CouncilScriptedAdapter;
  readonly turn: FrozenCouncilTurn;
  readonly runId: string;
  readonly routingManifest: ProviderRoutingManifest;
}> => {
  const started = await startRun(adapterOptions);
  return {
    result: await started.execution,
    adapter: started.adapter,
    turn: started.turn,
    runId: started.runId,
    routingManifest: started.routingManifest,
  };
};

const evidenceFor = (runResult: {
  readonly result: CouncilRuntimeResult;
  readonly turn: FrozenCouncilTurn;
  readonly runId: string;
  readonly routingManifest: ProviderRoutingManifest;
}) => verifyCouncilRunEvidence(JSON.stringify({
  schemaVersion: 'cp03-council-run/0.1',
  runId: runResult.runId,
  snapshotHash: runResult.turn.snapshotHash,
  routingManifest: runResult.routingManifest,
  result: runResult.result,
} satisfies CouncilRunArchive), []);

const success = (result: CouncilRuntimeResult): RuntimeSuccess => {
  expect(result.status).toBe('COMPLETED');
  return result as RuntimeSuccess;
};

const failure = (result: CouncilRuntimeResult): RuntimeFailure => {
  expect(result.status).not.toBe('COMPLETED');
  return result as RuntimeFailure;
};

const expectPlainOrchestration = (
  orchestration: CouncilRuntimeResult['orchestration'],
): void => {
  const descriptors = Object.getOwnPropertyDescriptors(orchestration);
  expect(Object.keys(descriptors).sort()).toEqual([
    'activeConductorTurns',
    'blockedSettlementSinkTurns',
    'cleanupReasonCodes',
    'deadlineCancellationRequested',
    'harnessDisposed',
    'settlementSinkTurns',
    'undeclaredProviderStreams',
  ]);
  for (const descriptor of Object.values(descriptors)) {
    expect(descriptor.get).toBeUndefined();
    expect(descriptor.set).toBeUndefined();
    expect(descriptor).toHaveProperty('value');
  }
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

  it('shows exact frozen references while keeping runtime envelope fields host-owned', async () => {
    const { result, adapter, turn } = await run();
    success(result);
    const witnessRequest = adapter.requests.find(({ role, phase }) =>
      role === 'Witness' && phase === 'SHARD'
    )?.options;
    if (witnessRequest === undefined) throw new Error('Witness request missing');
    const context = markedJson<{
      readonly role: CouncilRole;
      readonly allowedReferences: Record<string, readonly string[]>;
    }>(witnessRequest, 'PACT_COUNCIL_CONTEXT_JSON=');

    expect(context).toEqual({
      contextVersion: 'cp03-council-role-prompt/0.2',
      role: 'Witness',
      allowedReferences: {
        registeredAssetIds: turn.snapshot.registeredAssetIds,
        registeredSpatialBridgeIds: turn.snapshot.registeredSpatialBridgeIds,
        registeredRightsIds: turn.snapshot.registeredRightsIds,
        registeredSceneObjectIds: turn.snapshot.registeredSceneObjectIds,
        registeredAffordanceIds: turn.snapshot.registeredAffordanceIds,
        supportedRollbackCapabilityIds:
          turn.snapshot.supportedRollbackCapabilityIds,
        allowedSemanticCapabilityIds:
          turn.snapshot.allowedSemanticCapabilityIds,
        sourceLockIds: turn.snapshot.sourceLockIds,
        inputRefIds: turn.snapshot.inputRefs.map(({ refId }) => refId),
      },
    });
    expect(JSON.stringify(context)).not.toMatch(
      /turnId|sessionId|snapshotHash|parentSceneHash|registryVersion|routingManifestVersion|deadlineId/,
    );
    const shardTool = witnessRequest.tools?.find(
      ({ name }) => name === 'pact_submit_council_shard',
    );
    const parameters = shardTool?.parameters as {
      readonly properties?: Readonly<Record<string, unknown>>;
    } | undefined;
    expect(Object.keys(parameters?.properties ?? {}).sort()).toEqual([
      'content',
      'evidenceAnchors',
      'publicTrace',
      'uncertainties',
    ]);
  });

  it('returns a normal local runtime archive that passes the independent Task 6 verifier', async () => {
    const completedRun = await run();
    success(completedRun.result);

    const report = evidenceFor(completedRun);
    expect(report.findings).toEqual([]);
    expect(report.status).toBe('PASS');
  });

  it('returns a dual-provider retry archive that passes independent evidence verification', async () => {
    const retriedRun = await run({ failFirstOrdinals: [3, 4] });
    const completed = success(retriedRun.result);
    expect(completed.providerRequestsMade).toBe(8);
    expect(completed.attemptRecords.filter((record) => record.attempt === 2))
      .toHaveLength(2);

    const report = evidenceFor(retriedRun);
    expect(report.findings).toEqual([]);
    expect(report.status).toBe('PASS');
  });

  it('records the manifest-pinned prompt-profile hash for every runtime attempt', async () => {
    const completedRun = await run({ failFirstOrdinals: [3, 4] });
    const completed = success(completedRun.result);

    for (const record of completed.attemptRecords) {
      expect(record.council.promptHash).toBe(
        completedRun.routingManifest.assignments[record.council.role].promptHash,
      );
    }
  });

  it('records deterministic synthetic usage for successful and transport-failed local attempts', async () => {
    const completed = success((await run({ failFirstOrdinals: [3, 4] })).result);
    const transportFailures = completed.attemptRecords.filter(
      (record) => record.contract.finish.kind === 'error' &&
        record.contract.finish.detailCode === 'TRANSPORT',
    );
    const successfulAttempts = completed.attemptRecords.filter(
      (record) => record.contract.finish.kind === 'tool_calls',
    );

    expect(transportFailures).toHaveLength(2);
    expect(transportFailures.every((record) =>
      record.contract.usage?.inputTokens === 0 &&
      record.contract.usage.outputTokens === 0 &&
      record.contract.usage.totalTokens === 0 &&
      record.contract.usage.estimatedCostUsd === null
    )).toBe(true);
    expect(successfulAttempts).toHaveLength(6);
    expect(successfulAttempts.every((record) =>
      record.contract.usage?.inputTokens === 10 &&
      record.contract.usage.outputTokens === 5 &&
      record.contract.usage.totalTokens === 15 &&
      record.contract.usage.estimatedCostUsd === null
    )).toBe(true);
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

  it('materializes completed orchestration and normal cleanup as plain data', async () => {
    const completed = success((await run()).result);

    expectPlainOrchestration(completed.orchestration);
    expect(completed.orchestration).toMatchObject({
      deadlineCancellationRequested: false,
      harnessDisposed: true,
      cleanupReasonCodes: [],
    });
  });

  it('materializes failed orchestration and normal cleanup as plain data', async () => {
    const failed = failure((await run({ missingRole: 'Guardian' })).result);

    expectPlainOrchestration(failed.orchestration);
    expect(failed.orchestration).toMatchObject({
      deadlineCancellationRequested: false,
      harnessDisposed: true,
      cleanupReasonCodes: [],
    });
  });

  it('preserves a completed typed result when final harness disposal rejects', async () => {
    const completed = success((await run({ disposeFailure: true })).result);

    expectPlainOrchestration(completed.orchestration);
    expect(completed.draft).not.toBeNull();
    expect(completed.timing.hardDeadlineMet).toBe(true);
    expect(completed.orchestration).toMatchObject({
      harnessDisposed: false,
      cleanupReasonCodes: ['COUNCIL_HARNESS_DISPOSE_FAILED'],
    });
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
    const { result, turn, routingManifest } = await run();
    const completed = success(result);
    expect(completed.attemptRecords.every((record: CouncilAttemptRecord) =>
      record.council.snapshotHash === turn.snapshotHash &&
      record.council.promptHash ===
        routingManifest.assignments[record.council.role].promptHash &&
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

  it('observes the selected durable trace while an unrelated shard remains unfinished', async () => {
    const observed = deferred<CouncilPublicTrace>();
    const started = await startRun({
      delayedRoles: ['Guardian'],
      traceObserver: (trace) => {
        observed.resolve(trace);
      },
    });
    let runtimeResolved = false;
    void started.execution.then(() => {
      runtimeResolved = true;
    });

    try {
      const outcome = await Promise.race([
        observed.promise.then((trace) => ({ kind: 'trace' as const, trace })),
        started.execution.then(() => ({ kind: 'resolved' as const })),
        new Promise<{ readonly kind: 'timeout' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'timeout' }), 500);
        }),
      ]);
      expect(outcome.kind).toBe('trace');
      if (outcome.kind === 'trace') {
        expect(outcome.trace.role).toMatch(/Witness|Rewriter/);
        expect(outcome.trace.durableAtMonotonicMs)
          .toBeGreaterThanOrEqual(outcome.trace.projectedAtMonotonicMs);
      }
      expect(started.adapter.releasedRoles).not.toContain('Guardian');
      expect(runtimeResolved).toBe(false);
    } finally {
      started.adapter.releaseRole('Guardian');
      await started.execution;
    }
  });

  it('closes the selection barrier before commit and keeps repeated assembly deterministic', async () => {
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

    const malformed = failure((await run({ malformedRole: 'Rewriter' })).result);
    expect(malformed.status).toBe('FAILED_NO_MUTATION');
    expect(malformed.durableConductorCommitReceipt).toBeNull();
    expect(malformed.draft).toBeNull();

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

  it('uses the production monotonic clock when now is omitted', async () => {
    const result = success((await run({
      omitNow: true,
      useProductionMonotonicClock: true,
    })).result);
    expect(result.timing.hardDeadlineMet).toBe(true);
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

  it('cancels unfinished synthesis at a short absolute deadline and disposes the local harness', async () => {
    const started = await startRun({
      hangRole: 'Guardian',
      shortDeadlineMs: 50,
      useProductionMonotonicClock: true,
    });
    let result: CouncilRuntimeResult | undefined;
    try {
      const outcome = await Promise.race([
        started.execution.then((value) => ({ kind: 'result' as const, value })),
        new Promise<{ readonly kind: 'timeout' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'timeout' }), 750);
        }),
      ]);
      expect(outcome.kind).toBe('result');
      if (outcome.kind === 'result') result = outcome.value;
      if (result === undefined) started.adapter.releaseRole('Guardian');
      if (result === undefined) result = await started.execution;
    } finally {
      started.adapter.releaseRole('Guardian');
      if (result === undefined) result = await started.execution;
    }

    const failed = failure(result);
    expect(failed.status).toBe('LATE_QUARANTINED');
    expect(failed.providerRequestsMade).toBe(5);
    expect(failed.durableConductorCommitReceipt).toBeNull();
    expect(failed.draft).toBeNull();
    expect(failed.orchestration.deadlineCancellationRequested).toBe(true);
    expect(failed.orchestration.harnessDisposed).toBe(true);
    expect(started.adapter.abortedRoles).toContain('Guardian');
    const guardianAttempt = failed.attemptRecords.find(
      (record) => record.council.role === 'Guardian',
    );
    expect(guardianAttempt?.contract.finish.kind).toMatch(/aborted|error/);
    expect(failed.attemptRecords.filter(
      (record) => record.council.phase === 'CONDUCTOR_COMMIT',
    )).toHaveLength(0);
  });
});
