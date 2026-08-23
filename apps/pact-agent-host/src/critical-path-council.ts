import { createHash } from 'node:crypto';

import type { AgentActionDraft } from './contract-types.js';

export const COUNCIL_ROLE_ORDER = [
  'ConductorIntent',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
] as const;

export type CouncilRole = typeof COUNCIL_ROLE_ORDER[number];
export type GuardianDisposition = 'ALLOW' | 'NEEDS_CLARIFICATION' | 'WITHHOLD';

export interface CouncilTurnSnapshot {
  readonly schemaVersion: 'pact-cp03-turn-snapshot/0.1';
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly parentSceneHash: string;
  readonly registryVersion: string;
  readonly capabilityEnvelopeHash: string;
  readonly actionStateHash: string;
  readonly routingManifestVersion: string;
  readonly epochMonotonicMs: number;
  readonly deadlineMonotonicMs: number;
  readonly inputClasses: readonly ('text' | 'image' | 'audio' | 'scene')[];
  readonly requiredRoles: readonly CouncilRole[];
}

export interface ShardBinding {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly parentSceneHash: string;
  readonly registryVersion: string;
  readonly capabilityEnvelopeHash: string;
  readonly actionStateHash: string;
  readonly routingManifestVersion: string;
  readonly deadlineMonotonicMs: number;
}

interface ShardBase<R extends CouncilRole, P> {
  readonly schemaVersion: 'pact-cp03-council-shard/0.1';
  readonly role: R;
  readonly childSessionId: string;
  readonly binding: ShardBinding;
  readonly publicTrace: string;
  readonly payload: P;
}

export type ConductorIntentShard = ShardBase<'ConductorIntent', {
  readonly interpretation: string;
  readonly candidateActionSequence: readonly string[];
  readonly terminalIntent: string;
  readonly relevantRoles: readonly CouncilRole[];
}>;

export type WitnessShard = ShardBase<'Witness', {
  readonly observations: readonly string[];
  readonly uncertainties: readonly string[];
  readonly evidenceAnchors: readonly string[];
}>;

export type ArchivistShard = ShardBase<'Archivist', {
  readonly assetReferences: readonly {
    readonly id: string;
    readonly source: string;
    readonly licence: string;
    readonly registryVersion: string;
  }[];
  readonly unavailableReferences: readonly string[];
  readonly provenanceNotes: readonly string[];
}>;

export type RewriterShard = ShardBase<'Rewriter', {
  readonly spatial: Readonly<Record<string, unknown>>;
  readonly visual: Readonly<Record<string, unknown>>;
  readonly camera: Readonly<Record<string, unknown>>;
  readonly light: Readonly<Record<string, unknown>>;
  readonly sound: Readonly<Record<string, unknown>>;
  readonly poeticText: string;
  readonly semanticCapabilityIds: readonly string[];
  readonly expectedChanges: readonly string[];
}>;

export interface GuardianDissent {
  readonly id: string;
  readonly text: string;
}

export type GuardianShard = ShardBase<'Guardian', {
  readonly disposition: GuardianDisposition;
  readonly forbiddenCapabilityIds: readonly string[];
  readonly requiredSourceLocks: readonly string[];
  readonly requiredRightsConditions: readonly string[];
  readonly requiredRollbackCapabilities: readonly string[];
  readonly contestedEvidenceIds: readonly string[];
  readonly dissent: readonly GuardianDissent[];
  readonly publicChallenge: string;
}>;

export type CouncilShard = ConductorIntentShard | WitnessShard | ArchivistShard | RewriterShard | GuardianShard;

export interface DurableCouncilShard {
  readonly role: CouncilRole;
  readonly hash: string;
  readonly acceptanceSequence: number;
  readonly acceptedAtMonotonicMs: number;
  readonly shard: CouncilShard;
}

export interface ConductorDraftCommit {
  readonly schemaVersion: 'pact-cp03-conductor-commit/0.1';
  readonly turnId: string;
  readonly status: 'PROPOSED' | 'NEEDS_CLARIFICATION' | 'WITHHELD';
  readonly actionSequence: readonly string[];
  readonly selectedShardHashes: readonly string[];
  readonly selectedDissentIds: readonly string[];
  readonly terminalIntent: string;
}

export interface CouncilShardDispatchRequest {
  readonly role: CouncilRole;
  readonly snapshot: CouncilTurnSnapshot;
  readonly plannedOrdinal: number;
  readonly sentOrdinal: number;
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly signal: AbortSignal;
}

export interface CouncilCommitDispatchRequest {
  readonly snapshot: CouncilTurnSnapshot;
  readonly shards: readonly DurableCouncilShard[];
  readonly plannedOrdinal: 6;
  readonly sentOrdinal: number;
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly signal: AbortSignal;
}

export interface CouncilProviderAdapter {
  dispatchShard(request: CouncilShardDispatchRequest): Promise<CouncilShard>;
  dispatchCommit(request: CouncilCommitDispatchRequest): Promise<ConductorDraftCommit>;
}

export interface CouncilDurabilityEvent {
  readonly kind: 'dispatch-declared' | 'shard-accepted' | 'public-trace' | 'commit-accepted' | 'draft-assembled' | 'quarantined';
  readonly atMonotonicMs: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface CouncilDurability {
  append(event: CouncilDurabilityEvent): Promise<void>;
  flush(): Promise<void>;
}

export interface CouncilDispatchRecord {
  readonly kind: 'shard' | 'commit';
  readonly role: CouncilRole | 'ConductorCommit';
  readonly plannedOrdinal: number;
  readonly sentOrdinal: number;
  readonly attempt: number;
  readonly provider: string;
  readonly startedAtMonotonicMs: number;
  readonly endedAtMonotonicMs: number;
  readonly outcome: 'ACCEPTED' | 'FAILED' | 'LATE_QUARANTINED';
  readonly code: string | null;
}

export interface CouncilTiming {
  readonly firstDurableTraceMs: number | null;
  readonly allRequiredDurableMs: number;
  readonly commitAcceptedMs: number;
  readonly assemblyMs: number;
  readonly draftAcceptedMs: number;
  readonly firstTraceTargetMet: boolean | null;
  readonly requiredShardsSoftTargetMet: boolean;
  readonly commitSoftTargetMet: boolean;
  readonly assemblyTargetMet: boolean;
  readonly draftTargetMet: boolean;
  readonly hardDeadlineMet: boolean;
}

interface CouncilResultBase {
  readonly snapshot: CouncilTurnSnapshot;
  readonly dispatches: readonly CouncilDispatchRecord[];
  readonly plannedDispatches: 6;
  readonly maximumDispatches: 8;
  readonly sentDispatches: number;
  readonly trace: null | {
    readonly role: 'Witness' | 'Rewriter';
    readonly text: string;
    readonly sourceHash: string;
    readonly acceptanceSequence: number;
    readonly provisional: true;
  };
}

export interface CouncilSuccessResult extends CouncilResultBase {
  readonly status: 'PROPOSED' | 'NEEDS_CLARIFICATION' | 'WITHHELD';
  readonly shards: readonly DurableCouncilShard[];
  readonly commit: ConductorDraftCommit;
  readonly draft: AgentActionDraft;
  readonly draftHash: string;
  readonly timing: CouncilTiming;
}

export interface CouncilFailureResult extends CouncilResultBase {
  readonly status: 'FAILED_NO_MUTATION' | 'LATE_QUARANTINED';
  readonly code: string;
  readonly message: string;
  readonly shards: readonly DurableCouncilShard[];
  readonly draft: null;
}

export type CouncilRunResult = CouncilSuccessResult | CouncilFailureResult;

export class CouncilTransportError extends Error {
  override readonly name = 'CouncilTransportError';

  constructor(
    readonly provider: string,
    readonly preSideEffect: boolean,
    readonly sideEffectAccepted: boolean,
    message: string,
  ) {
    super(message);
  }
}

export class InMemoryCouncilDurability implements CouncilDurability {
  readonly events: CouncilDurabilityEvent[] = [];
  flushCount = 0;

  async append(event: CouncilDurabilityEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async flush(): Promise<void> {
    this.flushCount += 1;
  }
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
};

export const councilCanonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));
export const councilSha256 = (value: unknown): string => createHash('sha256')
  .update(councilCanonicalJson(value), 'utf8')
  .digest('hex');

export const bindingForSnapshot = (snapshot: CouncilTurnSnapshot): ShardBinding => ({
  caseSessionId: snapshot.caseSessionId,
  turnId: snapshot.turnId,
  parentSceneHash: snapshot.parentSceneHash,
  registryVersion: snapshot.registryVersion,
  capabilityEnvelopeHash: snapshot.capabilityEnvelopeHash,
  actionStateHash: snapshot.actionStateHash,
  routingManifestVersion: snapshot.routingManifestVersion,
  deadlineMonotonicMs: snapshot.deadlineMonotonicMs,
});

const bindingMatches = (binding: ShardBinding, snapshot: CouncilTurnSnapshot): boolean =>
  councilCanonicalJson(binding) === councilCanonicalJson(bindingForSnapshot(snapshot));

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const uniqueNonEmpty = (value: readonly string[]): boolean => value.length > 0
  && new Set(value).size === value.length
  && value.every(nonEmpty);

const validateShard = (shard: CouncilShard, role: CouncilRole, snapshot: CouncilTurnSnapshot): void => {
  if (shard.schemaVersion !== 'pact-cp03-council-shard/0.1') throw new Error('SHARD_SCHEMA_INVALID');
  if (shard.role !== role) throw new Error('SHARD_ROLE_MISMATCH');
  if (!nonEmpty(shard.childSessionId) || !bindingMatches(shard.binding, snapshot)) throw new Error('SHARD_BINDING_STALE');
  if (!nonEmpty(shard.publicTrace)) throw new Error('SHARD_PUBLIC_TRACE_MISSING');
  switch (shard.role) {
    case 'ConductorIntent':
      if (!nonEmpty(shard.payload.interpretation)
        || !uniqueNonEmpty(shard.payload.candidateActionSequence)
        || !nonEmpty(shard.payload.terminalIntent)
        || !uniqueNonEmpty(shard.payload.relevantRoles)) throw new Error('CONDUCTOR_INTENT_INVALID');
      break;
    case 'Witness':
      if (!uniqueNonEmpty(shard.payload.observations)
        || !uniqueNonEmpty(shard.payload.evidenceAnchors)) throw new Error('WITNESS_SHARD_INVALID');
      break;
    case 'Archivist':
      if (!shard.payload.assetReferences.every((entry) => (
        nonEmpty(entry.id) && nonEmpty(entry.source) && nonEmpty(entry.licence)
        && entry.registryVersion === snapshot.registryVersion
      ))) throw new Error('ARCHIVIST_REFERENCE_INVALID');
      break;
    case 'Rewriter':
      if (!nonEmpty(shard.payload.poeticText)
        || !uniqueNonEmpty(shard.payload.semanticCapabilityIds)
        || !uniqueNonEmpty(shard.payload.expectedChanges)) throw new Error('REWRITER_SHARD_INVALID');
      break;
    case 'Guardian':
      if (!['ALLOW', 'NEEDS_CLARIFICATION', 'WITHHOLD'].includes(shard.payload.disposition)
        || !nonEmpty(shard.payload.publicChallenge)
        || !shard.payload.dissent.every((entry) => nonEmpty(entry.id) && nonEmpty(entry.text))
        || new Set(shard.payload.dissent.map((entry) => entry.id)).size !== shard.payload.dissent.length) {
        throw new Error('GUARDIAN_SHARD_INVALID');
      }
      break;
  }
}

const publicTraceFor = (shards: readonly DurableCouncilShard[]) => {
  const source = shards
    .filter((entry): entry is DurableCouncilShard & { readonly role: 'Witness' | 'Rewriter' } =>
      entry.role === 'Witness' || entry.role === 'Rewriter')
    .sort((left, right) => left.acceptanceSequence - right.acceptanceSequence)[0];
  return source === undefined ? null : {
    role: source.role,
    text: source.shard.publicTrace,
    sourceHash: source.hash,
    acceptanceSequence: source.acceptanceSequence,
    provisional: true as const,
  };
};

const failureCode = (reason: unknown): string => reason instanceof Error
  ? reason.message.replaceAll(/[^A-Z0-9_]/gi, '_').toUpperCase().slice(0, 96)
  : 'COUNCIL_DISPATCH_FAILED';

export interface RunCriticalPathCouncilOptions {
  readonly snapshot: CouncilTurnSnapshot;
  readonly adapter: CouncilProviderAdapter;
  readonly durability: CouncilDurability;
  readonly providerForRole: Readonly<Record<CouncilRole | 'ConductorCommit', string>>;
  readonly now?: () => number;
}

export async function runCriticalPathCouncil(options: RunCriticalPathCouncilOptions): Promise<CouncilRunResult> {
  const now = options.now ?? performance.now.bind(performance);
  const snapshot = deepFreeze(structuredClone(options.snapshot));
  const dispatches: CouncilDispatchRecord[] = [];
  const accepted = new Map<CouncilRole, DurableCouncilShard>();
  const retryUsed = new Set<string>();
  let sentDispatches = 0;
  let acceptanceSequence = 0;
  let acceptanceQueue = Promise.resolve();
  const controllers = new Set<AbortController>();
  const awaitBeforeDeadline = async <T>(operation: Promise<T>, controller: AbortController): Promise<T> => {
    const remainingMs = snapshot.deadlineMonotonicMs - now();
    if (remainingMs <= 0) {
      controller.abort();
      throw new Error('COUNCIL_DEADLINE_EXCEEDED');
    }
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      deadlineTimer = setTimeout(() => {
        controller.abort();
        reject(new Error('COUNCIL_DEADLINE_EXCEEDED'));
      }, Math.max(1, Math.ceil(remainingMs)));
    });
    try {
      return await Promise.race([operation, deadline]);
    } finally {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    }
  };
  const base = () => ({
    snapshot,
    dispatches: [...dispatches],
    plannedDispatches: 6 as const,
    maximumDispatches: 8 as const,
    sentDispatches,
    trace: publicTraceFor([...accepted.values()]),
  });
  const fail = (status: CouncilFailureResult['status'], code: string, message: string): CouncilFailureResult => ({
    ...base(), status, code, message, shards: [...accepted.values()], draft: null,
  });
  if (snapshot.schemaVersion !== 'pact-cp03-turn-snapshot/0.1'
    || snapshot.deadlineMonotonicMs <= snapshot.epochMonotonicMs
    || snapshot.requiredRoles.length !== COUNCIL_ROLE_ORDER.length
    || new Set(snapshot.requiredRoles).size !== snapshot.requiredRoles.length
    || COUNCIL_ROLE_ORDER.some((role) => !snapshot.requiredRoles.includes(role))) {
    return fail('FAILED_NO_MUTATION', 'TURN_SNAPSHOT_INVALID', 'The immutable turn snapshot is invalid.');
  }

  const declarationTime = now();
  for (const [index, role] of COUNCIL_ROLE_ORDER.entries()) {
    await options.durability.append({
      kind: 'dispatch-declared',
      atMonotonicMs: declarationTime,
      payload: { role, plannedOrdinal: index + 1, provider: options.providerForRole[role] },
    });
  }
  await options.durability.append({
    kind: 'dispatch-declared',
    atMonotonicMs: declarationTime,
    payload: { role: 'ConductorCommit', plannedOrdinal: 6, provider: options.providerForRole.ConductorCommit },
  });
  await options.durability.flush();

  const acceptShard = async (role: CouncilRole, shard: CouncilShard, acceptedAt: number): Promise<DurableCouncilShard> => {
    let resolveAccepted!: (value: DurableCouncilShard) => void;
    let rejectAccepted!: (reason: unknown) => void;
    const result = new Promise<DurableCouncilShard>((resolve, reject) => {
      resolveAccepted = resolve;
      rejectAccepted = reject;
    });
    acceptanceQueue = acceptanceQueue.then(async () => {
      try {
        if (acceptedAt >= snapshot.deadlineMonotonicMs) throw new Error('SHARD_LATE_QUARANTINED');
        validateShard(shard, role, snapshot);
        if (accepted.has(role)) throw new Error('SHARD_DUPLICATE');
        const durable: DurableCouncilShard = deepFreeze({
          role,
          hash: councilSha256(shard),
          acceptanceSequence: ++acceptanceSequence,
          acceptedAtMonotonicMs: acceptedAt,
          shard: structuredClone(shard),
        });
        await options.durability.append({
          kind: 'shard-accepted',
          atMonotonicMs: acceptedAt,
          payload: { role, hash: durable.hash, acceptanceSequence: durable.acceptanceSequence },
        });
        if (role === 'Witness' || role === 'Rewriter') {
          await options.durability.append({
            kind: 'public-trace',
            atMonotonicMs: acceptedAt,
            payload: {
              role,
              text: shard.publicTrace,
              sourceHash: durable.hash,
              acceptanceSequence: durable.acceptanceSequence,
              provisional: true,
            },
          });
        }
        await options.durability.flush();
        accepted.set(role, durable);
        resolveAccepted(durable);
      } catch (error) {
        rejectAccepted(error);
      }
    });
    return result;
  };

  const dispatchShard = async (role: CouncilRole, plannedOrdinal: number, attempt: number): Promise<DurableCouncilShard> => {
    if (sentDispatches >= 8) throw new Error('DISPATCH_BUDGET_EXHAUSTED');
    if (now() >= snapshot.deadlineMonotonicMs) throw new Error('COUNCIL_DEADLINE_EXCEEDED');
    const sentOrdinal = ++sentDispatches;
    const startedAt = now();
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const shard = await awaitBeforeDeadline(options.adapter.dispatchShard({
        role,
        snapshot,
        plannedOrdinal,
        sentOrdinal,
        attempt,
        idempotencyKey: councilSha256({ snapshot, role, plannedOrdinal }),
        provider: options.providerForRole[role],
        signal: controller.signal,
      }), controller);
      const endedAt = now();
      const durable = await acceptShard(role, shard, endedAt);
      dispatches.push({
        kind: 'shard', role, plannedOrdinal, sentOrdinal, attempt,
        provider: options.providerForRole[role], startedAtMonotonicMs: startedAt,
        endedAtMonotonicMs: endedAt, outcome: 'ACCEPTED', code: null,
      });
      return durable;
    } catch (error) {
      const endedAt = now();
      const code = controller.signal.aborted ? 'COUNCIL_DEADLINE_EXCEEDED' : failureCode(error);
      const late = endedAt >= snapshot.deadlineMonotonicMs || code.includes('LATE') || code.includes('DEADLINE');
      dispatches.push({
        kind: 'shard', role, plannedOrdinal, sentOrdinal, attempt,
        provider: options.providerForRole[role], startedAtMonotonicMs: startedAt,
        endedAtMonotonicMs: endedAt, outcome: late ? 'LATE_QUARANTINED' : 'FAILED', code,
      });
      if (late) {
        await options.durability.append({
          kind: 'quarantined', atMonotonicMs: endedAt,
          payload: { role, plannedOrdinal, reason: 'late' },
        });
        await options.durability.flush();
      }
      throw error;
    } finally {
      controllers.delete(controller);
    }
  };

  const initial = COUNCIL_ROLE_ORDER.map((role, index) => dispatchShard(role, index + 1, 1));
  const settled = await Promise.allSettled(initial);
  const failures = settled.flatMap((entry, index) => entry.status === 'rejected'
    ? [{ role: COUNCIL_ROLE_ORDER[index]!, plannedOrdinal: index + 1, reason: entry.reason as unknown }]
    : []);
  const retryableByProvider = new Map<string, typeof failures[number]>();
  for (const failure of failures) {
    if (!(failure.reason instanceof CouncilTransportError)
      || !failure.reason.preSideEffect
      || failure.reason.sideEffectAccepted) continue;
    const previous = retryableByProvider.get(failure.reason.provider);
    if (previous === undefined || failure.plannedOrdinal < previous.plannedOrdinal) {
      retryableByProvider.set(failure.reason.provider, failure);
    }
  }
  const retryResults = await Promise.allSettled([...retryableByProvider.entries()].map(async ([provider, failure]) => {
    if (retryUsed.has(provider)) throw failure.reason;
    retryUsed.add(provider);
    return dispatchShard(failure.role, failure.plannedOrdinal, 2);
  }));
  const retryRoles = new Set([...retryableByProvider.values()].map((entry) => entry.role));
  const unrecovered = failures.filter((failure) => !retryRoles.has(failure.role) || !accepted.has(failure.role));
  for (const [index, retry] of retryResults.entries()) {
    if (retry.status === 'rejected') {
      const role = [...retryableByProvider.values()][index]?.role;
      if (role !== undefined && !unrecovered.some((entry) => entry.role === role)) {
        unrecovered.push({ role, plannedOrdinal: COUNCIL_ROLE_ORDER.indexOf(role) + 1, reason: retry.reason });
      }
    }
  }
  if (unrecovered.length > 0 || snapshot.requiredRoles.some((role) => !accepted.has(role))) {
    controllers.forEach((controller) => controller.abort());
    const late = dispatches.some((entry) => entry.outcome === 'LATE_QUARANTINED') || now() >= snapshot.deadlineMonotonicMs;
    return fail(late ? 'LATE_QUARANTINED' : 'FAILED_NO_MUTATION',
      late ? 'REQUIRED_SHARD_LATE' : 'REQUIRED_SHARD_MISSING',
      `Required council roles were not durable: ${snapshot.requiredRoles.filter((role) => !accepted.has(role)).join(', ')}`);
  }

  const shards = [...accepted.values()].sort((left, right) => left.acceptanceSequence - right.acceptanceSequence);
  const commitStartedAt = now();
  if (commitStartedAt >= snapshot.deadlineMonotonicMs || sentDispatches >= 8) {
    return fail('LATE_QUARANTINED', 'COMMIT_DEADLINE_EXCEEDED', 'The minimal Conductor commit could not start before the hard deadline.');
  }
  const commitSentOrdinal = ++sentDispatches;
  const commitController = new AbortController();
  controllers.add(commitController);
  let commit: ConductorDraftCommit;
  try {
    commit = await awaitBeforeDeadline(options.adapter.dispatchCommit({
      snapshot,
      shards,
      plannedOrdinal: 6,
      sentOrdinal: commitSentOrdinal,
      idempotencyKey: councilSha256({ snapshot, role: 'ConductorCommit', plannedOrdinal: 6 }),
      provider: options.providerForRole.ConductorCommit,
      signal: commitController.signal,
    }), commitController);
  } catch (error) {
    const endedAt = now();
    const code = commitController.signal.aborted ? 'COUNCIL_DEADLINE_EXCEEDED' : failureCode(error);
    const late = endedAt >= snapshot.deadlineMonotonicMs || code.includes('DEADLINE');
    dispatches.push({
      kind: 'commit', role: 'ConductorCommit', plannedOrdinal: 6, sentOrdinal: commitSentOrdinal,
      attempt: 1, provider: options.providerForRole.ConductorCommit,
      startedAtMonotonicMs: commitStartedAt, endedAtMonotonicMs: endedAt,
      outcome: late ? 'LATE_QUARANTINED' : 'FAILED', code,
    });
    return fail(
      late ? 'LATE_QUARANTINED' : 'FAILED_NO_MUTATION',
      late ? 'CONDUCTOR_COMMIT_DEADLINE_EXCEEDED' : 'CONDUCTOR_COMMIT_FAILED',
      late ? 'The minimal Conductor commit exceeded the hard deadline.' : 'The minimal Conductor commit failed.',
    );
  } finally {
    controllers.delete(commitController);
  }
  const commitAcceptedAt = now();
  if (commitAcceptedAt >= snapshot.deadlineMonotonicMs) {
    dispatches.push({
      kind: 'commit', role: 'ConductorCommit', plannedOrdinal: 6, sentOrdinal: commitSentOrdinal,
      attempt: 1, provider: options.providerForRole.ConductorCommit,
      startedAtMonotonicMs: commitStartedAt, endedAtMonotonicMs: commitAcceptedAt,
      outcome: 'LATE_QUARANTINED', code: 'COMMIT_LATE_QUARANTINED',
    });
    return fail('LATE_QUARANTINED', 'COMMIT_LATE_QUARANTINED', 'The minimal Conductor commit arrived at or after the hard deadline.');
  }
  dispatches.push({
    kind: 'commit', role: 'ConductorCommit', plannedOrdinal: 6, sentOrdinal: commitSentOrdinal,
    attempt: 1, provider: options.providerForRole.ConductorCommit,
    startedAtMonotonicMs: commitStartedAt, endedAtMonotonicMs: commitAcceptedAt,
    outcome: 'ACCEPTED', code: null,
  });

  const byRole = new Map(shards.map((entry) => [entry.role, entry]));
  const selected = new Set(commit.selectedShardHashes);
  const knownHashes = new Set(shards.map((entry) => entry.hash));
  const guardian = byRole.get('Guardian')?.shard as GuardianShard | undefined;
  const intent = byRole.get('ConductorIntent')?.shard as ConductorIntentShard | undefined;
  const witness = byRole.get('Witness')?.shard as WitnessShard | undefined;
  const archivist = byRole.get('Archivist')?.shard as ArchivistShard | undefined;
  const rewriter = byRole.get('Rewriter')?.shard as RewriterShard | undefined;
  const requiredHashes = snapshot.requiredRoles.map((role) => byRole.get(role)?.hash).filter(nonEmpty);
  const dissentIds = guardian?.payload.dissent.map((entry) => entry.id) ?? [];
  const commitInvalid = commit.schemaVersion !== 'pact-cp03-conductor-commit/0.1'
    || commit.turnId !== snapshot.turnId
    || !uniqueNonEmpty(commit.actionSequence)
    || commit.actionSequence.some((action) => !intent?.payload.candidateActionSequence.includes(action))
    || requiredHashes.some((hash) => !selected.has(hash))
    || commit.selectedShardHashes.some((hash) => !knownHashes.has(hash))
    || dissentIds.some((id) => !commit.selectedDissentIds.includes(id))
    || commit.terminalIntent !== intent?.payload.terminalIntent;
  if (commitInvalid || !guardian || !intent || !witness || !archivist || !rewriter) {
    return fail('FAILED_NO_MUTATION', 'CONDUCTOR_COMMIT_INVALID', 'The minimal commit omitted or altered required durable authority.');
  }
  await options.durability.append({
    kind: 'commit-accepted', atMonotonicMs: commitAcceptedAt,
    payload: { commitHash: councilSha256(commit), selectedShardHashes: [...commit.selectedShardHashes] },
  });
  await options.durability.flush();

  const assemblyStartedAt = now();
  const capabilityConflict = rewriter.payload.semanticCapabilityIds.some((capability) =>
    guardian.payload.forbiddenCapabilityIds.includes(capability));
  const status: CouncilSuccessResult['status'] = guardian.payload.disposition === 'WITHHOLD'
    ? 'WITHHELD'
    : guardian.payload.disposition === 'NEEDS_CLARIFICATION' || capabilityConflict || commit.status === 'NEEDS_CLARIFICATION'
      ? 'NEEDS_CLARIFICATION'
      : commit.status === 'WITHHELD' ? 'WITHHELD' : 'PROPOSED';
  const draft: AgentActionDraft = deepFreeze({
    identity: {
      draftId: `draft_${councilSha256({ snapshot, commit, shards }).slice(0, 24)}`,
      schemaVersion: 'cp03-runtime/0.1',
      caseSessionId: snapshot.caseSessionId,
      turnId: snapshot.turnId,
      parentSceneHash: snapshot.parentSceneHash,
    },
    decision: { status, actionSequence: [...commit.actionSequence] },
    creative: {
      interpretation: intent.payload.interpretation,
      terminalIntent: intent.payload.terminalIntent,
      observations: [...witness.payload.observations],
      uncertainties: [...witness.payload.uncertainties],
      evidenceAnchors: [...witness.payload.evidenceAnchors],
      spatial: rewriter.payload.spatial,
      visual: rewriter.payload.visual,
      camera: rewriter.payload.camera,
      light: rewriter.payload.light,
      sound: rewriter.payload.sound,
      poeticText: rewriter.payload.poeticText,
      expectedChanges: [...rewriter.payload.expectedChanges],
    },
    materials: {
      assetReferences: [...archivist.payload.assetReferences],
      unavailableReferences: [...archivist.payload.unavailableReferences],
      provenanceNotes: [...archivist.payload.provenanceNotes],
    },
    execution: {
      semanticCapabilityIds: [...rewriter.payload.semanticCapabilityIds],
      guardianDisposition: guardian.payload.disposition,
      forbiddenCapabilityIds: [...guardian.payload.forbiddenCapabilityIds],
      requiredSourceLocks: [...guardian.payload.requiredSourceLocks],
      requiredRightsConditions: [...guardian.payload.requiredRightsConditions],
      requiredRollbackCapabilities: [...guardian.payload.requiredRollbackCapabilities],
    },
    agency: {
      selectedShardHashes: [...commit.selectedShardHashes],
      selectedDissentIds: [...commit.selectedDissentIds],
      dissent: [...guardian.payload.dissent],
      contestedEvidenceIds: [...guardian.payload.contestedEvidenceIds],
      publicChallenge: guardian.payload.publicChallenge,
      routingManifestVersion: snapshot.routingManifestVersion,
    },
  });
  const draftHash = councilSha256(draft);
  const draftAcceptedAt = now();
  if (draftAcceptedAt >= snapshot.deadlineMonotonicMs) {
    return fail('LATE_QUARANTINED', 'DRAFT_LATE_QUARANTINED', 'Assembly completed at or after the hard deadline.');
  }
  await options.durability.append({
    kind: 'draft-assembled', atMonotonicMs: draftAcceptedAt,
    payload: { draftHash, status, commitHash: councilSha256(commit) },
  });
  await options.durability.flush();
  const firstTrace = publicTraceFor(shards);
  const firstDurableTraceMs = firstTrace === null
    ? null
    : (byRole.get(firstTrace.role)?.acceptedAtMonotonicMs ?? snapshot.epochMonotonicMs) - snapshot.epochMonotonicMs;
  const allRequiredDurableAt = Math.max(...snapshot.requiredRoles.map((role) => byRole.get(role)!.acceptedAtMonotonicMs));
  const allRequiredDurableMs = allRequiredDurableAt - snapshot.epochMonotonicMs;
  const commitAcceptedMs = commitAcceptedAt - snapshot.epochMonotonicMs;
  const assemblyMs = draftAcceptedAt - assemblyStartedAt;
  const draftAcceptedMs = draftAcceptedAt - snapshot.epochMonotonicMs;
  const timing: CouncilTiming = {
    firstDurableTraceMs,
    allRequiredDurableMs,
    commitAcceptedMs,
    assemblyMs,
    draftAcceptedMs,
    firstTraceTargetMet: firstDurableTraceMs === null ? null : firstDurableTraceMs <= 2_500,
    requiredShardsSoftTargetMet: allRequiredDurableMs <= 5_500,
    commitSoftTargetMet: commitAcceptedMs <= 7_800,
    assemblyTargetMet: assemblyMs <= 100,
    draftTargetMet: draftAcceptedMs <= 8_000,
    hardDeadlineMet: draftAcceptedAt < snapshot.deadlineMonotonicMs,
  };
  return { ...base(), status, shards, commit, draft, draftHash, timing };
}
