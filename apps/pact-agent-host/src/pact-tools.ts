import type { Context } from '@deepseek-ai/cordis';
import type { JsonValue } from '@deepseek-ai/dsh-session';
import type {
  JsonSchemaNode,
  ToolDefinition,
  ToolOutputDefinition,
  ToolRunContext,
} from '@deepseek-ai/dsh-tools';
import {
  agentActionDraftSchema,
  agentContributionSchema,
  validateAgentActionDraft,
  validateAgentContribution,
} from '@layered-redraw/pact-cp03-contracts';

import type {
  AgentActionDraft,
  AgentContribution,
} from './contract-types.js';
import type { PactRole } from './events.js';
import {
  SubmissionRegistry,
  type SubmissionReceipt,
} from './submission-registry.js';

export const ROOT_PACT_TOOLS = [
  'pact_publish_trace',
  'pact_route_turn',
  'pact_submit_draft',
] as const;

export const ROLE_PACT_TOOLS = [
  'pact_publish_trace',
  'pact_submit_contribution',
] as const;

const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accepted', 'payloadHash'] as string[],
  properties: {
    accepted: { type: 'boolean' },
    payloadHash: { type: 'string' },
    acceptedAtMonotonicMs: { type: 'number' },
  },
} satisfies JsonSchemaNode;

const traceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['turnId', 'role', 'text'],
  properties: {
    turnId: {
      type: 'string',
      pattern: '^turn_[A-Za-z0-9_-]{8,80}$',
    },
    role: {
      enum: ['CaseConductor', 'Witness', 'Archivist', 'Rewriter', 'Guardian'],
    },
    text: { type: 'string', minLength: 1, maxLength: 2000 },
  },
} as const;

const routeSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'turnId',
    'publicTrace',
    'roles',
    'rationale',
    'uncertainties',
  ],
  properties: {
    turnId: {
      type: 'string',
      pattern: '^turn_[A-Za-z0-9_-]{8,80}$',
    },
    publicTrace: { type: 'string', minLength: 1, maxLength: 2000 },
    roles: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      uniqueItems: true,
      items: { enum: ['Witness', 'Archivist', 'Rewriter', 'Guardian'] },
    },
    rationale: { type: 'string', minLength: 1, maxLength: 2000 },
    uncertainties: {
      type: 'array',
      maxItems: 16,
      items: { type: 'string', minLength: 1, maxLength: 2000 },
    },
  },
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index]);
};

const boundedText = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 2000;

const turnId = (value: unknown): value is string =>
  typeof value === 'string' && /^turn_[A-Za-z0-9_-]{8,80}$/.test(value);

const pactRoles = new Set<PactRole>([
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
]);

const role = (value: unknown): value is PactRole =>
  typeof value === 'string' && pactRoles.has(value as PactRole);

interface TraceArgs {
  readonly turnId: string;
  readonly role: PactRole;
  readonly text: string;
}

const validateTrace = (value: unknown): TraceArgs => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['role', 'text', 'turnId']) ||
    !turnId(value.turnId) ||
    !role(value.role) ||
    !boundedText(value.text)
  ) {
    throw new TypeError('PactPublicTrace validation failed');
  }
  return { turnId: value.turnId, role: value.role, text: value.text };
};

interface RouteArgs extends Readonly<Record<string, unknown>> {
  readonly turnId: string;
  readonly publicTrace: string;
  readonly roles: readonly Exclude<PactRole, 'CaseConductor'>[];
  readonly rationale: string;
  readonly uncertainties: readonly string[];
}

const childRoles = new Set<Exclude<PactRole, 'CaseConductor'>>([
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
]);

const validateRoute = (value: unknown): RouteArgs => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'publicTrace',
      'rationale',
      'roles',
      'turnId',
      'uncertainties',
    ]) ||
    !turnId(value.turnId) ||
    !boundedText(value.publicTrace) ||
    !boundedText(value.rationale) ||
    !Array.isArray(value.roles) ||
    value.roles.length < 1 ||
    value.roles.length > 4 ||
    !value.roles.every((item) =>
      typeof item === 'string' &&
      childRoles.has(item as Exclude<PactRole, 'CaseConductor'>)
    ) ||
    new Set(value.roles).size !== value.roles.length ||
    !Array.isArray(value.uncertainties) ||
    value.uncertainties.length > 16 ||
    !value.uncertainties.every(boundedText)
  ) {
    throw new TypeError('PactRouteTurn validation failed');
  }
  return {
    turnId: value.turnId,
    publicTrace: value.publicTrace,
    roles: value.roles as Exclude<PactRole, 'CaseConductor'>[],
    rationale: value.rationale,
    uncertainties: value.uncertainties as string[],
  };
};

const requireAgent = (exec: ToolRunContext) => {
  if (exec.agent === undefined) throw new Error('PACT_AGENT_IDENTITY_REQUIRED');
  return exec.agent;
};

const assertRole = (
  registry: SubmissionRegistry,
  exec: ToolRunContext,
  expected: PactRole,
) => {
  const agent = requireAgent(exec);
  if (registry.bindingFor(agent.id).role !== expected) {
    throw new Error('PACT_ROLE_OR_SESSION_FORGERY');
  }
  return agent;
};

const renderReceipt = (_args: unknown, value: JsonValue) => {
  const accepted = isRecord(value) && value.accepted === true;
  const payloadHash =
    isRecord(value) && typeof value.payloadHash === 'string'
      ? value.payloadHash
      : 'invalid-receipt';
  return [{
    type: 'text' as const,
    text: accepted ? `accepted ${payloadHash}` : `rejected ${payloadHash}`,
  }];
};

const receiptOutput: ToolOutputDefinition = {
  schema: receiptSchema,
  render: renderReceipt,
};

export const pactToolDefinitions = (
  registry: SubmissionRegistry,
): readonly ToolDefinition[] => {
  const publishTrace = {
    name: 'pact_publish_trace',
    description: 'Publish one bounded public PACT trace under the runtime-bound role.',
    parameters: traceSchema,
    output: receiptOutput,
    async execute(args: unknown, exec: ToolRunContext): Promise<SubmissionReceipt> {
      const agent = requireAgent(exec);
      const validated = validateTrace(args);
      const binding = registry.bindingFor(agent.id);
      if (validated.role !== binding.role) {
        throw new Error('PACT_ROLE_OR_SESSION_FORGERY');
      }
      return registry.publishTrace(agent.session, validated);
    },
  } satisfies ToolDefinition;

  const routeTurn = {
    name: 'pact_route_turn',
    description:
      'Propose a bounded role route and public rationale; this tool schedules nothing.',
    parameters: routeSchema,
    output: receiptOutput,
    async execute(args: unknown, exec: ToolRunContext): Promise<SubmissionReceipt> {
      const agent = assertRole(registry, exec, 'CaseConductor');
      return registry.recordRoute(agent.session, validateRoute(args));
    },
  } satisfies ToolDefinition;

  const submitContribution = {
    name: 'pact_submit_contribution',
    description: 'Submit one public, schema-constrained PACT role contribution.',
    parameters: agentContributionSchema,
    output: receiptOutput,
    async execute(args: unknown, exec: ToolRunContext): Promise<SubmissionReceipt> {
      const agent = requireAgent(exec);
      const binding = registry.bindingFor(agent.id);
      const validated = validateAgentContribution(args) as AgentContribution;
      if (
        validated.role !== binding.role ||
        validated.childSessionId !== agent.id
      ) {
        throw new Error('PACT_ROLE_OR_SESSION_FORGERY');
      }
      return registry.acceptContribution(agent.session, validated);
    },
  } satisfies ToolDefinition;

  const submitDraft = {
    name: 'pact_submit_draft',
    description:
      'Submit one schema-constrained compatibility or executable proposal draft from the CaseConductor.',
    parameters: agentActionDraftSchema,
    output: receiptOutput,
    async execute(args: unknown, exec: ToolRunContext): Promise<SubmissionReceipt> {
      const agent = assertRole(registry, exec, 'CaseConductor');
      const validated = validateAgentActionDraft(args) as AgentActionDraft;
      if (validated.identity.caseSessionId !== agent.id) {
        throw new Error('PACT_ROLE_OR_SESSION_FORGERY');
      }
      return registry.acceptDraft(agent.session, validated);
    },
  } satisfies ToolDefinition;

  return [publishTrace, routeTurn, submitContribution, submitDraft];
};

export const registerPactTools = (
  ctx: Context,
  registry: SubmissionRegistry,
): (() => void) => {
  const disposers = pactToolDefinitions(registry).map((definition) =>
    ctx.tools.register(definition)
  );
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const dispose of disposers.reverse()) dispose();
  };
};
