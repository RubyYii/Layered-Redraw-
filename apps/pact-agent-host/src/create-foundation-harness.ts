import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { type LlmAdapter } from '@deepseek-ai/dsh-llm';
import SessionStore, {
  type Session,
  type SessionId,
} from '@deepseek-ai/dsh-session';
import type { SessionInspection } from '@deepseek-ai/dsh-session-persistence';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import SubagentRuntime, {
  foldSubagentDescriptor,
} from '@deepseek-ai/dsh-subagent';
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';

import {
  registerPactSessionEventTypes,
  type PactRole,
} from './events.js';
import {
  registerPactTools,
  ROOT_PACT_TOOLS,
} from './pact-tools.js';
import {
  COUNCIL_ROLE_TOOLS,
  COUNCIL_ROOT_TOOLS,
  registerCouncilTools,
} from './council-tools.js';
import { CouncilRegistry } from './council-registry.js';
import { CouncilToolBindingRegistry } from './council-tool-binding.js';
import { SubmissionRegistry } from './submission-registry.js';

const childRoleByLabel = new Map<string, Exclude<PactRole, 'CaseConductor'>>([
  ['PACT Witness', 'Witness'],
  ['PACT Archivist', 'Archivist'],
  ['PACT Rewriter', 'Rewriter'],
  ['PACT Guardian', 'Guardian'],
]);

const roleForContinuableChild = (session: Session): Exclude<PactRole, 'CaseConductor'> => {
  const descriptor = foldSubagentDescriptor(session.events);
  const role = descriptor?.label === undefined
    ? undefined
    : childRoleByLabel.get(descriptor.label);
  if (role === undefined) throw new Error('PACT_CHILD_ROLE_LABEL_REQUIRED');
  return role;
};

interface FoundationHarnessCommonOptions {
  readonly persistenceRoot: string;
  readonly now?: () => number;
  readonly toolProfile?: PactToolProfile;
  readonly conductorSelection?: {
    readonly provider: string;
    readonly model: string;
    readonly maxTokens?: number;
  };
}

export type PactToolProfile = 'foundation-v1' | 'council-v2';

export interface ScriptedFoundationHarnessOptions
  extends FoundationHarnessCommonOptions {
  readonly scriptedAdapter: LlmAdapter;
  readonly mountAdapters?: never;
}

export interface ProviderFoundationHarnessOptions
  extends FoundationHarnessCommonOptions {
  readonly scriptedAdapter?: never;
  readonly mountAdapters: (ctx: Context) => void | Promise<void>;
  readonly conductorSelection: {
    readonly provider: string;
    readonly model: string;
    readonly maxTokens?: number;
  };
}

export type FoundationHarnessOptions =
  | ScriptedFoundationHarnessOptions
  | ProviderFoundationHarnessOptions;

export interface FoundationHarness {
  readonly ctx: Context;
  readonly registry: SubmissionRegistry;
  readonly councilRegistry?: CouncilRegistry;
  readonly councilToolBindings?: CouncilToolBindingRegistry;
  readonly persistenceRoot: string;
  createConductor(
    sessionId: SessionId,
    options?: { readonly parked?: boolean },
  ): Promise<AgentHandle>;
  sessionFor(sessionId: SessionId): Session;
  dispose(): Promise<void>;
}

const mountFoundationSpine = async (
  ctx: Context,
  persistenceRoot: string,
): Promise<void> => {
  await ctx.plugin(LlmRuntime);
  await ctx.plugin(SessionStore);
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ToolRuntime, {});
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(JsonlSessionPersistence, { root: persistenceRoot });
  await ctx.plugin(AgentLoop, { agents: [] });
  await ctx.plugin(SubagentRuntime);
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' });
};

export const createFoundationHarness = async (
  options: FoundationHarnessOptions,
): Promise<FoundationHarness> => {
  const ctx = new Context();
  ctx.effect(registerPactSessionEventTypes, 'pact session event catalog');
  await mountFoundationSpine(ctx, options.persistenceRoot);

  const sessions = new Map<string, Session>();
  ctx.on('session/created', (session) => {
    sessions.set(String(session.id), session);
  });
  if (options.scriptedAdapter !== undefined) {
    ctx.llm.registerAdapter(['pact-fake'], options.scriptedAdapter);
  } else {
    await options.mountAdapters(ctx);
  }
  const conductorSelection = options.conductorSelection ?? {
    provider: 'pact-fake',
    model: 'pact-fake',
  };
  const registry = new SubmissionRegistry(options.now);
  const councilRegistry = options.toolProfile === 'council-v2'
    ? options.now === undefined
      ? new CouncilRegistry({ submissions: registry })
      : new CouncilRegistry({ submissions: registry, now: options.now })
    : undefined;
  const councilToolBindings = councilRegistry === undefined
    ? undefined
    : new CouncilToolBindingRegistry();
  if (councilRegistry === undefined) {
    registerPactTools(ctx, registry);
  } else {
    registerCouncilTools(ctx, councilRegistry, councilToolBindings!);
  }
  ctx.subagents.registerContinuableSetup((childCtx) => {
    const child = childCtx.agent;
    if (child === undefined) throw new Error('PACT_CHILD_AGENT_REQUIRED');
    const role = roleForContinuableChild(child.session);
    const releaseBinding = registry.bind(child.id, role);
    const releaseIdentity = childCtx.systemPrompt.section({
      name: 'pact:runtime-identity',
      order: 10,
      text:
        `PACT runtime identity: role=${role}; sessionId=${child.id}. ` +
        'Use these exact runtime-bound values in PACT tool arguments; never invent or alter them.',
    });
    if (councilRegistry !== undefined) {
      childCtx.tools.restrict({ allow: COUNCIL_ROLE_TOOLS });
    }
    return () => {
      releaseIdentity();
      if (councilRegistry === undefined) releaseBinding();
    };
  });

  let active = true;
  return {
    ctx,
    registry,
    ...(councilRegistry === undefined ? {} : { councilRegistry }),
    ...(councilToolBindings === undefined ? {} : { councilToolBindings }),
    persistenceRoot: options.persistenceRoot,
    createConductor: async (sessionId, conductorOptions = {}) => {
      const handle = await ctx.agents.create({
        sessionId,
        agentOptions: conductorSelection,
        setup(agentCtx) {
          const conductor = agentCtx.agent;
          if (conductor === undefined) {
            throw new Error('PACT_CONDUCTOR_AGENT_REQUIRED');
          }
          agentCtx.effect(
            () => registry.bind(conductor.id, 'CaseConductor'),
            'pact conductor role binding',
          );
          agentCtx.systemPrompt.section({
            name: 'pact:runtime-identity',
            order: 10,
            text:
              `PACT runtime identity: role=CaseConductor; sessionId=${conductor.id}. ` +
              'Use these exact runtime-bound values in PACT tool arguments; never invent or alter them.',
          });
          agentCtx.tools.restrict({
            allow: councilRegistry === undefined
              ? ROOT_PACT_TOOLS
              : COUNCIL_ROOT_TOOLS,
          });
        },
      });
      if (conductorOptions.parked ?? true) {
        ctx.on('agent/pre-step', async ({ agent }, next) => {
          if (agent !== handle.agent) return next();
          return { kind: 'reject' as const };
        });
      }
      return handle;
    },
    sessionFor(sessionId) {
      const session = sessions.get(String(sessionId));
      if (session === undefined) {
        throw new Error(`PACT_SESSION_NOT_OBSERVED: ${sessionId}`);
      }
      return session;
    },
    async dispose() {
      if (!active) return;
      active = false;
      await ctx.fiber.dispose();
    },
  };
};

export const coldInspect = async (
  persistenceRoot: string,
  sessionId: SessionId,
): Promise<SessionInspection> => {
  const ctx = new Context();
  ctx.effect(registerPactSessionEventTypes, 'pact cold-read event catalog');
  await ctx.plugin(SessionStore);
  await ctx.plugin(JsonlSessionPersistence, { root: persistenceRoot });
  try {
    return await ctx.sessionPersistence.inspect(sessionId);
  } finally {
    await ctx.fiber.dispose();
  }
};
