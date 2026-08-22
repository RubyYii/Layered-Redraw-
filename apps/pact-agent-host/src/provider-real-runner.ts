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
  readonly mountAdapters: (ctx: Context) => void | Promise<void>;
}

export interface ProviderCompatibilityRuntimeResult {
  readonly status: 'COMPLETED';
  readonly completedProbes: number;
  readonly sentDispatches: number;
  readonly attemptRecords: readonly ProviderAttemptRecord[];
}

type PendingAssignment = Omit<ProviderStreamAssignment, 'sessionId'>;

interface StartedProbeChild {
  readonly session: Session;
  readonly childId: SessionId;
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

const selectionFor = (
  config: ConfiguredCompatibility,
  provider: 'deepseek' | 'gemini',
) => provider === 'deepseek' ? config.deepseek : config.gemini;

const assignmentFor = (
  config: ConfiguredCompatibility,
  probeId: ProbeId,
  attachmentId?: string,
): PendingAssignment => {
  const probe = requireProbe(probeId);
  const selection = selectionFor(config, probe.provider);
  return {
    probeId,
    provider: probe.provider,
    route: selection.route,
    model: selection.model,
    dispatches: probe.dispatches,
    ...(attachmentId === undefined ? {} : { attachmentId }),
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

const flushSessions = async (
  harness: FoundationHarness,
  sessions: readonly Session[],
): Promise<void> => {
  await Promise.all(sessions.map((session) => harness.ctx.sessions.flush(session)));
};

export const runProviderCompatibilityRuntime = async (
  options: ProviderCompatibilityRuntimeOptions,
): Promise<ProviderCompatibilityRuntimeResult> => {
  const config = requireConfiguredCompatibility(options.config);
  if (!Number.isFinite(options.cancellationDelayMs) || options.cancellationDelayMs <= 0) {
    throw new Error('COMPATIBILITY_CANCELLATION_DELAY_INVALID');
  }
  const plan = probePlanSummary(COMPATIBILITY_PROBES);
  const harness = await createFoundationHarness({
    persistenceRoot: options.persistenceRoot,
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

  try {
    const synthetic = await saveSyntheticCheckerboard(harness.ctx.attachments);
    const ledger = installProviderDispatchLedger(harness.ctx, {
      runId: options.runId,
      maximumDispatches: plan.maximumDispatches,
      providerKind: options.providerKind,
      deadlineAt: Date.now() + COMPATIBILITY_LIMITS.deadlineMs,
    });
    const pendingByLabel = new Map<string, PendingAssignment[]>();
    const cancelAfterAcceptedToolResult = new Set<string>();
    const cancelAfterFirstChunk = new Set<string>();
    const completed = new Set<ProbeId>();

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
      ledger.assignSession({ ...assignment, sessionId: child.id });
      if (assignment.probeId === 'probe-01' || assignment.probeId === 'probe-03') {
        cancelAfterAcceptedToolResult.add(String(child.id));
      }
      if (assignment.probeId === 'probe-08') {
        cancelAfterFirstChunk.add(String(child.id));
      }
      return () => {
        cancelAfterAcceptedToolResult.delete(String(child.id));
        cancelAfterFirstChunk.delete(String(child.id));
      };
    });

    harness.ctx.on('session/event', (session, event) => {
      const sessionId = String(session.id);
      if (event.type === 'tool/result') {
        const result = event.data.message.content[0];
        const accepted = result?.type === 'tool-result' &&
          result.isError !== true &&
          event.data.error === undefined;
        if (accepted && cancelAfterAcceptedToolResult.delete(sessionId)) {
          harness.ctx.agents.get(session.id)?.cancel({ kind: 'user' });
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
    }): Promise<StartedProbeChild> => {
      const probe = requireProbe(input.probeId);
      const selection = selectionFor(config, probe.provider);
      queueChildAssignment(
        input.label,
        assignmentFor(config, input.probeId, input.attachmentId),
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

    const chainConductor = await harness.createConductor(caseSessionId(), {
      parked: false,
    });
    const probe1Parent = await harness.createConductor(caseSessionId());
    const probe3Parent = await harness.createConductor(caseSessionId());
    ledger.assignSession({
      ...assignmentFor(config, 'probe-02'),
      sessionId: chainConductor.agent.id,
    });

    const probe1Promise = startChild({
      parent: probe1Parent,
      label: 'PACT Rewriter',
      probeId: 'probe-01',
      prompt: promptForContribution('probe-01', 'turn_probe_01', 'Rewriter'),
      tools: ['pact_submit_contribution'],
    });
    const probe3Promise = startChild({
      parent: probe3Parent,
      label: 'PACT Archivist',
      probeId: 'probe-03',
      prompt: promptForContribution('probe-03', 'turn_probe_03', 'Archivist'),
      tools: ['pact_submit_contribution'],
    });
    chainConductor.agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text:
          `${marker('probe-02')}. In one response call pact_publish_trace and pact_route_turn for turn_chain_01. ` +
          'Use role CaseConductor; route exactly Rewriter and Guardian; use only fictional synthetic text. ' +
          'After both receipts, finish the turn without another tool call.',
      }],
      source: { kind: 'user' },
    }));
    const [probe1, probe3] = await Promise.all([probe1Promise, probe3Promise]);
    await Promise.all([
      waitForTurnEnd(harness.ctx, probe1.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, chainConductor.agent.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe3.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
    ]);
    await flushSessions(harness, [
      probe1.session,
      chainConductor.agent.session,
      probe3.session,
    ]);
    completed.add('probe-01');
    completed.add('probe-02');
    completed.add('probe-03');

    const [probe4, probe5] = await Promise.all([
      startChild({
        parent: chainConductor,
        label: 'PACT Rewriter',
        probeId: 'probe-04',
        prompt: [
          ...promptForContribution('probe-04', 'turn_chain_01', 'Rewriter'),
          synthetic.messageBlock,
        ],
        tools: ['pact_submit_contribution'],
        attachmentId: synthetic.messageBlock.attachment.attachmentId,
      }),
      startChild({
        parent: chainConductor,
        label: 'PACT Guardian',
        probeId: 'probe-05',
        prompt: promptForContribution('probe-05', 'turn_chain_01', 'Guardian'),
        tools: ['pact_submit_contribution'],
      }),
    ]);
    await Promise.all([
      waitForTurnEnd(harness.ctx, probe4.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
      waitForTurnEnd(harness.ctx, probe5.session, 1, COMPATIBILITY_LIMITS.deadlineMs),
    ]);
    await flushSessions(harness, [probe4.session, probe5.session]);
    completed.add('probe-04');
    completed.add('probe-05');

    const contributionRefs = [
      contributionRef(probe4.session, 'turn_chain_01'),
      contributionRef(probe5.session, 'turn_chain_01'),
    ];
    ledger.assignSession({
      ...assignmentFor(config, 'probe-06'),
      sessionId: chainConductor.agent.id,
    });
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
    await flushSessions(harness, [chainConductor.agent.session]);
    completed.add('probe-06');

    const timeoutConductor = await harness.createConductor(caseSessionId(), {
      parked: false,
    });
    const cancelParent = await harness.createConductor(caseSessionId());
    ledger.assignSession({
      ...assignmentFor(config, 'probe-07'),
      sessionId: timeoutConductor.agent.id,
    });
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
      ]);
    } finally {
      clearTimeout(timeout);
    }
    await flushSessions(harness, [timeoutConductor.agent.session, probe8.session]);
    completed.add('probe-07');
    completed.add('probe-08');

    const summary = ledger.assertComplete();
    if (
      completed.size !== plan.intendedProbes ||
      summary.completedAssignments !== plan.intendedProbes ||
      summary.sentDispatches !== plan.plannedDispatches
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
    };
  } finally {
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
