import { createRequire } from 'node:module';

import {
  CP03_FOUNDATION_SCHEMA_VERSION,
  validateProviderCallEnvelope,
} from '@layered-redraw/pact-cp03-contracts';

import {
  COMPATIBILITY_LIMITS,
  type CompatibilityProvider,
} from './compatibility-config.js';
import type {
  ProviderCallEnvelope,
  ProviderToolCallReceipt,
} from './contract-types.js';
import type {
  PactCompatibilityTool,
  ProbeExpectedOutcome,
} from './probe-plan.js';

const require = createRequire(import.meta.url);

const adapterFor = (provider: CompatibilityProvider) => {
  const adapterPackage = provider === 'deepseek'
    ? '@deepseek-ai/dsh-llm-deepseek'
    : '@deepseek-ai/dsh-llm-pi-ai';
  const packageJson: unknown = require(`${adapterPackage}/package.json`);
  if (
    typeof packageJson !== 'object' || packageJson === null ||
    !('version' in packageJson) || typeof packageJson.version !== 'string'
  ) {
    throw new Error(`PACKAGE_VERSION_UNRESOLVED: ${adapterPackage}`);
  }
  return { adapterPackage, adapterVersion: packageJson.version };
};

export interface ProviderDispatchRequest {
  readonly probeId: string;
  readonly provider: CompatibilityProvider;
  readonly route: string;
  readonly model: string;
  readonly purpose: string;
  readonly expectedOutcome: ProbeExpectedOutcome;
  readonly expectedTools?: readonly PactCompatibilityTool[];
  readonly attachmentId?: string;
  readonly providerKind?: 'real' | 'scripted';
}

export interface ProviderAttemptRecord {
  readonly runId: string;
  readonly probeId: string;
  readonly provider: CompatibilityProvider;
  readonly purpose: string;
  readonly expectedOutcome: ProbeExpectedOutcome;
  readonly expectedTools: readonly PactCompatibilityTool[];
  readonly attachmentId: string | null;
  readonly attempt: number;
  readonly sentOrdinal: number;
  readonly deadlineAt: number;
  readonly requestPolicy: {
    readonly reasoningEffort: 'off' | 'provider-default';
    readonly inputTokens: number;
    readonly maxOutputTokens: number;
  };
  readonly contract: ProviderCallEnvelope;
}

export interface ProviderEnvelopeResult {
  readonly outcome: ProbeExpectedOutcome | 'plain-json';
  readonly sideEffectAccepted: boolean;
  readonly failureCode?: string;
}

const callId = (
  runId: string,
  probeId: string,
  sentOrdinal: number,
): string => {
  const safeRun = runId.replaceAll(/[^A-Za-z0-9_-]/g, '_').slice(0, 56);
  const safeProbe = probeId.replaceAll(/[^A-Za-z0-9_-]/g, '_').slice(0, 24);
  return `call_${safeRun}_${safeProbe}_${sentOrdinal}`.slice(0, 125);
};

const pendingContract = (
  request: ProviderDispatchRequest,
  runId: string,
  sentOrdinal: number,
  startedAt: string,
  retryOf: string | null,
): ProviderCallEnvelope => {
  const adapter = adapterFor(request.provider);
  return validateProviderCallEnvelope({
    schemaVersion: CP03_FOUNDATION_SCHEMA_VERSION,
    callId: callId(runId, request.probeId, sentOrdinal),
    providerRoute: request.route,
    modelId: request.model,
    adapterPackage: adapter.adapterPackage,
    adapterVersion: adapter.adapterVersion,
    providerKind: request.providerKind ?? 'scripted',
    inputClasses: request.attachmentId === undefined
      ? ['fictional_text']
      : ['fictional_text', 'synthetic_image'],
    startedAt,
    firstChunkAt: null,
    firstPublicTraceAt: null,
    endedAt: null,
    latencyMs: null,
    usage: null,
    finish: { kind: 'pending' },
    toolCalls: [],
    sessionEventRange: null,
    retryOf,
    lateQuarantined: false,
    nativeResponseSchema: 'UNSUPPORTED_ON_DSH_ROOT_CONTINUABLE_RC6',
  }) as ProviderCallEnvelope;
};

export const createProviderAttemptRecord = (
  request: ProviderDispatchRequest,
  runId: string,
  attempt: number,
  sentOrdinal: number,
  deadlineAt: number,
  startedAt: string,
  retryOf: string | null,
): ProviderAttemptRecord => {
  if (
    request.attachmentId !== undefined &&
    !/^sha256:[a-f0-9]{64}$/.test(request.attachmentId)
  ) {
    throw new TypeError('SYNTHETIC_ATTACHMENT_REFERENCE_INVALID');
  }
  return {
    runId,
    probeId: request.probeId,
    provider: request.provider,
    purpose: request.purpose,
    expectedOutcome: request.expectedOutcome,
    expectedTools: Object.freeze([...(request.expectedTools ?? [])]),
    attachmentId: request.attachmentId ?? null,
    attempt,
    sentOrdinal,
    deadlineAt,
    requestPolicy: {
      reasoningEffort: COMPATIBILITY_LIMITS.reasoningEffort[request.provider],
      inputTokens: COMPATIBILITY_LIMITS.inputTokensPerDispatch,
      maxOutputTokens: COMPATIBILITY_LIMITS.maxOutputTokensPerDispatch,
    },
    contract: pendingContract(
      request,
      runId,
      sentOrdinal,
      startedAt,
      retryOf,
    ),
  };
};

const toolReceipts = (
  record: ProviderAttemptRecord,
  accepted: boolean,
): readonly ProviderToolCallReceipt[] => record.expectedTools.map(
  (name, index) => ({
    toolCallId: `tool_${record.sentOrdinal}_${index}_${record.probeId}`,
    name,
    argumentsHash: '0'.repeat(64),
    status: accepted ? 'accepted' as const : 'observed' as const,
  }),
);

export const finalizeProviderAttemptRecord = (
  record: ProviderAttemptRecord,
  result: ProviderEnvelopeResult,
  endedAt: string,
): ProviderAttemptRecord => {
  const startedMs = Date.parse(record.contract.startedAt);
  const endedMs = Date.parse(endedAt);
  const successfulChunk = result.failureCode === undefined;
  const finish = result.failureCode !== undefined
    ? { kind: 'error' as const, detailCode: result.failureCode }
    : result.outcome === 'structured-tool'
      ? { kind: 'tool_calls' as const }
      : result.outcome === 'hard-timeout-cancel' ||
          result.outcome === 'cancel-after-first-chunk'
        ? { kind: 'aborted' as const }
        : { kind: 'stop' as const };
  const acceptedTools =
    result.outcome === 'structured-tool' && result.sideEffectAccepted;
  const contract = validateProviderCallEnvelope({
    ...record.contract,
    firstChunkAt: successfulChunk ? endedAt : null,
    firstPublicTraceAt:
      acceptedTools && record.expectedTools.includes('pact_publish_trace')
        ? endedAt
        : null,
    endedAt,
    latencyMs: Math.max(0, endedMs - startedMs),
    finish,
    toolCalls: result.outcome === 'structured-tool'
      ? toolReceipts(record, acceptedTools)
      : [],
  }) as ProviderCallEnvelope;
  return { ...record, contract };
};
