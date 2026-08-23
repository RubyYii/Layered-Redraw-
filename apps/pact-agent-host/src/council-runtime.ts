import { randomUUID } from 'node:crypto';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import {
  createUserMessage,
  type ContentBlock,
} from '@deepseek-ai/dsh-llm';
import { SessionId, type Session } from '@deepseek-ai/dsh-session';
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent';
import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';

import type {
  AgentActionDraft,
  CouncilRole,
  CouncilShard,
  ProviderRoutingManifest,
} from './contract-types.js';
import {
  durableConductorCommit,
  durableCouncilShard,
} from './council-durability.js';
import {
  councilRegistryRecoveryCapability,
  type DurableConductorCommitReceipt,
  type DurableCouncilShardReceipt,
} from './council-registry.js';
import {
  COUNCIL_TIMING_LIMITS,
  monotonicNowMs,
  type FrozenCouncilTurn,
} from './council-turn.js';
import { assembleCouncilDraft } from './draft-assembler.js';
import { waitForTurnEnd } from './durable-turn.js';
import {
  createFoundationHarness,
  type FoundationHarness,
} from './create-foundation-harness.js';
import type { ProviderAttemptRecord } from './provider-envelope.js';
import {
  installProviderDispatchLedger,
  type CouncilProviderAttemptMetadata,
  type ProviderDispatchLedger,
  type ProviderStreamAssignment,
} from './provider-stream-ledger.js';

export interface CouncilPublicTrace {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly text: string;
  readonly role: 'Witness' | 'Rewriter';
  readonly sourceContributionHash: string;
  readonly acceptanceSequence: number;
  readonly projectedAtMonotonicMs: number;
  readonly durableAtMonotonicMs: number;
}

export type CouncilDispatchPhase = 'SHARD' | 'CONDUCTOR_COMMIT';

export interface CouncilAttemptRecord extends ProviderAttemptRecord {
  readonly council: {
    readonly role: CouncilRole;
    readonly phase: CouncilDispatchPhase;
    readonly snapshotHash: string;
    readonly promptHash: string;
    readonly declaredDispatchOrdinal: number;
  };
}

export interface CouncilRuntimeTiming {
  readonly startedAtMonotonicMs: number;
  readonly systemStatusAtMonotonicMs: number | null;
  readonly firstPublicTraceAtMonotonicMs: number | null;
  readonly requiredShardsAtMonotonicMs: number | null;
  readonly conductorCommitAtMonotonicMs: number | null;
  readonly assemblyStartedAtMonotonicMs: number | null;
  readonly assemblyEndedAtMonotonicMs: number | null;
  readonly draftAcceptedAtMonotonicMs: number | null;
  readonly systemStatusTargetMet: boolean;
  readonly firstPublicTraceTargetMet: boolean;
  readonly requiredShardsTargetMet: boolean;
  readonly conductorCommitTargetMet: boolean;
  readonly draftTargetMet: boolean;
  readonly hardDeadlineMet: boolean;
}

export interface CouncilRuntimeOrchestration {
  readonly activeConductorTurns: number;
  readonly settlementSinkTurns: number;
  readonly blockedSettlementSinkTurns: number;
  readonly undeclaredProviderStreams: number;
  readonly deadlineCancellationRequested: boolean;
  readonly harnessDisposed: boolean;
  readonly cleanupReasonCodes: readonly string[];
}

export type CouncilRuntimeResult =
  | {
      readonly status: 'COMPLETED';
      readonly draft: AgentActionDraft;
      readonly draftHash: string;
      readonly firstPublicTrace: CouncilPublicTrace | null;
      readonly providerRequestsMade: number;
      readonly attemptRecords: readonly CouncilAttemptRecord[];
      readonly durableShardReceipts: readonly DurableCouncilShardReceipt[];
      readonly durableConductorCommitReceipt: DurableConductorCommitReceipt;
      readonly selectionBarrierClosed: true;
      readonly timing: CouncilRuntimeTiming;
      readonly orchestration: CouncilRuntimeOrchestration;
    }
  | {
      readonly status:
        | 'NEEDS_CLARIFICATION'
        | 'WITHHELD'
        | 'FAILED_NO_MUTATION'
        | 'LATE_QUARANTINED';
      readonly draft: null;
      readonly draftHash: null;
      readonly firstPublicTrace: CouncilPublicTrace | null;
      readonly reasonCodes: readonly string[];
      readonly providerRequestsMade: number;
      readonly attemptRecords: readonly CouncilAttemptRecord[];
      readonly durableShardReceipts: readonly DurableCouncilShardReceipt[];
      readonly durableConductorCommitReceipt: DurableConductorCommitReceipt | null;
      readonly selectionBarrierClosed: boolean;
      readonly timing: CouncilRuntimeTiming;
      readonly orchestration: CouncilRuntimeOrchestration;
    };

export interface CouncilRuntimeOptions {
  readonly runId: string;
  readonly turn: FrozenCouncilTurn;
  readonly routingManifest: ProviderRoutingManifest;
  readonly persistenceRoot: string;
  readonly providerKind: 'real' | 'scripted';
  readonly now?: () => number;
  readonly onPublicTrace?: (
    trace: CouncilPublicTrace,
  ) => void | Promise<void>;
  readonly mountAdapters: (ctx: Context) => void | Promise<void>;
}

const ROLE_ORDER: readonly CouncilRole[] = [
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
];

const CHILD_LABELS: Readonly<Record<Exclude<CouncilRole, 'CaseConductor'>, string>> = {
  Witness: 'PACT Witness',
  Archivist: 'PACT Archivist',
  Rewriter: 'PACT Rewriter',
  Guardian: 'PACT Guardian',
};

const message = (text: string): ContentBlock[] => [{ type: 'text', text }];

const roleAssignment = (
  manifest: ProviderRoutingManifest,
  role: CouncilRole,
) => manifest.assignments[role];

const failureCode = (error: unknown): string => {
  if (error !== null && typeof error === 'object') {
    const code = (error as { readonly code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message.split(':', 1)[0] ?? 'COUNCIL_RUNTIME_FAILED';
  }
  return 'COUNCIL_RUNTIME_FAILED';
};

const unique = (codes: readonly string[]): readonly string[] => [
  ...new Set(codes),
];

const councilRecords = (
  ledger: ProviderDispatchLedger | undefined,
): readonly CouncilAttemptRecord[] => {
  if (ledger === undefined) return [];
  return ledger.attemptRecords()
    .filter((record): record is CouncilAttemptRecord => record.council !== undefined)
    .sort((left, right) =>
      left.council.declaredDispatchOrdinal - right.council.declaredDispatchOrdinal ||
      left.attempt - right.attempt ||
      left.sentOrdinal - right.sentOrdinal);
};

const providerAssignment = (
  manifest: ProviderRoutingManifest,
  role: CouncilRole,
  phase: CouncilDispatchPhase,
  promptHash: string,
  declaredDispatchOrdinal: number,
  sessionId: string,
  deadlineAt: number,
): ProviderStreamAssignment => {
  const selected = roleAssignment(manifest, role);
  return {
    sessionId,
    probeId: `council-${phase.toLowerCase()}-${role.toLowerCase()}`,
    provider: selected.provider,
    route: selected.route,
    model: selected.model,
    deadlineAt,
    dispatches: [{
      purpose: phase === 'SHARD'
        ? `submit one typed ${role} council shard`
        : 'submit one minimal CaseConductor commit',
      expectedOutcome: 'structured-tool',
      expectedTools: [phase === 'SHARD'
        ? 'pact_submit_council_shard'
        : 'pact_submit_conductor_commit'],
    }],
    council: {
      role,
      phase,
      snapshotHash: '',
      promptHash,
      declaredDispatchOrdinal,
    },
  };
};

const withSnapshot = (
  assignment: ProviderStreamAssignment,
  snapshotHash: string,
): ProviderStreamAssignment => assignment.council === undefined
  ? assignment
  : { ...assignment, council: { ...assignment.council, snapshotHash } };

const shardPrompt = (turn: FrozenCouncilTurn, role: CouncilRole): ContentBlock[] =>
  message(
    `COUNCIL_SHARD turnId=${turn.snapshot.turnId} role=${role}. ` +
    `Use the frozen snapshotHash=${turn.snapshotHash}. ` +
    'Submit exactly one pact_submit_council_shard using only the runtime-bound ' +
    'session identity, registered references, and fictional turn inputs.',
  );

const projectShard = (entry: {
  readonly shard: CouncilShard;
  readonly payloadHash: string;
}): Record<string, unknown> => ({
  shardId: entry.shard.shardId,
  role: entry.shard.role,
  kind: entry.shard.kind,
  payloadHash: entry.payloadHash,
  content: entry.shard.content,
});

const commitPrompt = (
  turn: FrozenCouncilTurn,
  durableShards: readonly {
    readonly shard: CouncilShard;
    readonly payloadHash: string;
  }[],
): ContentBlock[] => message(
  `COUNCIL_COMMIT turnId=${turn.snapshot.turnId}. ` +
  'Select only from these deterministic plain-JSON typed shard projections; ' +
  'do not add prose, files, assets, evidence, licences, or scene references: ' +
  JSON.stringify(durableShards.map(projectShard)),
);

const statusForAssembly = (
  status: 'NEEDS_CLARIFICATION' | 'WITHHELD' | 'FAILED_NO_MUTATION',
  reasonCodes: readonly string[],
): Exclude<CouncilRuntimeResult, { status: 'COMPLETED' }>['status'] => {
  if (status === 'WITHHELD') return 'WITHHELD';
  if (status === 'NEEDS_CLARIFICATION') return 'NEEDS_CLARIFICATION';
  return reasonCodes.some((code) => code.includes('DEADLINE'))
    ? 'LATE_QUARANTINED'
    : 'FAILED_NO_MUTATION';
};

export const runCouncilRuntime = async (
  options: CouncilRuntimeOptions,
): Promise<CouncilRuntimeResult> => {
  const now = options.now ?? monotonicNowMs;
  const startedAtMonotonicMs = options.turn.startedAtMonotonicMs;
  let systemStatusAtMonotonicMs: number | null = null;
  let firstPublicTraceAtMonotonicMs: number | null = null;
  let requiredShardsAtMonotonicMs: number | null = null;
  let conductorCommitAtMonotonicMs: number | null = null;
  let assemblyStartedAtMonotonicMs: number | null = null;
  let assemblyEndedAtMonotonicMs: number | null = null;
  let draftAcceptedAtMonotonicMs: number | null = null;
  let firstPublicTrace: CouncilPublicTrace | null = null;
  let selectionBarrierClosed = false;
  let durableShardReceipts: DurableCouncilShardReceipt[] = [];
  let durableConductorCommitReceipt: DurableConductorCommitReceipt | null = null;
  let ledger: ProviderDispatchLedger | undefined;
  let harness: FoundationHarness | undefined;
  let councilRegistry: NonNullable<FoundationHarness['councilRegistry']> | undefined;
  let activeConductor: Awaited<ReturnType<FoundationHarness['createConductor']>> | undefined;
  const settlementSinks: Awaited<ReturnType<FoundationHarness['createConductor']>>[] = [];
  const synthesisAgents = new Set<Agent>();
  const childAbortControllers = new Set<AbortController>();
  const deadlineAbortController = new AbortController();
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineCancellationRequested = false;
  let deadlineReached = false;
  let harnessDisposed = false;
  const cleanupReasonCodes: string[] = [];

  const cancelAtDeadline = (): void => {
    if (deadlineCancellationRequested) return;
    deadlineCancellationRequested = true;
    deadlineReached = true;
    const reason = new Error('COUNCIL_ABSOLUTE_DEADLINE_EXCEEDED');
    deadlineAbortController.abort(reason);
    for (const controller of childAbortControllers) {
      if (!controller.signal.aborted) controller.abort(reason);
    }
    for (const agent of synthesisAgents) {
      try {
        agent.cancel({ kind: 'user' });
      } catch {
        // Cancellation is best-effort per Agent; the shared abort signal still
        // releases every runtime-owned durability wait.
      }
    }
  };

  const trackSynthesisAgent = (agent: Agent): void => {
    synthesisAgents.add(agent);
    if (deadlineAbortController.signal.aborted) {
      agent.cancel({ kind: 'user' });
    }
  };

  const deadlineClosed = (): boolean =>
    deadlineReached ||
    deadlineAbortController.signal.aborted ||
    now() >= options.turn.deadlineAtMonotonicMs;

  const remainingMs = (): number => {
    const remaining = options.turn.deadlineAtMonotonicMs - now();
    if (deadlineReached || deadlineAbortController.signal.aborted || remaining <= 0) {
      cancelAtDeadline();
      throw new Error('COUNCIL_ABSOLUTE_DEADLINE_EXCEEDED');
    }
    return Math.max(1, Math.ceil(remaining));
  };

  const initialRemainingMs = options.turn.deadlineAtMonotonicMs - now();
  if (initialRemainingMs <= 0) {
    cancelAtDeadline();
  } else {
    deadlineTimer = setTimeout(
      cancelAtDeadline,
      Math.max(1, Math.ceil(initialRemainingMs)),
    );
  }

  const timing = (): CouncilRuntimeTiming => {
    const elapsed = (value: number | null): number | null =>
      value === null ? null : Math.max(0, value - startedAtMonotonicMs);
    const atOrBefore = (value: number | null, target: number): boolean =>
      elapsed(value) !== null && (elapsed(value) as number) <= target;
    return {
      startedAtMonotonicMs,
      systemStatusAtMonotonicMs,
      firstPublicTraceAtMonotonicMs,
      requiredShardsAtMonotonicMs,
      conductorCommitAtMonotonicMs,
      assemblyStartedAtMonotonicMs,
      assemblyEndedAtMonotonicMs,
      draftAcceptedAtMonotonicMs,
      systemStatusTargetMet: atOrBefore(
        systemStatusAtMonotonicMs,
        COUNCIL_TIMING_LIMITS.systemStatusTargetMs,
      ),
      firstPublicTraceTargetMet: atOrBefore(
        firstPublicTraceAtMonotonicMs,
        COUNCIL_TIMING_LIMITS.firstPublicTraceTargetMs,
      ),
      requiredShardsTargetMet: atOrBefore(
        requiredShardsAtMonotonicMs,
        COUNCIL_TIMING_LIMITS.requiredShardsTargetMs,
      ),
      conductorCommitTargetMet: atOrBefore(
        conductorCommitAtMonotonicMs,
        COUNCIL_TIMING_LIMITS.conductorCommitTargetMs,
      ),
      draftTargetMet: atOrBefore(
        draftAcceptedAtMonotonicMs,
        COUNCIL_TIMING_LIMITS.draftTargetMs,
      ),
      hardDeadlineMet: draftAcceptedAtMonotonicMs !== null &&
        draftAcceptedAtMonotonicMs < options.turn.deadlineAtMonotonicMs,
    };
  };

  const orchestrationEvidence: {
    activeConductorTurns: number;
    settlementSinkTurns: number;
    blockedSettlementSinkTurns: number;
    undeclaredProviderStreams: number;
    deadlineCancellationRequested: boolean;
    harnessDisposed: boolean;
    cleanupReasonCodes: readonly string[];
  } = {
    activeConductorTurns: 0,
    settlementSinkTurns: 0,
    blockedSettlementSinkTurns: 0,
    undeclaredProviderStreams: 0,
    deadlineCancellationRequested: false,
    harnessDisposed: false,
    cleanupReasonCodes: [],
  };

  const materializeOrchestration = (): void => {
    orchestrationEvidence.activeConductorTurns = activeConductor === undefined
      ? 0
      : activeConductor.agent.session.events.filter(
        (event) => event.type === 'turn/start',
      ).length;
    orchestrationEvidence.settlementSinkTurns = settlementSinks.reduce(
      (count, sink) => count + sink.agent.session.events.filter(
        (event) => event.type === 'turn/start',
      ).length,
      0,
    );
    orchestrationEvidence.blockedSettlementSinkTurns = settlementSinks.reduce(
      (count, sink) => count + sink.agent.session.events.filter(
        (event) => event.type === 'turn/end' && event.data.reason.kind === 'blocked',
      ).length,
      0,
    );
    orchestrationEvidence.undeclaredProviderStreams =
      ledger?.refusedUndeclaredStreams ?? 0;
    orchestrationEvidence.deadlineCancellationRequested =
      deadlineCancellationRequested;
    orchestrationEvidence.harnessDisposed = harnessDisposed;
    orchestrationEvidence.cleanupReasonCodes = unique(cleanupReasonCodes);
  };

  const orchestration = (): CouncilRuntimeOrchestration =>
    orchestrationEvidence;

  const notifyPublicTrace = (trace: CouncilPublicTrace): void => {
    if (options.onPublicTrace === undefined) return;
    try {
      const observed = options.onPublicTrace(trace);
      if (observed !== undefined) {
        void Promise.resolve(observed).catch(() => undefined);
      }
    } catch {
      // This observer is additive and non-authoritative. A consumer failure
      // cannot change the accepted durable council state.
    }
  };

  const resultFailure = (
    status: Exclude<CouncilRuntimeResult, { status: 'COMPLETED' }>['status'],
    reasonCodes: readonly string[],
  ): CouncilRuntimeResult => ({
    status,
    draft: null,
    draftHash: null,
    firstPublicTrace,
    reasonCodes: unique(reasonCodes),
    providerRequestsMade: ledger?.sentDispatches ?? 0,
    attemptRecords: councilRecords(ledger),
    durableShardReceipts,
    durableConductorCommitReceipt,
    selectionBarrierClosed,
    timing: timing(),
    orchestration: orchestration(),
  });

  try {
    remainingMs();
    if (options.routingManifest.manifestVersion !==
      options.turn.snapshot.routingManifestVersion) {
      return resultFailure('FAILED_NO_MUTATION', ['COUNCIL_ROUTING_MANIFEST_MISMATCH']);
    }
    const requiredRoles = [...options.turn.requiredRoles];
    if (
      requiredRoles.length !== ROLE_ORDER.length ||
      ROLE_ORDER.some((role) => !requiredRoles.includes(role))
    ) {
      return resultFailure('FAILED_NO_MUTATION', ['COUNCIL_REQUIRED_ROLE_POLICY_MISMATCH']);
    }

    harness = await createFoundationHarness({
      persistenceRoot: options.persistenceRoot,
      now,
      toolProfile: 'council-v2',
      conductorSelection: {
        provider: roleAssignment(options.routingManifest, 'CaseConductor').route,
        model: roleAssignment(options.routingManifest, 'CaseConductor').model,
      },
      mountAdapters: options.mountAdapters,
    });
    remainingMs();
    councilRegistry = harness.councilRegistry;
    if (councilRegistry === undefined) {
      return resultFailure('FAILED_NO_MUTATION', ['COUNCIL_REGISTRY_UNAVAILABLE']);
    }
    councilRegistry.openTurn(options.turn);
    systemStatusAtMonotonicMs = now();

    ledger = installProviderDispatchLedger(harness.ctx, {
      runId: options.runId,
      maximumDispatches: options.routingManifest.maximumDispatches,
      providerKind: options.providerKind,
      deadlineAt: options.turn.deadlineAtMonotonicMs,
      now,
    });

    const acceptedCommitEvent = { current: null as {
      readonly accepted: true;
      readonly turnId: string;
      readonly payloadHash: string;
      readonly commitEventSeq: number;
    } | null };
    harness.ctx.on('session/event', (session, event) => {
      if (event.type === 'pact/conductor-commit' && acceptedCommitEvent.current === null) {
        acceptedCommitEvent.current = {
          accepted: true,
          turnId: event.data.turnId,
          payloadHash: event.data.payloadHash,
          commitEventSeq: event.seq,
        };
      }
      if (
        (event.type === 'pact/council-shard' || event.type === 'pact/conductor-commit') &&
        harness?.ctx.agents.get(session.id) !== undefined
      ) {
        harness.ctx.agents.get(session.id)?.cancel({ kind: 'user' });
      }
    });

    const pendingAssignments = new Map<string, ProviderStreamAssignment>();
    harness.ctx.subagents.registerContinuableSetup((childCtx) => {
      const child = childCtx.agent;
      if (child === undefined) throw new Error('COUNCIL_CHILD_AGENT_REQUIRED');
      const descriptor = foldSubagentDescriptor(child.session.events);
      const label = descriptor?.label;
      const assignment = label === undefined ? undefined : pendingAssignments.get(label);
      if (assignment === undefined) {
        throw new Error(`COUNCIL_CHILD_ASSIGNMENT_MISSING: ${label ?? 'unlabelled'}`);
      }
      pendingAssignments.delete(label!);
      ledger?.assignSession({ ...assignment, sessionId: String(child.id) });
      return () => undefined;
    });

    activeConductor = await harness.createConductor(
      SessionId(randomUUID()),
      { parked: false },
    );
    trackSynthesisAgent(activeConductor.agent);
    for (const role of ROLE_ORDER.slice(1)) {
      const sink = await harness.createConductor(
        SessionId(`${options.turn.snapshot.caseSessionId}_${role.toLowerCase()}_sink`),
      );
      settlementSinks.push(sink);
      trackSynthesisAgent(sink.agent);
    }

    const shardPrompts = new Map<CouncilRole, ContentBlock[]>();
    for (const role of ROLE_ORDER) shardPrompts.set(role, shardPrompt(options.turn, role));
    const assignShard = async (role: CouncilRole, sessionId?: string) => {
      const prompt = shardPrompts.get(role)!;
      const promptHash = await sha256Canonical(prompt);
      const assignment = withSnapshot(
        providerAssignment(
          options.routingManifest,
          role,
          'SHARD',
          promptHash,
          ROLE_ORDER.indexOf(role) + 1,
          sessionId ?? 'pending',
          options.turn.deadlineAtMonotonicMs,
        ),
        options.turn.snapshotHash,
      );
      return { assignment, prompt };
    };

    const childRoles = ROLE_ORDER.slice(1) as readonly Exclude<
      CouncilRole,
      'CaseConductor'
    >[];
    const plannedShards = new Map<CouncilRole, Awaited<ReturnType<typeof assignShard>>>();
    for (const role of ROLE_ORDER) {
      plannedShards.set(
        role,
        await assignShard(
          role,
          role === 'CaseConductor'
            ? String(activeConductor.agent.id)
            : undefined,
        ),
      );
    }
    ledger.declareCouncilInitialWave(ROLE_ORDER.map((role) =>
      plannedShards.get(role)!.assignment
    ));
    ledger.assignSession(plannedShards.get('CaseConductor')!.assignment);
    for (const role of childRoles) {
      pendingAssignments.set(
        CHILD_LABELS[role],
        plannedShards.get(role)!.assignment,
      );
    }

    remainingMs();
    activeConductor.agent.followup(createUserMessage({
      content: plannedShards.get('CaseConductor')!.prompt,
      source: { kind: 'user' },
    }));
    const childStarts = childRoles.map(async (role) => {
      const child = plannedShards.get(role)!;
      const selected = roleAssignment(options.routingManifest, role);
      const childAbortController = new AbortController();
      childAbortControllers.add(childAbortController);
      if (deadlineAbortController.signal.aborted) {
        childAbortController.abort(deadlineAbortController.signal.reason);
      }
      const started = await harness!.ctx.subagents.startContinuable({
        provider: 'spawn',
        label: CHILD_LABELS[role],
        request: {
          parent: settlementSinks[childRoles.indexOf(role)]!.agent,
          prompt: child.prompt,
          agentOptions: { provider: selected.route, model: selected.model },
          persona: `You are the bounded PACT ${role} council role. Use only the visible council shard tool.`,
          toolFilter: { allow: ['pact_submit_council_shard'] },
        },
        signal: childAbortController.signal,
      });
      const agent = harness!.ctx.agents.get(started.childId);
      if (agent === undefined) throw new Error('COUNCIL_CHILD_AGENT_REQUIRED');
      trackSynthesisAgent(agent);
      return {
        role,
        session: harness!.sessionFor(started.childId),
        agent,
      };
    });

    const startedChildren = await Promise.all(childStarts);
    await ledger.waitForCouncilInitialWaveOpened(
      deadlineAbortController.signal,
    );

    const sessionByRole = new Map<CouncilRole, Session>([
      ['CaseConductor', activeConductor.agent.session],
      ...startedChildren.map((child) => [child.role, child.session] as const),
    ]);
    const durableByRole = new Map<CouncilRole, DurableCouncilShardReceipt>();
    const durabilityJobs = ROLE_ORDER.map(async (role) => {
      const session = sessionByRole.get(role);
      if (session === undefined) throw new Error('COUNCIL_ROLE_SESSION_MISSING');
      await waitForTurnEnd(
        harness!.ctx,
        session,
        1,
        remainingMs(),
        deadlineAbortController.signal,
      );
      const context = councilRegistry!.acceptedCouncilShardContexts(
        options.turn.snapshot.turnId,
      ).find((candidate) => candidate.shard.role === role);
      if (context === undefined) return;
      const canonicalSession = councilRegistryRecoveryCapability(councilRegistry!)
        .canonicalShardSession(context.receipt);
      const durable = await durableCouncilShard({
        ctx: harness!.ctx,
        registry: councilRegistry!,
        session: canonicalSession,
        receipt: context.receipt,
      });
      durableByRole.set(role, durable);
      if (durable.projectedTrace && firstPublicTrace === null) {
        const durableContext = councilRegistry!.acceptedShardContext(durable);
        const durableAtMonotonicMs = now();
        const trace: CouncilPublicTrace = {
          caseSessionId: durableContext.turn.snapshot.caseSessionId,
          turnId: durableContext.turn.snapshot.turnId,
          text: durableContext.shard.publicTrace,
          role: durableContext.shard.role as 'Witness' | 'Rewriter',
          sourceContributionHash: durable.payloadHash,
          acceptanceSequence: durable.acceptanceSequence,
          projectedAtMonotonicMs:
            durableContext.projectionAtMonotonicMs ?? durable.acceptedAtMonotonicMs,
          durableAtMonotonicMs,
        };
        firstPublicTrace = trace;
        firstPublicTraceAtMonotonicMs = durableAtMonotonicMs;
        notifyPublicTrace(trace);
      }
    });
    const durabilityOutcomes = await Promise.allSettled(durabilityJobs);
    durableShardReceipts = [...durableByRole.values()].sort(
      (left, right) => left.acceptanceSequence - right.acceptanceSequence,
    );
    if (!deadlineAbortController.signal.aborted) {
      await Promise.all(settlementSinks.map((sink) => sink.agent.whenIdle()));
    }

    const durableRoles = new Set(
      durableShardReceipts.map((receipt) =>
        councilRegistry!.acceptedShardContext(receipt).shard.role),
    );
    const missingRoles = requiredRoles.filter((role) => !durableRoles.has(role));
    if (missingRoles.length > 0) {
      if (!selectionBarrierClosed) {
        councilRegistry.closeSelectionBarrier(options.turn.snapshot.turnId);
        selectionBarrierClosed = true;
      }
      return resultFailure(
        deadlineClosed()
          ? 'LATE_QUARANTINED'
          : 'FAILED_NO_MUTATION',
        [
          ...(durabilityOutcomes.some((outcome) => outcome.status === 'rejected')
            ? ['COUNCIL_SHARD_DURABILITY_FAILED']
            : []),
          'COUNCIL_REQUIRED_SHARD_MISSING',
          ...missingRoles.map((role) => `COUNCIL_REQUIRED_ROLE_${role}`),
        ],
      );
    }
    requiredShardsAtMonotonicMs = now();
    councilRegistry.closeSelectionBarrier(options.turn.snapshot.turnId);
    selectionBarrierClosed = true;
    remainingMs();

    const proposalBeforeCommit = councilRegistry.durableProposal(options.turn.snapshot.turnId);
    const commitContent = commitPrompt(
      options.turn,
      proposalBeforeCommit.durableShards.map((entry) => ({
        shard: entry.shard,
        payloadHash: entry.payloadHash,
      })),
    );
    const commitPromptHash = await sha256Canonical(commitContent);
    ledger.assignSession(withSnapshot(
      providerAssignment(
        options.routingManifest,
        'CaseConductor',
        'CONDUCTOR_COMMIT',
        commitPromptHash,
        6,
        String(activeConductor.agent.id),
        options.turn.deadlineAtMonotonicMs,
      ),
      options.turn.snapshotHash,
    ));
    remainingMs();
    activeConductor.agent.followup(createUserMessage({
      content: commitContent,
      source: { kind: 'user' },
    }));
    await waitForTurnEnd(
      harness.ctx,
      activeConductor.agent.session,
      2,
      remainingMs(),
      deadlineAbortController.signal,
    );
    if (acceptedCommitEvent.current === null) {
      return resultFailure(
        deadlineClosed() ? 'LATE_QUARANTINED' : 'FAILED_NO_MUTATION',
        ['COUNCIL_CONDUCTOR_COMMIT_MISSING'],
      );
    }
    const acceptedCommit = acceptedCommitEvent.current;
    durableConductorCommitReceipt = await durableConductorCommit({
      ctx: harness.ctx,
      registry: councilRegistry,
      session: activeConductor.agent.session,
      receipt: acceptedCommit,
    });
    conductorCommitAtMonotonicMs = now();
    ledger.assertComplete();
    remainingMs();

    const proposal = councilRegistry.durableProposal(options.turn.snapshot.turnId);
    assemblyStartedAtMonotonicMs = now();
    const assembled = await assembleCouncilDraft({
      turn: options.turn,
      proposal,
      now,
    });
    assemblyEndedAtMonotonicMs = now();
    if (assembled.status !== 'ASSEMBLED') {
      return resultFailure(
        statusForAssembly(assembled.status, assembled.reasonCodes),
        assembled.reasonCodes,
      );
    }
    remainingMs();
    const acceptedDraft = await harness.registry.acceptDraft(
      activeConductor.agent.session,
      assembled.draft,
    );
    if (!acceptedDraft.accepted) {
      return resultFailure(
        deadlineClosed() ? 'LATE_QUARANTINED' : 'FAILED_NO_MUTATION',
        [deadlineClosed()
          ? 'COUNCIL_DRAFT_ADMISSION_DEADLINE_CLOSED'
          : 'COUNCIL_DRAFT_ADMISSION_FAILED'],
      );
    }
    if (
      acceptedDraft.payloadHash !== assembled.draftHash ||
      acceptedDraft.acceptedAtMonotonicMs === undefined
    ) {
      return resultFailure('FAILED_NO_MUTATION', ['COUNCIL_DRAFT_ADMISSION_FAILED']);
    }
    if (
      acceptedDraft.acceptedAtMonotonicMs >=
        options.turn.deadlineAtMonotonicMs
    ) {
      return resultFailure(
        'LATE_QUARANTINED',
        ['COUNCIL_DRAFT_ADMISSION_DEADLINE_CLOSED'],
      );
    }
    draftAcceptedAtMonotonicMs = acceptedDraft.acceptedAtMonotonicMs;
    const completedTiming = timing();
    if (!completedTiming.hardDeadlineMet) {
      return resultFailure(
        'LATE_QUARANTINED',
        ['COUNCIL_DRAFT_ADMISSION_DEADLINE_CLOSED'],
      );
    }
    return {
      status: 'COMPLETED',
      draft: assembled.draft,
      draftHash: assembled.draftHash,
      firstPublicTrace,
      providerRequestsMade: ledger.sentDispatches,
      attemptRecords: councilRecords(ledger),
      durableShardReceipts,
      durableConductorCommitReceipt,
      selectionBarrierClosed: true,
      timing: completedTiming,
      orchestration: orchestration(),
    };
  } catch (error) {
    const code = failureCode(error);
    return resultFailure(
      deadlineClosed()
        ? 'LATE_QUARANTINED'
        : 'FAILED_NO_MUTATION',
      [code],
    );
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    if (councilRegistry !== undefined) {
      try {
        councilRegistry.closeTurn(options.turn.snapshot.turnId);
      } catch {
        cleanupReasonCodes.push('COUNCIL_TURN_CLOSE_FAILED');
      }
    }
    if (harness !== undefined) {
      try {
        await harness.dispose();
        harnessDisposed = true;
      } catch {
        cleanupReasonCodes.push('COUNCIL_HARNESS_DISPOSE_FAILED');
      }
    }
    materializeOrchestration();
  }
};
