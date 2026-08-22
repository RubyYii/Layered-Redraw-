import { createHash } from 'node:crypto';

import type { Context } from '@deepseek-ai/cordis';
import type {
  GenerateOptions,
  StreamChunk,
  TokenUsage,
} from '@deepseek-ai/dsh-llm';
import {
  validateProviderCallEnvelope,
} from '@layered-redraw/pact-cp03-contracts';

import { COMPATIBILITY_LIMITS } from './compatibility-config.js';
import type { CompatibilityProvider } from './compatibility-config.js';
import type {
  ProviderCallEnvelope,
  ProviderToolCallReceipt,
} from './contract-types.js';
import { CompatibilityDispatchError } from './dispatch-budget.js';
import {
  createProviderAttemptRecord,
  type ProviderAttemptRecord,
} from './provider-envelope.js';
import type { ProbeDispatch } from './probe-plan.js';

export interface ProviderStreamAssignment {
  readonly sessionId: string;
  readonly probeId: string;
  readonly provider: CompatibilityProvider;
  readonly route: string;
  readonly model: string;
  readonly dispatches: readonly ProbeDispatch[];
  readonly attachmentId?: string;
}

export interface ProviderDispatchLedgerOptions {
  readonly runId: string;
  readonly maximumDispatches: number;
  readonly providerKind: 'real' | 'scripted';
  readonly deadlineAt?: number;
  readonly now?: () => number;
}

export interface ProviderDispatchLedger {
  readonly sentDispatches: number;
  assignSession(assignment: ProviderStreamAssignment): void;
  attemptRecords(): readonly ProviderAttemptRecord[];
  assertComplete(): ProviderDispatchLedgerSummary;
}

export interface ProviderDispatchLedgerSummary {
  readonly completedAssignments: number;
  readonly sentDispatches: number;
}

interface AssignmentState {
  readonly assignment: ProviderStreamAssignment;
  readonly recordIndexes: number[];
  nextDispatch: number;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const detailCode = (value: string): string => {
  const normalized = value.toUpperCase().replaceAll(/[^A-Z0-9_]/g, '_')
    .replaceAll(/_+/g, '_')
    .slice(0, 80);
  return normalized.length > 0 ? normalized : 'UNKNOWN_ERROR';
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const normalizedToolCallId = (value: string): string =>
  /^tool_[A-Za-z0-9_-]{8,120}$/.test(value)
    ? value
    : `tool_${sha256(value).slice(0, 24)}`;

const envelopeUsage = (
  usage: TokenUsage | null,
): ProviderCallEnvelope['usage'] => {
  if (usage === null) return null;
  const inputTokens = usage.inputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0);
  return {
    inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: inputTokens + usage.outputTokens,
    estimatedCostUsd: null,
  };
};

const envelopeFinish = (
  chunk: Extract<StreamChunk, { type: 'finish' }> | null,
  thrown: unknown,
): ProviderCallEnvelope['finish'] => {
  if (thrown !== undefined) {
    return { kind: 'error', detailCode: detailCode(messageOf(thrown)) };
  }
  if (chunk === null) return { kind: 'error', detailCode: 'FINISH_MISSING' };
  switch (chunk.reason.kind) {
    case 'stop':
      return { kind: 'stop' };
    case 'tool-calls':
      return { kind: 'tool_calls' };
    case 'max-tokens':
      return { kind: 'length' };
    case 'aborted':
      return {
        kind: 'aborted',
        detailCode: detailCode(chunk.reason.failure.code),
      };
    case 'error':
      return {
        kind: 'error',
        detailCode: detailCode(chunk.reason.failure.code),
      };
    default:
      return { kind: 'error', detailCode: 'FINISH_UNKNOWN' };
  }
};

class InstalledProviderDispatchLedger implements ProviderDispatchLedger {
  private sent = 0;
  private readonly assignments = new Map<string, AssignmentState>();
  private readonly records: ProviderAttemptRecord[] = [];
  private readonly latestRecordBySession = new Map<string, number>();
  private readonly recordByRawToolCallId = new Map<string, number>();
  private readonly now: () => number;
  private readonly deadlineAt: number;

  constructor(
    ctx: Context,
    private readonly options: ProviderDispatchLedgerOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.deadlineAt = options.deadlineAt ??
      this.now() + COMPATIBILITY_LIMITS.deadlineMs;
    ctx.on('llm/stream', (request, next) =>
      this.intercept(request, next)
    );
    ctx.on('session/event', (session, event) => {
      const sessionId = String(session.id);
      if (event.type === 'tool/call') {
        this.observeToolCall(
          sessionId,
          String(event.data.callId),
          event.data.name,
          event.data.arguments,
        );
      } else if (event.type === 'tool/result') {
        const block = event.data.message.content[0];
        if (block?.type === 'tool-result') {
          this.observeToolResult(
            String(block.toolCallId),
            block.isError === true || event.data.error !== undefined,
          );
        }
      } else if (event.type === 'pact/public-trace') {
        this.observePublicTrace(sessionId, event.time);
      }
    });
  }

  get sentDispatches(): number {
    return this.sent;
  }

  assignSession(assignment: ProviderStreamAssignment): void {
    const sessionId = String(assignment.sessionId);
    if (this.assignments.has(sessionId)) {
      throw new CompatibilityDispatchError(
        'PROVIDER_SESSION_ALREADY_ASSIGNED',
        `provider session ${sessionId} already has a probe assignment`,
      );
    }
    if (assignment.dispatches.length === 0) {
      throw new CompatibilityDispatchError(
        'PROVIDER_SESSION_DISPATCH_PLAN_EMPTY',
        `${assignment.probeId} has no provider dispatches`,
      );
    }
    this.assignments.set(sessionId, {
      assignment,
      recordIndexes: [],
      nextDispatch: 0,
    });
  }

  attemptRecords(): readonly ProviderAttemptRecord[] {
    return [...this.records];
  }

  assertComplete(): ProviderDispatchLedgerSummary {
    for (const state of this.assignments.values()) {
      if (state.nextDispatch !== state.assignment.dispatches.length) {
        throw new CompatibilityDispatchError(
          'PROVIDER_SESSION_DISPATCH_PLAN_INCOMPLETE',
          `PROVIDER_SESSION_DISPATCH_PLAN_INCOMPLETE: ${state.assignment.probeId} completed ${state.nextDispatch}/${state.assignment.dispatches.length} dispatches`,
        );
      }
      state.assignment.dispatches.forEach((dispatch, index) => {
        const recordIndex = state.recordIndexes[index];
        const record = recordIndex === undefined
          ? undefined
          : this.records[recordIndex];
        if (record === undefined) {
          throw new CompatibilityDispatchError(
            'PROVIDER_ATTEMPT_RECORD_MISSING',
            `PROVIDER_ATTEMPT_RECORD_MISSING: ${state.assignment.probeId} dispatch ${index + 1}`,
          );
        }
        if (dispatch.expectedOutcome === 'structured-tool') {
          if (record.contract.finish.kind !== 'tool_calls') {
            throw new CompatibilityDispatchError(
              'STRUCTURED_SUBMISSION_MISSING',
              `STRUCTURED_SUBMISSION_MISSING: ${state.assignment.probeId} ended with ${record.contract.finish.kind}`,
            );
          }
          const expected = [...(dispatch.expectedTools ?? [])].sort();
          const observed = record.contract.toolCalls.map((receipt) =>
            receipt.name
          ).sort();
          if (
            expected.length !== observed.length ||
            expected.some((name, toolIndex) => name !== observed[toolIndex])
          ) {
            throw new CompatibilityDispatchError(
              'EXPECTED_PROVIDER_TOOL_MISSING',
              `EXPECTED_PROVIDER_TOOL_MISSING: ${state.assignment.probeId} expected ${expected.join(',')} but observed ${observed.join(',')}`,
            );
          }
          if (record.contract.toolCalls.some(
            (receipt) => receipt.status !== 'accepted'
          )) {
            throw new CompatibilityDispatchError(
              'PROVIDER_TOOL_NOT_ACCEPTED',
              `PROVIDER_TOOL_NOT_ACCEPTED: ${state.assignment.probeId}`,
            );
          }
          return;
        }
        const expectedFinish = dispatch.expectedOutcome ===
            'terminal-after-tool-result'
          ? 'stop'
          : 'aborted';
        if (record.contract.finish.kind !== expectedFinish) {
          throw new CompatibilityDispatchError(
            'EXPECTED_PROVIDER_OUTCOME_MISSING',
            `EXPECTED_PROVIDER_OUTCOME_MISSING: ${state.assignment.probeId} expected ${dispatch.expectedOutcome} but observed ${record.contract.finish.kind}`,
          );
        }
        if (record.contract.toolCalls.some(
          (receipt) => receipt.status === 'accepted'
        )) {
          throw new CompatibilityDispatchError(
            'UNEXPECTED_PROVIDER_SIDE_EFFECT',
            `UNEXPECTED_PROVIDER_SIDE_EFFECT: ${state.assignment.probeId}`,
          );
        }
      });
    }
    return {
      completedAssignments: this.assignments.size,
      sentDispatches: this.sent,
    };
  }

  private intercept(
    request: GenerateOptions,
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    const sessionId = request.sessionId === undefined
      ? undefined
      : String(request.sessionId);
    if (sessionId === undefined) {
      throw new CompatibilityDispatchError(
        'PROVIDER_SESSION_NOT_ASSIGNED',
        'refused an unassigned DSH provider stream',
      );
    }
    const state = this.assignments.get(sessionId);
    if (state === undefined) {
      throw new CompatibilityDispatchError(
        'PROVIDER_SESSION_NOT_ASSIGNED',
        'refused an unassigned DSH provider stream',
      );
    }
    const dispatch = state.assignment.dispatches[state.nextDispatch];
    if (dispatch === undefined) {
      throw new CompatibilityDispatchError(
        'PROVIDER_SESSION_DISPATCH_PLAN_EXHAUSTED',
        `${state.assignment.probeId} opened an undisclosed provider dispatch`,
      );
    }
    if (
      request.provider !== state.assignment.route ||
      request.model !== state.assignment.model
    ) {
      throw new CompatibilityDispatchError(
        'PROVIDER_SESSION_ROUTE_MISMATCH',
        `${state.assignment.probeId} requested ${request.provider}/${request.model}`,
      );
    }
    if (this.now() >= this.deadlineAt) {
      throw new CompatibilityDispatchError(
        'COMPATIBILITY_DEADLINE_EXCEEDED',
        `deadline reached before ${state.assignment.probeId}`,
      );
    }
    if (this.sent >= this.options.maximumDispatches) {
      throw new CompatibilityDispatchError(
        'DISPATCH_BUDGET_EXHAUSTED',
        `refused dispatch ${this.sent + 1}; hard maximum is ${this.options.maximumDispatches}`,
      );
    }

    const nextOrdinal = this.sent + 1;
    const startedAt = new Date(this.now()).toISOString();
    const record = createProviderAttemptRecord({
      probeId: state.assignment.probeId,
      provider: state.assignment.provider,
      route: state.assignment.route,
      model: state.assignment.model,
      purpose: dispatch.purpose,
      expectedOutcome: dispatch.expectedOutcome,
      providerKind: this.options.providerKind,
      ...(dispatch.expectedTools === undefined
        ? {}
        : { expectedTools: dispatch.expectedTools }),
      ...(dispatch.syntheticImage === true &&
          state.assignment.attachmentId !== undefined
        ? { attachmentId: state.assignment.attachmentId }
        : {}),
    }, this.options.runId, 1, nextOrdinal, this.deadlineAt, startedAt, null);
    this.sent = nextOrdinal;
    state.nextDispatch += 1;
    const recordIndex = this.records.push(record) - 1;
    state.recordIndexes.push(recordIndex);
    this.latestRecordBySession.set(sessionId, recordIndex);
    return this.observeStream(recordIndex, next());
  }

  private async *observeStream(
    recordIndex: number,
    stream: AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    let firstChunkAt: string | null = null;
    let usage: TokenUsage | null = null;
    let finish: Extract<StreamChunk, { type: 'finish' }> | null = null;
    let thrown: unknown = undefined;
    try {
      for await (const chunk of stream) {
        if (firstChunkAt === null) {
          firstChunkAt = new Date(this.now()).toISOString();
        }
        if (chunk.type === 'usage') usage = chunk.usage;
        if (chunk.type === 'finish') finish = chunk;
        yield chunk;
      }
    } catch (error) {
      thrown = error;
      throw error;
    } finally {
      const endedAt = new Date(this.now()).toISOString();
      const record = this.records[recordIndex];
      if (record !== undefined) {
        const startedMs = Date.parse(record.contract.startedAt);
        this.replaceContract(recordIndex, {
          firstChunkAt,
          endedAt,
          latencyMs: Math.max(0, Date.parse(endedAt) - startedMs),
          usage: envelopeUsage(usage),
          finish: envelopeFinish(finish, thrown),
        });
      }
    }
  }

  private observeToolCall(
    sessionId: string,
    rawCallId: string,
    name: string,
    rawArguments: string,
  ): void {
    const recordIndex = this.latestRecordBySession.get(sessionId);
    if (recordIndex === undefined) return;
    const record = this.records[recordIndex];
    if (record === undefined) return;
    const receipt: ProviderToolCallReceipt = {
      toolCallId: normalizedToolCallId(rawCallId),
      name,
      argumentsHash: sha256(rawArguments),
      status: 'observed',
    };
    this.recordByRawToolCallId.set(rawCallId, recordIndex);
    this.replaceContract(recordIndex, {
      toolCalls: [...record.contract.toolCalls, receipt],
    });
  }

  private observeToolResult(rawCallId: string, rejected: boolean): void {
    const recordIndex = this.recordByRawToolCallId.get(rawCallId);
    if (recordIndex === undefined) return;
    const record = this.records[recordIndex];
    if (record === undefined) return;
    const toolCallId = normalizedToolCallId(rawCallId);
    this.replaceContract(recordIndex, {
      toolCalls: record.contract.toolCalls.map((receipt) =>
        receipt.toolCallId === toolCallId
          ? { ...receipt, status: rejected ? 'rejected' : 'accepted' }
          : receipt
      ),
    });
  }

  private observePublicTrace(sessionId: string, time: number): void {
    const recordIndex = this.latestRecordBySession.get(sessionId);
    if (recordIndex === undefined) return;
    const record = this.records[recordIndex];
    if (
      record === undefined ||
      !record.expectedTools.includes('pact_publish_trace')
    ) return;
    this.replaceContract(recordIndex, {
      firstPublicTraceAt: new Date(time).toISOString(),
    });
  }

  private replaceContract(
    recordIndex: number,
    patch: Partial<ProviderCallEnvelope>,
  ): void {
    const record = this.records[recordIndex];
    if (record === undefined) return;
    const contract = validateProviderCallEnvelope({
      ...record.contract,
      ...patch,
    }) as ProviderCallEnvelope;
    this.records[recordIndex] = { ...record, contract };
  }
}

export const installProviderDispatchLedger = (
  ctx: Context,
  options: ProviderDispatchLedgerOptions,
): ProviderDispatchLedger => new InstalledProviderDispatchLedger(ctx, options);
