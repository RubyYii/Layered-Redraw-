import { randomUUID } from 'node:crypto';

import type { Context } from '@deepseek-ai/cordis';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import {
  createUserMessage,
  isTokenDelta,
  type ContentBlock,
} from '@deepseek-ai/dsh-llm';
import { SessionId, type Session } from '@deepseek-ai/dsh-session';
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent';

import {
  COMPATIBILITY_LIMITS,
  requireConfiguredCompatibility,
  type CompatibilityConfigInspection,
  type ConfiguredCompatibility,
} from './compatibility-config.js';
import { mountCompatibilityProviderAdapters } from './catalog-eligibility.js';
import {
  createFoundationHarness,
  type FoundationHarness,
} from './create-foundation-harness.js';
import { waitForTurnEnd } from './durable-turn.js';
import { CompatibilityDispatchError } from './dispatch-budget.js';
import type { ProviderAttemptRecord } from './provider-envelope.js';
import {
  installProviderDispatchLedger,
  type ProviderDispatchLedger,
  type ProviderStreamAssignment,
} from './provider-stream-ledger.js';
import {
  COMPATIBILITY_PROBES,
  probePlanSummary,
  type ProbeId,
} from './probe-plan.js';
import { saveSyntheticCheckerboard } from './synthetic-checkerboard.js';

export interface ProviderCompatibilityRuntimeOptions {
  readonly runId: string;
  readonly config: CompatibilityConfigInspection;
  readonly persistenceRoot: string;
  readonly dshHome: string;
  readonly providerKind: 'real' | 'scripted';
  readonly cancellationDelayMs: number;
  readonly chainDeadlineMs?: number;
  readonly now?: () => number;
  readonly mountAdapters: (ctx: Context) => void | Promise<void>;
}

export interface ProviderCompatibilityTiming {
  readonly chainStartedAt: string | null;
  readonly firstPublicTraceAt: string | null;
  readonly draftAcceptedAt: string | null;
  readonly firstPublicTraceLatencyMs: number | null;
  readonly draftAcceptedLatencyMs: number | null;
  readonly firstPublicTraceTargetMet: boolean | null;
  readonly draftTargetMet: boolean | null;
  readonly hardDeadlineMet: boolean | null;
}

export interface ProviderCompatibilityOrchestration {
  readonly activeConductorTurns: number;
  readonly settlementSinkTurns: number;
  readonly blockedSettlementSinkTurns: number;
}

export interface ProviderCompatibilityRuntimeResult {
  readonly status: 'COMPLETED';
  readonly completedProbes: number;
  readonly sentDispatches: number;
  readonly attemptRecords: readonly ProviderAttemptRecord[];
  readonly timing: ProviderCompatibilityTiming;
  readonly orchestration: ProviderCompatibilityOrchestration;
}

export interface ProviderCompatibilityRuntimePartialResult {
  readonly status: 'FAILED';
  readonly reachedProbes: number;
  readonly sentDispatches: number;
  readonly attemptRecords: readonly ProviderAttemptRecord[];
  readonly timing: ProviderCompatibilityTiming;
  readonly orchestration: ProviderCompatibilityOrchestration;
  readonly failure: {
    readonly code: string;
    readonly message: string;
  };
}

export class ProviderCompatibilityRuntimeError extends Error {
  override readonly name = 'ProviderCompatibilityRuntimeError';

  constructor(
    readonly code: string,
    readonly partialResult: ProviderCompatibilityRuntimePartialResult,
    cause: unknown,
  ) {
    super(partialResult.failure.message, { cause });
  }
}

type PendingAssignment = Omit<
  ProviderStreamAssignment,
  'sessionId' | 'probeId'
> & { readonly probeId: ProbeId };

interface StartedProbeChild {
  readonly session: Session;
  readonly childId: SessionId;
}

interface ToolCompletionProgress {
  readonly expected: ReadonlySet<string>;
  readonly completed: Set<string>;
  readonly namesByCallId: Map<string, string>;
}

const probeById = new Map(COMPATIBILITY_PROBES.map((probe) => [
  probe.id,
  probe,
]));

const requireProbe = (probeId: ProbeId) => {
  const probe = probeById.get(probeId);
  if (probe === undefined) throw new Error(`COMPATIBILITY_PROBE_MISSING: ${probeId}`);
  return probe;
};

const caseSessionId = (): SessionId => SessionId(
  `case_${randomUUID().replaceAll('-', '')}`,
);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const selectionFor = (
  config: ConfiguredCompatibility,
  provider: 'deepseek' | 'gemini',
) => provider === 'deepseek' ? config.deepseek : config.gemini;

const assignmentFor = (
  config: ConfiguredCompatibility,
  probeId: ProbeId,
  options: {
    readonly attachmentId?: string;
    readonly deadlineAt: number;
  },
): PendingAssignment => {
  const probe = requireProbe(probeId);
  const selection = selectionFor(config, probe.provider);
  return {
    probeId,
    provider: probe.provider,
    route: selection.route,
    model: selection.model,
    dispatches: probe.dispatches,
    deadlineAt: options.deadlineAt,
    ...(options.attachmentId === undefined
      ? {}
      : { attachmentId: options.attachmentId }),
  };
};

const marker = (probeId: ProbeId): string =>
  `PACT_COMPAT_PROBE_${probeId.slice(-2)}`;

const rolePersona = (role: string): string =>
  `You are the PACT ${role}. Use only the visible PACT tools. ` +
  'The input is fictional compatibility material, not a recovered memory. ' +
  'Submit exactly the requested schema tool and do not browse, read files, or execute scene changes.';

const promptForContribution = (
  probeId: ProbeId,
  turnId: string,
  role: string,
): ContentBlock[] => [{
  type: 'text',
  text:
    `${marker(probeId)}. Submit exactly one pact_submit_contribution for ${turnId}. ` +
    `Use the runtime-bound role=${role} and childSessionId from the system identity. ` +
    'Use schemaVersion cp03-foundation-gate/0.1; fictional public text; ' +
    'evidenceAnchors=["synthetic-checkerboard"]; assetRequests=[], dissent=[], toolReceiptRefs=[].',
}];

const contributionRef = (
  session: Session,
  turnId: string,
): { role: string; childSessionId: string; contributionHash: string } => {
  const event = session.events.findLast((candidate) =>
    candidate.type === 'pact/contribution' && candidate.data.turnId === turnId
  );
  if (event?.type !== 'pact/contribution') {
    throw new Error(`PACT_CONTRIBUTION_MISSING: ${session.id}`);
  }
  return {
    role: event.data.role,
    childSessionId: String(session.id),
    contributionHash: event.data.payloadHash,
  };
};

const checkpointSessions = async (
  harness: FoundationHarness,
  sessions: readonly Session[],
): Promise<void> => {
  await Promise.all(sessions.map(async (session) => {
    const expectedLastSeq = session.events.at(-1)?.seq;
    if (expectedLastSeq === undefined) {
      throw new Error(`PROVIDER_SESSION_EMPTY: ${session.id}`);
    }
    if (harness.ctx.sessions.get(session.id) === session) {
      try {
        const participated = await harness.ctx.sessions.flush(session);
        if (!participated) {
          throw new Error(`PROVIDER_SESSION_FLUSH_UNOBSERVED: ${session.id}`);
        }
        return;
      } catch (error) {
        if (harness.ctx.sessions.get(session.id) === session) throw error;
      }
    }
    const inspected = await harness.ctx.sessionPersistence.inspect(session.id);
    if (inspected.events.at(-1)?.seq !== expectedLastSeq) {
      throw new Error(`PROVIDER_SESSION_PERSISTENCE_INCOMPLETE: ${session.id}`);
    }
  }));
};

const turnEndKind = (session: Session, dshTurn: number): string | undefined => {
  const event = session.events.find((candidate) =>
    candidate.type === 'turn/end' && candidate.data.turn === dshTurn
  );
  return event?.type === 'turn/end' ? event.data.reason.kind : undefined;
};

const requireTurnEndKind = (
  session: Session,
  dshTurn: number,
  expected: 'aborted' | 'blocked',
): void => {
  const observed = turnEndKind(session, dshTurn);
  if (observed !== expected) {
    throw new Error(
      `PROVIDER_TURN_REASON_INVALID: ${session.id} turn ${dshTurn} expected ${expected}, received ${observed ?? 'missing'}`,
    );
  }
};

export const runProviderCompatibilityRuntime = async (
  options: ProviderCompatibilityRuntimeOptions,
): Promise<ProviderCompatibilityRuntimeResult> => {
  const config = requireConfiguredCompatibility(options.config);
  const now = options.now ?? Date.now;
  const chainDeadlineMs = options.chainDeadlineMs ??
    COMPATIBILITY_LIMITS.deadlineMs;
  if (!Number.isFinite(options.cancellationDelayMs) || options.cancellationDelayMs <= 0) {
    throw new Error('COMPATIBILITY_CANCELLATION_DELAY_INVALID');
  }
  if (
    !Number.isFinite(chainDeadlineMs) ||
    chainDeadlineMs <= 0 ||
    chainDeadlineMs > COMPATIBILITY_LIMITS.deadlineMs
  ) {
    throw new Error('COMPATIBILITY_CHAIN_DEADLINE_INVALID');
  }
  const plan = probePlanSummary(COMPATIBILITY_PROBES);
  const harness = await createFoundationHarness({
    persistenceRoot: options.persistenceRoot,
    now,
    async mountAdapters(ctx) {
      await ctx.plugin(LocalAttachmentStore, {
        dshHome: options.dshHome,
        maxImageBytes: COMPATIBILITY_LIMITS.maxImageBytes,
        maxImagesPerMessage: 1,
        maxMessageImageBytes: COMPATIBILITY_LIMITS.maxImageBytes,
        maxImagePixels: 64 * 64,
      });
      await options.mountAdapters(ctx);
    },
    conductorSelection: {
      provider: config.deepseek.route,
      model: config.deepseek.model,
    },
  });
  const openedTurns = new Set<string>();
  const completed = new Set<ProbeId>();
  let partialLedger: ProviderDispatchLedger | undefined;
  let chainStartedAtMs: number | undefined;
  let firstPublicTraceAtMs: number | undefined;
  let draftAcceptedAtMs: number | undefined;
  let hardDeadlineMissed = false;
  let activeConductorSession: Session | undefined;
  const settlementSinkSessions: Session[] = [];
  const openTurn = (turnId: string, deadlineAt: number): void => {
    harness.registry.openTurn(turnId, deadlineAt);
    openedTurns.add(turnId);
  };
  const closeTurn = (turnId: string): void => {
    harness.registry.closeTurn(turnId);
    openedTurns.delete(turnId);
  };
  const timingSnapshot = (): ProviderCompatibilityTiming => {
    const traceLatency = chainStartedAtMs === undefined ||
        firstPublicTraceAtMs === undefined
      ? null
      : Math.max(0, firstPublicTraceAtMs - chainStartedAtMs);
    const draftLatency = chainStartedAtMs === undefined ||
        draftAcceptedAtMs === undefined
      ? null
      : Math.max(0, draftAcceptedAtMs - chainStartedAtMs);
    const hardDeadlineMet = chainStartedAtMs === undefined
      ? null
      : draftAcceptedAtMs !== undefined
        ? draftAcceptedAtMs - chainStartedAtMs <= chainDeadlineMs
        : hardDeadlineMissed || now() - chainStartedAtMs > chainDeadlineMs
          ? false
          : null;
    return Object.freeze({
      chainStartedAt: chainStartedAtMs === undefined
        ? null
        : new Date(chainStartedAtMs).toISOString(),
      firstPublicTraceAt: firstPublicTraceAtMs === undefined
        ? null
        : new Date(firstPublicTraceAtMs).toISOString(),
      draftAcceptedAt: draftAcceptedAtMs === undefined
        ? null
        : new Date(draftAcceptedAtMs).toISOString(),
      firstPublicTraceLatencyMs: traceLatency,
      draftAcceptedLatencyMs: draftLatency,
      firstPublicTraceTargetMet: traceLatency === null
        ? null
        : traceLatency <= COMPATIBILITY_LIMITS.firstPublicTraceMs,
      draftTargetMet: draftLatency === null
        ? null
        : draftLatency <= COMPATIBILITY_LIMITS.targetDraftMs,
      hardDeadlineMet,
    });
  };
  const orchestrationSnapshot = (): ProviderCompatibilityOrchestration =>
    Object.freeze({
      activeConductorTurns: activeConductorSession?.events.filter(
        (event) => event.type === 'turn/start',
      ).length ?? 0,
      settlementSinkTurns: settlementSinkSessions.reduce(
        (total, session) => total + session.events.filter(
          (event) => event.type === 'turn/start',
        ).length,
        0,
      ),
      blockedSettlementSinkTurns: settlementSinkSessions.reduce(
        (total, session) => total + session.events.filter(
          (event) => event.type === 'turn/end' &&
            event.data.reason.kind === 'blocked',
        ).length,
        0,
      ),
    });

  try {
    const synthetic = await saveSyntheticCheckerboard(harness.ctx.attachments);
    const ledger = installProviderDispatchLedger(harness.ctx, {
      runId: options.runId,
      maximumDispatches: plan.maximumDispatches,
      providerKind: options.providerKind,
      deadlineAt: now() + COMPATIBILITY_LIMITS.deadlineMs * 4,
      now,
    });
    partialLedger = ledger;
    const pendingByLabel = new Map<string, PendingAssignment[]>();
    const probeBySession = new Map<string, ProbeId>();
    const toolProgressBySession = new Map<string, ToolCompletionProgress>();
    const cancelAfterFirstChunk = new Set<string>();

    const armToolCompletion = (
      sessionId: SessionId,
      assignment: PendingAssignment,
    ): void => {
      const expected = new Set(assignment.dispatches.flatMap(
        (dispatch) => [...(dispatch.expectedTools ?? [])],
      ));
      if (expected.size === 0) return;
      toolProgressBySession.set(String(sessionId), {
        expected,
        completed: new Set(),
        namesByCallId: new Map(),
      });
    };
    const assignSession = (
      sessionId: SessionId,
      assignment: PendingAssignment,
    ): void => {
      ledger.assignSession({ ...assignment, sessionId });
      probeBySession.set(String(sessionId), assignment.probeId);
      armToolCompletion(sessionId, assignment);
    };

    const queueChildAssignment = (
      label: string,
      assignment: PendingAssignment,
    ): void => {
      const queue = pendingByLabel.get(label) ?? [];
      queue.push(assignment);
      pendingByLabel.set(label, queue);
    };

    harness.ctx.subagents.registerContinuableSetup((childCtx) => {
      const child = childCtx.agent;
      if (child === undefined) throw new Error('PACT_PROVIDER_CHILD_REQUIRED');
      const descriptor = foldSubagentDescriptor(child.session.events);
      const label = descriptor?.label;
      const queue = label === undefined ? undefined : pendingByLabel.get(label);
      const assignment = queue?.shift();
      if (assignment === undefined) {
        throw new Error(`PACT_PROVIDER_CHILD_ASSIGNMENT_MISSING: ${label ?? 'unlabelled'}`);
      }
      assignSession(child.id, assignment);
      if (assignment.probeId === 'probe-08') {
        cancelAfterFirstChunk.add(String(child.id));
      }
      return () => {
        toolProgressBySession.delete(String(child.id));
        cancelAfterFirstChunk.delete(String(child.id));
      };
    });

    harness.ctx.on('session/event', (session, event) => {
      const sessionId = String(session.id);
      const probeId = probeBySession.get(sessionId);
      if (
        event.type === 'pact/public-trace' &&
        probeId === 'probe-02' &&
        firstPublicTraceAtMs === undefined
      ) {
        firstPublicTraceAtMs = now();
      } else if (event.type === 'pact/draft' && probeId === 'probe-06') {
        draftAcceptedAtMs ??= now();
      } else if (event.type === 'pact/quarantine' && probeId === 'probe-06') {
        hardDeadlineMissed = true;
      }
      const progress = toolProgressBySession.get(sessionId);
      if (event.type === 'tool/call' && progress !== undefined) {
        progress.namesByCallId.set(String(event.data.callId), event.data.name);
      } else if (event.type === 'tool/result' && progress !== undefined) {
        const result = event.data.message.content[0];
        if (result?.type === 'tool-result') {
          const name = progress.namesByCallId.get(String(result.toolCallId));
          if (name !== undefined && progress.expected.has(name)) {
            progress.completed.add(name);
          }
          if ([...progress.expected].every((tool) =>
            progress.completed.has(tool)
          )) {
            toolProgressBySession.delete(sessionId);
            harness.ctx.agents.get(session.id)?.cancel({ kind: 'user' });
          }
        }
      }
      if (
        event.type === 'assistant/chunk' &&
        cancelAfterFirstChunk.has(sessionId) &&
        isTokenDelta(event.data.chunk)
      ) {
        cancelAfterFirstChunk.delete(sessionId);
        harness.ctx.agents.get(session.id)?.cancel({ kind: 'user' });
      }
    });

    const startChild = async (input: {
      readonly parent: Awaited<ReturnType<FoundationHarness['createConductor']>>;
      readonly label: 'PACT Rewriter' | 'PACT Guardian' | 'PACT Archivist';
      readonly probeId: ProbeId;
      readonly prompt: ContentBlock[];
      readonly tools: readonly string[];
      readonly attachmentId?: string;
      readonly deadlineAt: number;
    }): Promise<StartedProbeChild> => {
      const probe = requireProbe(input.probeId);
      const selection = selectionFor(config, probe.provider);
      queueChildAssignment(
        input.label,
        assignmentFor(config, input.probeId, {
          deadlineAt: input.deadlineAt,
          ...(input.attachmentId === undefined
            ? {}
            : { attachmentId: input.attachmentId }),
        }),
      );
      const started = await harness.ctx.subagents.startContinuable({
        provider: 'spawn',
        label: input.label,
        request: {
          parent: input.parent.agent,
          prompt: input.prompt,
          agentOptions: {
            provider: selection.route,
            model: selection.model,
          },
          persona: rolePersona(input.label.slice('PACT '.length)),
          toolFilter: { allow: [...input.tools] },
        },
        signal: new AbortController().signal,
      });
      return {
        childId: started.childId,
        session: harness.sessionFor(started.childId),
      };
    };

    const createSettlementSink = async () => {
      const sink = await harness.createConductor(caseSessionId());
      settlementSinkSessions.push(sink.agent.session);
      return sink;
    };

    const chainConductor = await harness.createConductor(caseSessionId(), {
      parked: false,
    });
    activeConductorSession = chainConductor.agent.session;
    const probe1Parent = await createSettlementSink();
    const probe3Parent = await createSettlementSink();
    const probe4Parent = await createSettlementSink();
    const probe5Parent = await createSettlementSink();
    const probe1DeadlineAt = now() + chainDeadlineMs;
    const probe3DeadlineAt = now() + chainDeadlineMs;
    openTurn('turn_probe_01', probe1DeadlineAt);
    openTurn('turn_probe_03', probe3DeadlineAt);

    const probe1Promise = startChild({
      parent: probe1Parent,
      label: 'PACT Rewriter',
      probeId: 'probe-01',
      prompt: promptForContribution('probe-01', 'turn_probe_01', 'Rewriter'),
      tools: ['pact_submit_contribution'],
      deadlineAt: probe1DeadlineAt,
    });
    const probe3Promise = startChild({
      parent: probe3Parent,
      label: 'PACT Archivist',
      probeId: 'probe-03',
      prompt: promptForContribution('probe-03', 'turn_probe_03', 'Archivist'),
      tools: ['pact_submit_contribution'],
      deadlineAt: probe3DeadlineAt,
    });
    const [probe1, probe3] = await Promise.all([probe1Promise, probe3Promise]);
    await Promise.all([
      waitForTurnEnd(harness.ctx, probe1.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe3.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe1Parent.agent.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe3Parent.agent.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
    ]);
    await checkpointSessions(harness, [
      probe1.session,
      probe3.session,
      probe1Parent.agent.session,
      probe3Parent.agent.session,
    ]);
    ledger.assertComplete();
    requireTurnEndKind(probe1.session, 1, 'aborted');
    requireTurnEndKind(probe3.session, 1, 'aborted');
    requireTurnEndKind(probe1Parent.agent.session, 1, 'blocked');
    requireTurnEndKind(probe3Parent.agent.session, 1, 'blocked');
    completed.add('probe-01');
    completed.add('probe-03');
    closeTurn('turn_probe_01');
    closeTurn('turn_probe_03');

    chainStartedAtMs = now();
    const chainDeadlineAt = chainStartedAtMs + chainDeadlineMs;
    openTurn('turn_chain_01', chainDeadlineAt);
    const probe2Assignment = assignmentFor(config, 'probe-02', {
      deadlineAt: chainDeadlineAt,
    });
    assignSession(chainConductor.agent.id, probe2Assignment);
    const probe4Promise = startChild({
      parent: probe4Parent,
      label: 'PACT Rewriter',
      probeId: 'probe-04',
      prompt: [
        ...promptForContribution('probe-04', 'turn_chain_01', 'Rewriter'),
        synthetic.messageBlock,
      ],
      tools: ['pact_submit_contribution'],
      attachmentId: synthetic.messageBlock.attachment.attachmentId,
      deadlineAt: chainDeadlineAt,
    });
    const probe5Promise = startChild({
      parent: probe5Parent,
      label: 'PACT Guardian',
      probeId: 'probe-05',
      prompt: promptForContribution('probe-05', 'turn_chain_01', 'Guardian'),
      tools: ['pact_submit_contribution'],
      deadlineAt: chainDeadlineAt,
    });
    chainConductor.agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text:
          `${marker('probe-02')}. In one response call pact_publish_trace and pact_route_turn for turn_chain_01. ` +
          'Use role CaseConductor; route exactly Rewriter and Guardian; use only fictional synthetic text. ' +
          'The harness will end this turn after both accepted tool results.',
      }],
      source: { kind: 'user' },
    }));
    const [probe4, probe5] = await Promise.all([probe4Promise, probe5Promise]);
    await Promise.all([
      waitForTurnEnd(harness.ctx, chainConductor.agent.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe4.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe5.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe4Parent.agent.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe5Parent.agent.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
    ]);
    await checkpointSessions(harness, [
      chainConductor.agent.session,
      probe4.session,
      probe5.session,
      probe4Parent.agent.session,
      probe5Parent.agent.session,
    ]);
    ledger.assertComplete();
    requireTurnEndKind(chainConductor.agent.session, 1, 'aborted');
    requireTurnEndKind(probe4.session, 1, 'aborted');
    requireTurnEndKind(probe5.session, 1, 'aborted');
    requireTurnEndKind(probe4Parent.agent.session, 1, 'blocked');
    requireTurnEndKind(probe5Parent.agent.session, 1, 'blocked');
    completed.add('probe-02');
    completed.add('probe-04');
    completed.add('probe-05');

    const contributionRefs = [
      contributionRef(probe4.session, 'turn_chain_01'),
      contributionRef(probe5.session, 'turn_chain_01'),
    ];
    assignSession(
      chainConductor.agent.id,
      assignmentFor(config, 'probe-06', { deadlineAt: chainDeadlineAt }),
    );
    chainConductor.agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text:
          `${marker('probe-06')}. Submit exactly one pact_submit_draft for turn_chain_01. ` +
          'It must use schemaVersion cp03-foundation-gate/0.1, executionMode NON_EXECUTABLE_COMPATIBILITY, ' +
          'semanticCapabilityCalls=[], expectedChanges=[], forbiddenChanges=["no scene mutation in provider gate"], ' +
          `and these exact contribution refs. PACT_CONTRIBUTION_REFS=${JSON.stringify(contributionRefs)}`,
      }],
      source: { kind: 'user' },
    }));
    await waitForTurnEnd(
      harness.ctx,
      chainConductor.agent.session,
      2,
      COMPATIBILITY_LIMITS.deadlineMs,
    );
    await checkpointSessions(harness, [chainConductor.agent.session]);
    ledger.assertComplete();
    requireTurnEndKind(chainConductor.agent.session, 2, 'aborted');
    completed.add('probe-06');
    closeTurn('turn_chain_01');

    const timeoutConductor = await harness.createConductor(caseSessionId(), {
      parked: false,
    });
    const cancelParent = await createSettlementSink();
    const probe7DeadlineAt = now() + chainDeadlineMs;
    const probe8DeadlineAt = now() + chainDeadlineMs;
    assignSession(
      timeoutConductor.agent.id,
      assignmentFor(config, 'probe-07', { deadlineAt: probe7DeadlineAt }),
    );
    timeoutConductor.agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text:
          `${marker('probe-07')}. Stream a long fictional passage without calling a tool. ` +
          'Continue until the caller cancels; do not submit any PACT side effect.',
      }],
      source: { kind: 'user' },
    }));
    const timeout = setTimeout(() => {
      timeoutConductor.agent.cancel({ kind: 'user' });
    }, options.cancellationDelayMs);
    const probe8 = await startChild({
      parent: cancelParent,
      label: 'PACT Archivist',
      probeId: 'probe-08',
      prompt: [{
        type: 'text',
        text:
          `${marker('probe-08')}. Begin one fictional text stream without calling tools. ` +
          'The caller will cancel after the first visible token.',
      }],
      tools: [],
      deadlineAt: probe8DeadlineAt,
    });
    try {
      await Promise.all([
        waitForTurnEnd(
          harness.ctx,
          timeoutConductor.agent.session,
          1,
          COMPATIBILITY_LIMITS.deadlineMs,
        ),
        waitForTurnEnd(harness.ctx, probe8.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
        waitForTurnEnd(harness.ctx, cancelParent.agent.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    await checkpointSessions(harness, [
      timeoutConductor.agent.session,
      probe8.session,
      cancelParent.agent.session,
    ]);
    ledger.assertComplete();
    requireTurnEndKind(cancelParent.agent.session, 1, 'blocked');
    completed.add('probe-07');
    completed.add('probe-08');

    const summary = ledger.assertComplete();
    const timing = timingSnapshot();
    const orchestration = orchestrationSnapshot();
    if (
      completed.size !== plan.intendedProbes ||
      summary.completedAssignments !== plan.intendedProbes ||
      summary.sentDispatches < plan.plannedDispatches ||
      summary.sentDispatches > plan.maximumDispatches ||
      timing.hardDeadlineMet !== true ||
      orchestration.activeConductorTurns !== 2 ||
      orchestration.settlementSinkTurns !== 5 ||
      orchestration.blockedSettlementSinkTurns !== 5
    ) {
      throw new Error(
        `COMPATIBILITY_RUN_INCOMPLETE: probes=${completed.size}, assignments=${summary.completedAssignments}, dispatches=${summary.sentDispatches}`,
      );
    }
    return {
      status: 'COMPLETED',
      completedProbes: completed.size,
      sentDispatches: summary.sentDispatches,
      attemptRecords: ledger.attemptRecords(),
      timing,
      orchestration,
    };
  } catch (error) {
    const code = error instanceof CompatibilityDispatchError
      ? error.code
      : 'PROVIDER_COMPATIBILITY_RUNTIME_FAILED';
    const message = messageOf(error);
    throw new ProviderCompatibilityRuntimeError(code, {
      status: 'FAILED',
      reachedProbes: completed.size,
      sentDispatches: partialLedger?.sentDispatches ?? 0,
      attemptRecords: partialLedger?.attemptRecords() ?? [],
      timing: timingSnapshot(),
      orchestration: orchestrationSnapshot(),
      failure: { code, message },
    }, error);
  } finally {
    for (const turnId of openedTurns) harness.registry.closeTurn(turnId);
    await harness.dispose();
  }
};

export interface RealProviderCompatibilityOptions
  extends Omit<
    ProviderCompatibilityRuntimeOptions,
    'providerKind' | 'mountAdapters'
  > {}

export const runRealProviderCompatibility = async (
  options: RealProviderCompatibilityOptions,
): Promise<ProviderCompatibilityRuntimeResult> => {
  const config = requireConfiguredCompatibility(options.config);
  return runProviderCompatibilityRuntime({
    ...options,
    providerKind: 'real',
    mountAdapters: (ctx) => mountCompatibilityProviderAdapters(ctx, {
      geminiRoute: config.gemini.route,
    }),
  });
};
