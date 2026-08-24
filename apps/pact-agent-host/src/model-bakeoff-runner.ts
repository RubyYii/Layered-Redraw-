import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import * as cp03Contracts from '@layered-redraw/pact-cp03-contracts';

import {
  MODEL_BAKEOFF_APPROVAL_MAX_AGE_MS,
  type ModelBakeoffApproval,
} from './model-bakeoff-gate.js';
import {
  BAKEOFF_MAXIMUM_DISPATCHES,
  BAKEOFF_PLANNED_DISPATCHES,
  type ModelBakeoffCase,
  type ModelBakeoffProvider,
} from './model-bakeoff-plan.js';
import {
  verifyModelBakeoffPreflight,
  type ModelBakeoffPreflight,
} from './model-bakeoff-preflight.js';

const validateModelBakeoffApproval = (
  cp03Contracts as unknown as {
    readonly validateModelBakeoffApproval: (value: unknown) => unknown;
  }
).validateModelBakeoffApproval;

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DETAIL_CODE = /^[A-Z0-9_]{1,96}$/;

export type ModelBakeoffTransportResultKind =
  | 'accepted'
  | 'refusal'
  | 'transport_failure'
  | 'schema_failure'
  | 'content_failure'
  | 'grounding_failure'
  | 'late'
  | 'cancelled'
  | 'provider_error';

export interface ModelBakeoffProviderFacts {
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly catalogPackage: string | null;
  readonly catalogVersion: string | null;
}

export interface ModelBakeoffToolResult {
  readonly name: 'pact_submit_council_shard' | 'pact_submit_conductor_commit';
  readonly contract: 'council-shard/0.1' | 'conductor-draft-commit/0.1';
  readonly accepted: boolean;
  readonly payloadSha256: string;
}

export interface ModelBakeoffSessionEventRange {
  readonly sessionId: string;
  readonly fromSequence: number;
  readonly toSequence: number;
}

export interface ModelBakeoffTransportResult {
  readonly kind: ModelBakeoffTransportResultKind;
  readonly detailCode: string | null;
  readonly preSideEffect: boolean;
  readonly sideEffectAccepted: boolean;
  readonly providerRequestMade: boolean;
  readonly firstChunkDelayMs: number | null;
  readonly firstPublicTraceDelayMs: number | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostUsd: number;
  };
  readonly providerFacts: ModelBakeoffProviderFacts;
  readonly toolResult: ModelBakeoffToolResult;
  readonly groundedInputRefs: readonly string[];
  readonly redactedOutputSha256: string;
  readonly sessionEventRange: ModelBakeoffSessionEventRange;
}

export interface ModelBakeoffDispatchRequest {
  readonly runId: string;
  readonly approvalId: string;
  readonly case: ModelBakeoffCase;
  readonly attemptId: string;
  readonly attemptOrdinal: 1 | 2;
  readonly sentOrdinal: number;
  readonly retryOf: string | null;
}

export interface ModelBakeoffTransport {
  dispatch(request: ModelBakeoffDispatchRequest): Promise<ModelBakeoffTransportResult>;
  dispose(): Promise<void>;
}

export interface ModelBakeoffAttemptRecord {
  readonly schemaVersion: 'cp03-model-bakeoff-attempt/0.1';
  readonly runId: string;
  readonly approvalId: string;
  readonly caseId: string;
  readonly attemptId: string;
  readonly plannedOrdinal: number;
  readonly attemptOrdinal: 1 | 2;
  readonly sentOrdinal: number;
  readonly provider: ModelBakeoffProvider;
  readonly route: 'deepseek-official' | 'google';
  readonly model: ModelBakeoffCase['model'];
  readonly providerFacts: ModelBakeoffProviderFacts;
  readonly phase: ModelBakeoffCase['phase'];
  readonly role: ModelBakeoffCase['role'];
  readonly repetition: ModelBakeoffCase['repetition'];
  readonly planSha256: string;
  readonly fixtureManifestSha256: string;
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly pricingManifestSha256: string;
  readonly tokenCapsSha256: string;
  readonly startedAt: string;
  readonly firstChunkAt: string | null;
  readonly firstPublicTraceAt: string | null;
  readonly endedAt: string;
  readonly latency: {
    readonly completeMs: number;
    readonly publicTraceMs: number | null;
  };
  readonly usage: ModelBakeoffTransportResult['usage'] & {
    readonly costKind: 'ESTIMATE_NOT_BILLING';
  };
  readonly finish: {
    readonly kind:
      | 'accepted'
      | 'refused'
      | 'transport_failure'
      | 'schema_failure'
      | 'content_failure'
      | 'grounding_failure'
      | 'late'
      | 'cancelled'
      | 'provider_error';
    readonly detailCode: string | null;
  };
  readonly refusal: null | { readonly code: string; readonly messageSha256: string };
  readonly error: null | {
    readonly kind: 'transport' | 'provider' | 'schema' | 'content' | 'grounding' | 'timeout' | 'integrity';
    readonly code: string;
  };
  readonly preSideEffect: boolean;
  readonly sideEffectAccepted: boolean;
  readonly retryOf: string | null;
  readonly retryEligible: boolean;
  readonly toolResult: ModelBakeoffToolResult;
  readonly groundedInputRefs: readonly string[];
  readonly redactedOutputSha256: string;
  readonly durableReceiptSha256: string;
  readonly sessionEventRange: ModelBakeoffSessionEventRange;
}

export interface ModelBakeoffCaseOutcome {
  readonly caseId: string;
  readonly plannedOrdinal: number;
  readonly status: 'ACCEPTED' | 'FAILED' | 'SKIPPED';
  readonly code: string;
  readonly finalAttemptId: string | null;
}

export interface ModelBakeoffRunResult {
  readonly status: 'COMPLETED' | 'PARTIAL' | 'REFUSED';
  readonly stopCode: string | null;
  readonly counts: {
    readonly planned: 28;
    readonly sent: number;
    readonly accepted: number;
    readonly failed: number;
    readonly skipped: number;
    readonly maximum: 30;
  };
  readonly retryUsed: Readonly<Record<ModelBakeoffProvider, boolean>>;
  readonly providerRequestsMade: number;
  readonly estimatedCostUsd: number;
  readonly attempts: readonly ModelBakeoffAttemptRecord[];
  readonly cases: readonly ModelBakeoffCaseOutcome[];
  readonly transportDisposed: boolean;
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
};

const sha256Canonical = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

const exactCounts = {
  intended: 28,
  eligible: 28,
  excluded: 0,
  sent: 0,
  plannedDispatches: 28,
  maximumDispatches: 30,
} as const;

const preconditionValid = (input: {
  readonly approval: ModelBakeoffApproval;
  readonly preflight: ModelBakeoffPreflight;
  readonly plan: readonly ModelBakeoffCase[];
  readonly now: number;
}): boolean => {
  try {
    validateModelBakeoffApproval(input.approval);
  } catch {
    return false;
  }
  const approvedAt = Date.parse(input.approval.approvedAt);
  const age = input.now - approvedAt;
  return verifyModelBakeoffPreflight(input.preflight).status === 'PASS'
    && input.preflight.status === 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL'
    && input.plan.length === BAKEOFF_PLANNED_DISPATCHES
    && input.plan.every((entry, index) => entry.plannedOrdinal === index + 1)
    && sha256Canonical(input.plan) === input.preflight.planSha256
    && input.approval.planSha256 === input.preflight.planSha256
    && input.approval.preflightSha256 === input.preflight.preflightSha256
    && input.approval.runId === input.preflight.runId
    && input.approval.fixtureManifestSha256 === input.preflight.fixtureManifestSha256
    && input.approval.promptManifestSha256 === input.preflight.promptManifestSha256
    && input.approval.schemaManifestSha256 === input.preflight.schemaManifestSha256
    && input.approval.pricingManifestSha256 === input.preflight.pricingManifestSha256
    && input.approval.tokenCapsSha256 === input.preflight.roleCapsSha256
    && input.approval.keychainReferencesSha256 === input.preflight.keychainReferencesSha256
    && canonicalJson(input.approval.counts) === canonicalJson(exactCounts)
    && canonicalJson(input.preflight.counts) === canonicalJson(exactCounts)
    && input.preflight.worstCaseEstimatedUsd !== null
    && input.approval.worstCaseEstimatedUsd === input.preflight.worstCaseEstimatedUsd
    && input.approval.maxUsd >= input.preflight.worstCaseEstimatedUsd
    && Number.isFinite(approvedAt)
    && age >= 0
    && age <= MODEL_BAKEOFF_APPROVAL_MAX_AGE_MS;
};

const expectedProviderFacts = (provider: ModelBakeoffProvider): ModelBakeoffProviderFacts =>
  provider === 'deepseek'
    ? {
      adapterPackage: '@deepseek-ai/dsh-llm-deepseek',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: null,
      catalogVersion: null,
    }
    : {
      adapterPackage: '@deepseek-ai/dsh-llm-pi-ai',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: '@earendil-works/pi-ai',
      catalogVersion: '0.84.2',
    };

const expectedTool = (entry: ModelBakeoffCase): Pick<
  ModelBakeoffToolResult,
  'name' | 'contract'
> => entry.phase === 'ConductorCommit'
  ? {
    name: 'pact_submit_conductor_commit',
    contract: 'conductor-draft-commit/0.1',
  }
  : { name: 'pact_submit_council_shard', contract: 'council-shard/0.1' };

const finiteNonnegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

const transportEvidenceValid = (
  entry: ModelBakeoffCase,
  result: ModelBakeoffTransportResult,
): boolean => {
  try {
    const requiresImage = entry.role === 'Witness' || entry.role === 'Rewriter';
    const imageGrounded = result.groundedInputRefs.includes('synthetic-spatial-image-01');
    return [
    'accepted',
    'refusal',
    'transport_failure',
    'schema_failure',
    'content_failure',
    'grounding_failure',
    'late',
    'cancelled',
    'provider_error',
  ].includes(result.kind)
    && (result.detailCode === null || DETAIL_CODE.test(result.detailCode))
    && canonicalJson(result.providerFacts) === canonicalJson(expectedProviderFacts(entry.provider))
    && canonicalJson({ name: result.toolResult.name, contract: result.toolResult.contract })
      === canonicalJson(expectedTool(entry))
    && SHA256.test(result.toolResult.payloadSha256)
    && SHA256.test(result.redactedOutputSha256)
    && UUID.test(result.sessionEventRange.sessionId)
    && Number.isInteger(result.sessionEventRange.fromSequence)
    && result.sessionEventRange.fromSequence >= 0
    && Number.isInteger(result.sessionEventRange.toSequence)
    && result.sessionEventRange.toSequence >= result.sessionEventRange.fromSequence
    && (result.firstChunkDelayMs === null || finiteNonnegative(result.firstChunkDelayMs))
    && (result.firstPublicTraceDelayMs === null
      || finiteNonnegative(result.firstPublicTraceDelayMs))
    && Number.isInteger(result.usage.inputTokens)
    && result.usage.inputTokens >= 0
    && Number.isInteger(result.usage.outputTokens)
    && result.usage.outputTokens >= 0
    && result.usage.totalTokens === result.usage.inputTokens + result.usage.outputTokens
    && finiteNonnegative(result.usage.estimatedCostUsd)
    && result.groundedInputRefs.length > 0
    && new Set(result.groundedInputRefs).size === result.groundedInputRefs.length
    && (requiresImage ? imageGrounded : !imageGrounded)
      && (result.kind !== 'accepted'
        || (result.toolResult.accepted && result.sideEffectAccepted));
  } catch {
    return false;
  }
};

const finishKind = (
  kind: ModelBakeoffTransportResultKind,
): ModelBakeoffAttemptRecord['finish']['kind'] => kind === 'refusal' ? 'refused' : kind;

const errorKind = (
  kind: ModelBakeoffTransportResultKind,
): NonNullable<ModelBakeoffAttemptRecord['error']>['kind'] => {
  if (kind === 'transport_failure') return 'transport';
  if (kind === 'schema_failure') return 'schema';
  if (kind === 'content_failure') return 'content';
  if (kind === 'grounding_failure') return 'grounding';
  if (kind === 'late' || kind === 'cancelled') return 'timeout';
  return 'provider';
};

const createAttempt = (input: {
  readonly request: ModelBakeoffDispatchRequest;
  readonly result: ModelBakeoffTransportResult;
  readonly approval: ModelBakeoffApproval;
  readonly preflight: ModelBakeoffPreflight;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly retryEligible: boolean;
  readonly integrityFailure?: boolean;
}): ModelBakeoffAttemptRecord => {
  const code = input.result.detailCode ?? input.result.kind.toUpperCase();
  const unsigned = {
    schemaVersion: 'cp03-model-bakeoff-attempt/0.1' as const,
    runId: input.approval.runId,
    approvalId: input.approval.approvalId,
    caseId: input.request.case.caseId,
    attemptId: input.request.attemptId,
    plannedOrdinal: input.request.case.plannedOrdinal,
    attemptOrdinal: input.request.attemptOrdinal,
    sentOrdinal: input.request.sentOrdinal,
    provider: input.request.case.provider,
    route: input.request.case.route,
    model: input.request.case.model,
    providerFacts: { ...input.result.providerFacts },
    phase: input.request.case.phase,
    role: input.request.case.role,
    repetition: input.request.case.repetition,
    planSha256: input.preflight.planSha256,
    fixtureManifestSha256: input.preflight.fixtureManifestSha256,
    promptManifestSha256: input.preflight.promptManifestSha256,
    schemaManifestSha256: input.preflight.schemaManifestSha256,
    pricingManifestSha256: input.preflight.pricingManifestSha256,
    tokenCapsSha256: input.preflight.roleCapsSha256,
    startedAt: new Date(input.startedAtMs).toISOString(),
    firstChunkAt: input.result.firstChunkDelayMs === null
      ? null
      : new Date(input.startedAtMs + input.result.firstChunkDelayMs).toISOString(),
    firstPublicTraceAt: input.result.firstPublicTraceDelayMs === null
      ? null
      : new Date(input.startedAtMs + input.result.firstPublicTraceDelayMs).toISOString(),
    endedAt: new Date(input.endedAtMs).toISOString(),
    latency: {
      completeMs: Math.max(0, input.endedAtMs - input.startedAtMs),
      publicTraceMs: input.result.firstPublicTraceDelayMs,
    },
    usage: { ...input.result.usage, costKind: 'ESTIMATE_NOT_BILLING' as const },
    finish: {
      kind: finishKind(input.result.kind),
      detailCode: input.result.detailCode,
    },
    refusal: input.result.kind === 'refusal'
      ? { code, messageSha256: sha256Canonical({ code }) }
      : null,
    error: input.result.kind === 'accepted' || input.result.kind === 'refusal'
      ? null
      : {
        kind: input.integrityFailure ? 'integrity' as const : errorKind(input.result.kind),
        code,
      },
    preSideEffect: input.result.preSideEffect,
    sideEffectAccepted: input.result.sideEffectAccepted,
    retryOf: input.request.retryOf,
    retryEligible: input.retryEligible,
    toolResult: { ...input.result.toolResult },
    groundedInputRefs: [...input.result.groundedInputRefs],
    redactedOutputSha256: input.result.redactedOutputSha256,
    sessionEventRange: { ...input.result.sessionEventRange },
  };
  return deepFreeze({
    ...unsigned,
    durableReceiptSha256: sha256Canonical(unsigned),
  });
};

const exceptionResult = (
  request: ModelBakeoffDispatchRequest,
): ModelBakeoffTransportResult => ({
  kind: 'provider_error',
  detailCode: 'TRANSPORT_REJECTED_WITHOUT_EVIDENCE',
  preSideEffect: false,
  sideEffectAccepted: false,
  providerRequestMade: false,
  firstChunkDelayMs: null,
  firstPublicTraceDelayMs: null,
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  providerFacts: expectedProviderFacts(request.case.provider),
  toolResult: {
    ...expectedTool(request.case),
    accepted: false,
    payloadSha256: sha256Canonical(null),
  },
  groundedInputRefs: request.case.role === 'Witness' || request.case.role === 'Rewriter'
    ? ['synthetic-spatial-image-01', 'synthetic-scene-01']
    : ['synthetic-scene-01'],
  redactedOutputSha256: sha256Canonical({ code: 'TRANSPORT_REJECTED_WITHOUT_EVIDENCE' }),
  sessionEventRange: {
    sessionId: `00000000-0000-4000-8000-${String(request.sentOrdinal).padStart(12, '0')}`,
    fromSequence: 0,
    toSequence: 0,
  },
});

const integrityFailureResult = (
  request: ModelBakeoffDispatchRequest,
): ModelBakeoffTransportResult => ({
  ...exceptionResult(request),
  detailCode: 'TRANSPORT_EVIDENCE_INTEGRITY_FAILURE',
  redactedOutputSha256: sha256Canonical({
    code: 'TRANSPORT_EVIDENCE_INTEGRITY_FAILURE',
  }),
});

const dependencyKey = (entry: ModelBakeoffCase): string =>
  `${entry.model}\u0000${entry.repetition}`;

export async function runModelBakeoff(input: {
  readonly approval: ModelBakeoffApproval;
  readonly preflight: ModelBakeoffPreflight;
  readonly plan: readonly ModelBakeoffCase[];
  readonly transport: ModelBakeoffTransport;
  readonly now?: () => number;
}): Promise<ModelBakeoffRunResult> {
  const now = input.now ?? Date.now;
  const attempts: ModelBakeoffAttemptRecord[] = [];
  const outcomes: ModelBakeoffCaseOutcome[] = [];
  const retryUsed: Record<ModelBakeoffProvider, boolean> = {
    deepseek: false,
    gemini: false,
  };
  const intentAccepted = new Map<string, boolean>();
  let sent = 0;
  let providerRequestsMade = 0;
  let estimatedCostUsd = 0;
  let stopCode: string | null = null;
  let transportDisposed = false;

  const markRemainingSkipped = (code: string): void => {
    const completed = new Set(outcomes.map(({ caseId }) => caseId));
    for (const entry of input.plan) {
      if (!completed.has(entry.caseId)) {
        outcomes.push(deepFreeze({
          caseId: entry.caseId,
          plannedOrdinal: entry.plannedOrdinal,
          status: 'SKIPPED' as const,
          code,
          finalAttemptId: null,
        }));
      }
    }
  };

  try {
    if (!preconditionValid({
      approval: input.approval,
      preflight: input.preflight,
      plan: input.plan,
      now: now(),
    })) {
      stopCode = 'AUTHORIZATION_INTEGRITY_FAILURE';
      markRemainingSkipped(stopCode);
    } else {
      for (const entry of input.plan) {
        if (stopCode !== null) break;
        if (
          entry.phase === 'ConductorCommit'
          && intentAccepted.get(dependencyKey(entry)) !== true
        ) {
          outcomes.push(deepFreeze({
            caseId: entry.caseId,
            plannedOrdinal: entry.plannedOrdinal,
            status: 'SKIPPED' as const,
            code: 'CONDUCTOR_INTENT_DEPENDENCY_FAILED',
            finalAttemptId: null,
          }));
          continue;
        }

        let attemptOrdinal: 1 | 2 = 1;
        let retryOf: string | null = null;
        let finalAttemptId: string | null = null;
        let caseAccepted = false;
        let caseCode = 'UNSET';
        while (true) {
          if (sent >= BAKEOFF_MAXIMUM_DISPATCHES) {
            stopCode = 'DISPATCH_BUDGET_EXCEEDED';
            break;
          }
          sent += 1;
          const attemptId = `attempt_${String(sent).padStart(6, '0')}_${String(attemptOrdinal).padStart(2, '0')}`;
          const request = deepFreeze<ModelBakeoffDispatchRequest>({
            runId: input.approval.runId,
            approvalId: input.approval.approvalId,
            case: entry,
            attemptId,
            attemptOrdinal,
            sentOrdinal: sent,
            retryOf,
          });
          const startedAtMs = now();
          let result: ModelBakeoffTransportResult;
          let rejectedWithoutEvidence = false;
          try {
            result = await input.transport.dispatch(request);
          } catch {
            result = exceptionResult(request);
            rejectedWithoutEvidence = true;
          }
          const endedAtMs = now();
          if (result?.providerRequestMade === true) providerRequestsMade += 1;
          const integrityValid = transportEvidenceValid(entry, result);
          const recordedResult = integrityValid ? result : integrityFailureResult(request);
          const prospectiveCost = estimatedCostUsd + recordedResult.usage.estimatedCostUsd;
          const retryEligible = !rejectedWithoutEvidence
            && integrityValid
            && prospectiveCost <= input.approval.maxUsd
            && recordedResult.kind === 'transport_failure'
            && recordedResult.preSideEffect === true
            && recordedResult.sideEffectAccepted === false
            && !retryUsed[entry.provider]
            && sent < BAKEOFF_MAXIMUM_DISPATCHES;
          const attempt = createAttempt({
            request,
            result: recordedResult,
            approval: input.approval,
            preflight: input.preflight,
            startedAtMs,
            endedAtMs,
            retryEligible,
            integrityFailure: !integrityValid || rejectedWithoutEvidence,
          });
          attempts.push(attempt);
          finalAttemptId = attempt.attemptId;
          estimatedCostUsd = prospectiveCost;
          caseCode = recordedResult.detailCode ?? recordedResult.kind.toUpperCase();

          if (rejectedWithoutEvidence) {
            stopCode = 'TRANSPORT_REJECTED_WITHOUT_EVIDENCE';
            break;
          }
          if (!integrityValid) {
            stopCode = 'TRANSPORT_EVIDENCE_INTEGRITY_FAILURE';
            break;
          }
          if (estimatedCostUsd > input.approval.maxUsd) {
            stopCode = 'COST_CAP_EXCEEDED';
            break;
          }
          if (recordedResult.kind === 'accepted') {
            caseAccepted = true;
            caseCode = 'ACCEPTED';
            break;
          }
          if (retryEligible) {
            retryUsed[entry.provider] = true;
            retryOf = attempt.attemptId;
            attemptOrdinal = 2;
            continue;
          }
          break;
        }

        outcomes.push(deepFreeze({
          caseId: entry.caseId,
          plannedOrdinal: entry.plannedOrdinal,
          status: caseAccepted ? 'ACCEPTED' as const : 'FAILED' as const,
          code: stopCode ?? caseCode,
          finalAttemptId,
        }));
        if (entry.phase === 'ConductorIntent') {
          intentAccepted.set(dependencyKey(entry), caseAccepted);
        }
      }
      if (stopCode !== null) markRemainingSkipped(stopCode);
    }
  } finally {
    try {
      await input.transport.dispose();
      transportDisposed = true;
    } catch {
      stopCode ??= 'TRANSPORT_DISPOSE_FAILURE';
      markRemainingSkipped(stopCode);
    }
  }

  const accepted = outcomes.filter(({ status }) => status === 'ACCEPTED').length;
  const failed = outcomes.filter(({ status }) => status === 'FAILED').length;
  const skipped = outcomes.filter(({ status }) => status === 'SKIPPED').length;
  const status: ModelBakeoffRunResult['status'] =
    stopCode === 'AUTHORIZATION_INTEGRITY_FAILURE'
      ? 'REFUSED'
      : stopCode !== null || failed > 0 || skipped > 0
        ? 'PARTIAL'
        : 'COMPLETED';
  return deepFreeze({
    status,
    stopCode,
    counts: {
      planned: BAKEOFF_PLANNED_DISPATCHES,
      sent,
      accepted,
      failed,
      skipped,
      maximum: BAKEOFF_MAXIMUM_DISPATCHES,
    },
    retryUsed: { ...retryUsed },
    providerRequestsMade,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(12)),
    attempts: [...attempts],
    cases: [...outcomes].sort((left, right) => left.plannedOrdinal - right.plannedOrdinal),
    transportDisposed,
  });
}
