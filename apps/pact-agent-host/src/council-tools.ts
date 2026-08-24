import type { Context } from '@deepseek-ai/cordis';
import type { JsonValue } from '@deepseek-ai/dsh-session';
import type {
  JsonSchemaNode,
  ToolDefinition,
  ToolOutputDefinition,
  ToolRunContext,
} from '@deepseek-ai/dsh-tools';
import {
  conductorDraftCommitSchema,
  councilShardSchema,
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';

import type {
  CouncilShard,
  ConductorDraftCommit,
} from './contract-types.js';
import {
  CouncilRegistry,
  type CouncilCommitReceipt,
  type CouncilShardReceipt,
} from './council-registry.js';
import type { PactRole } from './events.js';
import { SubmissionRegistry } from './submission-registry.js';

export const COUNCIL_ROOT_TOOLS = [
  'pact_submit_council_shard',
  'pact_submit_conductor_commit',
] as const;

export const COUNCIL_ROLE_TOOLS = [
  'pact_submit_council_shard',
] as const;

const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accepted'] as string[],
  properties: {
    accepted: { type: 'boolean' },
    turnId: { type: 'string' },
    shardId: { type: 'string' },
    payloadHash: { type: 'string' },
    reasonCode: { type: 'string' },
    acceptanceSequence: {
      oneOf: [{ type: 'number' }, { type: 'null' }],
    },
    projectedTrace: { type: 'boolean' },
    acceptedAtMonotonicMs: {
      oneOf: [{ type: 'number' }, { type: 'null' }],
    },
    shardEventSeq: {
      oneOf: [{ type: 'number' }, { type: 'null' }],
    },
    traceEventSeq: {
      oneOf: [{ type: 'number' }, { type: 'null' }],
    },
    commitEventSeq: {
      oneOf: [{ type: 'number' }, { type: 'null' }],
    },
  },
} satisfies JsonSchemaNode;

const renderReceipt = (_args: unknown, value: JsonValue) => {
  const accepted =
    typeof value === 'object' && value !== null && !Array.isArray(value) &&
    value.accepted === true;
  const hash =
    typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof value.payloadHash === 'string'
      ? value.payloadHash
      : 'invalid-receipt';
  return [{
    type: 'text' as const,
    text: accepted ? `accepted ${hash}` : `rejected ${hash}`,
  }];
};

const receiptOutput: ToolOutputDefinition = {
  schema: receiptSchema,
  render: renderReceipt,
};

const requireAgent = (exec: ToolRunContext) => {
  if (exec.agent === undefined) throw new Error('PACT_AGENT_IDENTITY_REQUIRED');
  return exec.agent;
};

const assertRole = (
  submissions: SubmissionRegistry,
  exec: ToolRunContext,
  expected: PactRole,
) => {
  const agent = requireAgent(exec);
  if (submissions.bindingFor(agent.id).role !== expected) {
    throw new Error('PACT_ROLE_OR_SESSION_FORGERY');
  }
  return agent;
};

export const councilToolDefinitions = (
  registry: CouncilRegistry,
  submissions: SubmissionRegistry = registry.submissions,
): readonly ToolDefinition[] => {
  const submitShard = {
    name: 'pact_submit_council_shard',
    description:
      'Submit one typed council-v2 shard from the runtime-bound council role.',
    parameters: councilShardSchema,
    output: receiptOutput,
    async execute(args: unknown, exec: ToolRunContext): Promise<CouncilShardReceipt> {
      const agent = requireAgent(exec);
      const binding = submissions.bindingFor(agent.id);
      const shard = validateCouncilShard(args) as CouncilShard;
      if (
        shard.role !== binding.role ||
        shard.childSessionId !== String(agent.id)
      ) {
        throw new Error('PACT_ROLE_OR_SESSION_FORGERY');
      }
      return registry.acceptShard(agent.session, shard);
    },
  } satisfies ToolDefinition;

  const submitCommit = {
    name: 'pact_submit_conductor_commit',
    description:
      'Submit one typed conductor commit; assembly remains behind durability.',
    parameters: conductorDraftCommitSchema,
    output: receiptOutput,
    async execute(args: unknown, exec: ToolRunContext): Promise<CouncilCommitReceipt> {
      const agent = assertRole(submissions, exec, 'CaseConductor');
      const commit = validateConductorDraftCommit(args) as ConductorDraftCommit;
      return registry.acceptCommit(agent.session, commit);
    },
  } satisfies ToolDefinition;

  return [submitShard, submitCommit];
};

export const registerCouncilTools = (
  ctx: Context,
  registry: CouncilRegistry,
): (() => void) => {
  const submissions = registry.submissions;
  const disposers = councilToolDefinitions(registry, submissions).map((definition) =>
    ctx.tools.register(definition)
  );
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const dispose of disposers.reverse()) dispose();
  };
};
