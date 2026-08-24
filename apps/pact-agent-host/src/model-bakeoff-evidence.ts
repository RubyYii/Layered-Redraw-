import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import * as cp03Contracts from '@layered-redraw/pact-cp03-contracts';

import type { ModelBakeoffDshDiagnostic } from './model-bakeoff-dsh-transport.js';
import {
  verifyModelBakeoffExecutionPolicy,
  type ModelBakeoffExecutionPolicy,
} from './model-bakeoff-execution-policy.js';
import type { ModelBakeoffFixtureManifest } from './model-bakeoff-fixtures.js';
import {
  authorizeModelBakeoff,
  MODEL_BAKEOFF_APPROVAL_MAX_AGE_MS,
  type ModelBakeoffApproval,
} from './model-bakeoff-gate.js';
import type {
  ModelBakeoffCase,
  ModelBakeoffPhase,
  ModelBakeoffProvider,
} from './model-bakeoff-plan.js';
import {
  verifyModelBakeoffPreflight,
  verifyModelBakeoffKeychainReferenceManifest,
  type ModelBakeoffKeychainReferenceManifest,
  type ModelBakeoffPreflight,
  type ModelBakeoffReplacementPreflight,
} from './model-bakeoff-preflight.js';
import {
  verifyModelBakeoffPricingManifest,
  verifyModelBakeoffRoleCapsManifest,
  type ModelBakeoffPricingManifest,
  type ModelBakeoffRoleCapsManifest,
} from './model-bakeoff-pricing.js';
import type {
  ModelBakeoffAttemptRecord,
  ModelBakeoffRunResult,
} from './model-bakeoff-runner.js';

const validateModelBakeoffAttempt = (
  cp03Contracts as unknown as {
    readonly validateModelBakeoffAttempt: (value: unknown) => unknown;
  }
).validateModelBakeoffAttempt;
const validateModelBakeoffApproval = (
  cp03Contracts as unknown as {
    readonly validateModelBakeoffApproval: (value: unknown) => unknown;
  }
).validateModelBakeoffApproval;

const sha256 = (value: string): string => createHash('sha256')
  .update(value, 'utf8')
  .digest('hex');
const canonicalSha256 = (value: unknown): string => sha256(canonicalJson(value));

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export type ModelBakeoffEvidenceCheck = 'PASS' | 'FAIL';
export type ModelBakeoffRoleDecision =
  | 'ConductorContinuity'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';

interface ModelBakeoffTechnicalArchiveCommon {
  readonly approval: ModelBakeoffApproval;
  readonly preflight: ModelBakeoffPreflight;
  readonly plan: readonly ModelBakeoffCase[];
  readonly fixtures: ModelBakeoffFixtureManifest;
  readonly pricing: ModelBakeoffPricingManifest;
  readonly roleCaps: ModelBakeoffRoleCapsManifest;
  readonly keychainReferences: ModelBakeoffKeychainReferenceManifest;
  readonly result: ModelBakeoffRunResult;
  readonly diagnostics: readonly ModelBakeoffDshDiagnostic[];
}

export interface ModelBakeoffLegacyTechnicalArchive
  extends ModelBakeoffTechnicalArchiveCommon {
  readonly schemaVersion: 'cp03-model-bakeoff-technical-archive/0.1';
  readonly executionPolicy?: never;
}

export interface ModelBakeoffReplacementTechnicalArchive
  extends ModelBakeoffTechnicalArchiveCommon {
  readonly schemaVersion: 'cp03-model-bakeoff-technical-archive/0.2';
  readonly preflight: ModelBakeoffReplacementPreflight;
  readonly executionPolicy: ModelBakeoffExecutionPolicy;
}

export type ModelBakeoffTechnicalArchive =
  | ModelBakeoffLegacyTechnicalArchive
  | ModelBakeoffReplacementTechnicalArchive;

export interface ModelBakeoffPairRepetitionEvidence {
  readonly repetition: 1 | 2;
  readonly caseIds: readonly string[];
  readonly outputText: string;
  readonly outputSha256: string;
}

export interface ModelBakeoffPairEvidence {
  readonly roleDecision: ModelBakeoffRoleDecision;
  readonly provider: ModelBakeoffProvider;
  readonly route: 'deepseek-official' | 'google';
  readonly model: ModelBakeoffCase['model'];
  readonly technicallyEligible: boolean;
  readonly reasonCodes: readonly string[];
  readonly repetitions: readonly ModelBakeoffPairRepetitionEvidence[];
}

export interface ModelBakeoffEvidenceReport {
  readonly schemaVersion:
    | 'cp03-model-bakeoff-evidence/0.1'
    | 'cp03-model-bakeoff-evidence/0.2';
  readonly runId: string;
  readonly status: 'PASS' | 'FAIL';
  readonly checks: {
    readonly archive: ModelBakeoffEvidenceCheck;
    readonly approval: ModelBakeoffEvidenceCheck;
    readonly plan: ModelBakeoffEvidenceCheck;
    readonly dispatchBudget: ModelBakeoffEvidenceCheck;
    readonly contracts: ModelBakeoffEvidenceCheck;
    readonly grounding: ModelBakeoffEvidenceCheck;
    readonly timing: ModelBakeoffEvidenceCheck;
    readonly usageAndCost: ModelBakeoffEvidenceCheck;
    readonly dshTrace: ModelBakeoffEvidenceCheck;
    readonly secretScan: ModelBakeoffEvidenceCheck;
    readonly policy?: ModelBakeoffEvidenceCheck;
  };
  readonly findings: readonly string[];
  readonly pairs: readonly ModelBakeoffPairEvidence[];
  readonly fullCouncilTimingProven: false;
  readonly claimCeiling: string;
  readonly technicalEvidenceSha256: string;
}

const ROLE_DECISIONS = [
  'ConductorContinuity',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
] as const;

const PHASES_BY_DECISION: Readonly<Record<
  ModelBakeoffRoleDecision,
  readonly ModelBakeoffPhase[]
>> = {
  ConductorContinuity: ['ConductorIntent', 'ConductorCommit'],
  Witness: ['Witness'],
  Archivist: ['Archivist'],
  Rewriter: ['Rewriter'],
  Guardian: ['Guardian'],
};

const PROVIDER_BY_DECISION: Readonly<Record<
  ModelBakeoffRoleDecision,
  ModelBakeoffProvider
>> = {
  ConductorContinuity: 'deepseek',
  Witness: 'gemini',
  Archivist: 'deepseek',
  Rewriter: 'gemini',
  Guardian: 'deepseek',
};

const check = (findings: readonly string[], prefix: string): ModelBakeoffEvidenceCheck =>
  findings.some((finding) => finding.startsWith(`${prefix}:`)) ? 'FAIL' : 'PASS';

const add = (findings: string[], prefix: string, code: string): void => {
  findings.push(`${prefix}:${code}`);
};

const archiveBoundAuthorizationValid = (
  archive: ModelBakeoffTechnicalArchive,
  now: number,
): boolean => {
  try {
    validateModelBakeoffApproval(archive.approval);
  } catch {
    return false;
  }
  const approvedAt = Date.parse(archive.approval.approvedAt);
  const age = now - approvedAt;
  const expectedCandidates = archive.preflight.candidateFacts.map((candidate) => ({
    provider: candidate.provider,
    route: candidate.route,
    model: candidate.model,
  }));
  const sortCandidates = (candidates: readonly {
    readonly provider: string;
    readonly route: string;
    readonly model: string;
  }[]): readonly unknown[] => [...candidates].sort((left, right) =>
    `${left.provider}\u0000${left.route}\u0000${left.model}`
      .localeCompare(`${right.provider}\u0000${right.route}\u0000${right.model}`)
  );
  const {
    fixtureManifestSha256,
    ...unsignedFixtureManifest
  } = archive.fixtures;
  return archive.preflight.status === 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL'
    && verifyModelBakeoffPreflight(archive.preflight).status === 'PASS'
    && canonicalSha256(unsignedFixtureManifest) === fixtureManifestSha256
    && fixtureManifestSha256 === archive.preflight.fixtureManifestSha256
    && archive.fixtures.promptManifestSha256 === archive.preflight.promptManifestSha256
    && archive.fixtures.schemaManifestSha256 === archive.preflight.schemaManifestSha256
    && Number.isFinite(approvedAt)
    && age >= 0
    && age <= MODEL_BAKEOFF_APPROVAL_MAX_AGE_MS
    && archive.approval.runId === archive.preflight.runId
    && archive.approval.planSha256 === archive.preflight.planSha256
    && archive.approval.preflightSha256 === archive.preflight.preflightSha256
    && archive.approval.fixtureManifestSha256 === archive.preflight.fixtureManifestSha256
    && archive.approval.promptManifestSha256 === archive.preflight.promptManifestSha256
    && archive.approval.schemaManifestSha256 === archive.preflight.schemaManifestSha256
    && archive.approval.pricingManifestSha256 === archive.preflight.pricingManifestSha256
    && archive.approval.tokenCapsSha256 === archive.preflight.roleCapsSha256
    && archive.approval.keychainReferencesSha256 ===
      archive.preflight.keychainReferencesSha256
    && archive.approval.worstCaseEstimatedUsd ===
      archive.preflight.worstCaseEstimatedUsd
    && archive.preflight.worstCaseEstimatedUsd !== null
    && archive.approval.maxUsd >= archive.preflight.worstCaseEstimatedUsd
    && canonicalJson(sortCandidates(archive.approval.candidates)) ===
      canonicalJson(sortCandidates(expectedCandidates))
    && canonicalJson(archive.approval.counts) === canonicalJson(archive.preflight.counts)
    && canonicalSha256(archive.plan) === archive.preflight.planSha256
    && archive.approval.repetitions === 2
    && archive.approval.retrySlots.deepseek === 1
    && archive.approval.retrySlots.gemini === 1
    && archive.approval.oneRunOnly === true
    && archive.approval.automaticRerun === false
    && archive.approval.externalCapabilities.length === 0;
};

const replacementPolicyValid = (
  archive: ModelBakeoffTechnicalArchive,
): boolean => archive.schemaVersion === 'cp03-model-bakeoff-technical-archive/0.2'
  && archive.preflight.schemaVersion === 'cp03-model-bakeoff-preflight/0.2'
  && 'executionPolicy' in archive
  && archive.executionPolicy !== undefined
  && verifyModelBakeoffExecutionPolicy(archive.executionPolicy).status === 'PASS'
  && archive.executionPolicy.executionPolicySha256 ===
    archive.preflight.executionPolicySha256
  && archive.executionPolicy.pairEligibilityPolicy ===
    'pair-local-two-repetition/0.1'
  && Object.entries(archive.executionPolicy.roleCaps).every(
    ([phase, maxOutputTokens]) =>
      archive.roleCaps.caps[phase as keyof typeof archive.roleCaps.caps]
        ?.maxOutputTokens === maxOutputTokens,
  );

const expectedToolName = (phase: ModelBakeoffPhase): string =>
  phase === 'ConductorCommit'
    ? 'pact_submit_conductor_commit'
    : 'pact_submit_council_shard';

const expectedToolContract = (phase: ModelBakeoffPhase): string =>
  phase === 'ConductorCommit'
    ? 'conductor-draft-commit/0.1'
    : 'council-shard/0.1';

const exactAttemptBinding = (
  attempt: ModelBakeoffAttemptRecord,
  entry: ModelBakeoffCase,
  archive: ModelBakeoffTechnicalArchive,
): boolean => {
  const candidate = archive.preflight.candidateFacts.find((fact) =>
    fact.provider === entry.provider
    && fact.route === entry.route
    && fact.model === entry.model
  );
  return candidate !== undefined
    && attempt.runId === archive.approval.runId
    && attempt.approvalId === archive.approval.approvalId
    && attempt.caseId === entry.caseId
    && attempt.plannedOrdinal === entry.plannedOrdinal
    && attempt.provider === entry.provider
    && attempt.route === entry.route
    && attempt.model === entry.model
    && attempt.phase === entry.phase
    && attempt.role === entry.role
    && attempt.repetition === entry.repetition
    && canonicalJson(attempt.providerFacts) === canonicalJson({
      adapterPackage: candidate.adapterPackage,
      adapterVersion: candidate.adapterVersion,
      catalogPackage: candidate.catalogPackage,
      catalogVersion: candidate.catalogVersion,
    })
    && attempt.planSha256 === archive.preflight.planSha256
    && attempt.fixtureManifestSha256 === archive.preflight.fixtureManifestSha256
    && attempt.promptManifestSha256 === archive.preflight.promptManifestSha256
    && attempt.schemaManifestSha256 === archive.preflight.schemaManifestSha256
    && attempt.pricingManifestSha256 === archive.preflight.pricingManifestSha256
    && attempt.tokenCapsSha256 === archive.preflight.roleCapsSha256;
};

const exactDiagnosticBinding = (
  diagnostic: ModelBakeoffDshDiagnostic,
  attempt: ModelBakeoffAttemptRecord,
  entry: ModelBakeoffCase,
): boolean => diagnostic.attemptId === attempt.attemptId
  && diagnostic.sentOrdinal === attempt.sentOrdinal
  && diagnostic.caseId === entry.caseId
  && diagnostic.provider === entry.provider
  && diagnostic.route === entry.route
  && diagnostic.model === entry.model
  && diagnostic.phase === entry.phase
  && diagnostic.role === entry.role
  && diagnostic.continuityKey === entry.continuityKey
  && canonicalJson(diagnostic.sessionEventRange) === canonicalJson(attempt.sessionEventRange);

const validAttemptContract = (
  attempt: ModelBakeoffAttemptRecord,
  entry: ModelBakeoffCase,
): boolean => {
  try {
    validateModelBakeoffAttempt(attempt);
    return attempt.finish.kind === 'accepted'
      && attempt.finish.detailCode === null
      && attempt.refusal === null
      && attempt.error === null
      && attempt.preSideEffect === false
      && attempt.sideEffectAccepted === true
      && attempt.toolResult.accepted === true
      && attempt.toolResult.name === expectedToolName(entry.phase)
      && attempt.toolResult.contract === expectedToolContract(entry.phase);
  } catch {
    return false;
  }
};

const validAttemptSchema = (attempt: ModelBakeoffAttemptRecord): boolean => {
  try {
    validateModelBakeoffAttempt(attempt);
    return true;
  } catch {
    return false;
  }
};

const validDurableReceipt = (attempt: ModelBakeoffAttemptRecord): boolean => {
  const { durableReceiptSha256, ...unsigned } = attempt;
  return canonicalSha256(unsigned) === durableReceiptSha256;
};

const validGrounding = (
  attempt: ModelBakeoffAttemptRecord,
  entry: ModelBakeoffCase,
): boolean => {
  const imageRole = entry.role === 'Witness' || entry.role === 'Rewriter';
  const hasImage = attempt.groundedInputRefs.includes('synthetic-spatial-image-01');
  return attempt.groundedInputRefs.includes('synthetic-scene-01')
    && new Set(attempt.groundedInputRefs).size === attempt.groundedInputRefs.length
    && (imageRole ? hasImage : !hasImage);
};

const validTiming = (
  attempt: ModelBakeoffAttemptRecord,
  diagnostic: ModelBakeoffDshDiagnostic,
): boolean => Number.isFinite(attempt.latency.completeMs)
  && attempt.latency.completeMs >= 0
  && attempt.latency.completeMs <= 12_000
  && attempt.startedAt.length > 0
  && attempt.endedAt.length > 0
  && attempt.firstChunkAt !== null
  && diagnostic.turnEndReason === 'aborted';

const validAttemptChronology = (attempt: ModelBakeoffAttemptRecord): boolean => {
  const startedAt = Date.parse(attempt.startedAt);
  const endedAt = Date.parse(attempt.endedAt);
  const firstChunkAt = attempt.firstChunkAt === null ? null : Date.parse(attempt.firstChunkAt);
  const firstPublicTraceAt = attempt.firstPublicTraceAt === null
    ? null
    : Date.parse(attempt.firstPublicTraceAt);
  return Number.isFinite(startedAt)
    && Number.isFinite(endedAt)
    && endedAt >= startedAt
    && endedAt - startedAt === attempt.latency.completeMs
    && attempt.latency.completeMs <= 12_000
    && (firstChunkAt === null || (
      Number.isFinite(firstChunkAt)
      && firstChunkAt >= startedAt
      && firstChunkAt <= endedAt
    ))
    && (firstPublicTraceAt === null || (
      Number.isFinite(firstPublicTraceAt)
      && firstPublicTraceAt >= startedAt
      && firstPublicTraceAt <= endedAt
      && firstPublicTraceAt - startedAt === attempt.latency.publicTraceMs
    ));
};

const validUsage = (
  attempt: ModelBakeoffAttemptRecord,
  archive: ModelBakeoffTechnicalArchive,
): boolean => {
  const cap = archive.roleCaps.caps[attempt.phase];
  return cap !== undefined
    && Number.isInteger(attempt.usage.inputTokens)
    && Number.isInteger(attempt.usage.outputTokens)
    && attempt.usage.inputTokens >= 0
    && attempt.usage.outputTokens >= 0
    && attempt.usage.inputTokens <= cap.maxInputTokens
    && attempt.usage.outputTokens <= cap.maxOutputTokens
    && attempt.usage.totalTokens === attempt.usage.inputTokens + attempt.usage.outputTokens
    && Number.isFinite(attempt.usage.estimatedCostUsd)
    && attempt.usage.estimatedCostUsd >= 0
    && attempt.usage.costKind === 'ESTIMATE_NOT_BILLING';
};

const validDshTrace = (
  attempt: ModelBakeoffAttemptRecord,
  diagnostic: ModelBakeoffDshDiagnostic,
  entry: ModelBakeoffCase,
): boolean => diagnostic.sessionId === attempt.sessionEventRange.sessionId
  && canonicalJson(diagnostic.sessionEventRange) === canonicalJson(attempt.sessionEventRange)
  && diagnostic.sessionEventRange.fromSequence >= 0
  && diagnostic.sessionEventRange.toSequence >= diagnostic.sessionEventRange.fromSequence
  && diagnostic.streamCount === 1
  && diagnostic.undeclaredStreamCount === 0
  && diagnostic.toolCallCount === 1
  && diagnostic.acceptedDomainEventCount === 1
  && diagnostic.availableTools.includes(expectedToolName(entry.phase))
  && !diagnostic.availableTools.some((name) =>
    /search|ground|provider|file|shell|code|exec/i.test(name)
  )
  && diagnostic.imageBlockCount === (
    entry.role === 'Witness' || entry.role === 'Rewriter' ? 1 : 0
  );

const validReplacementDiagnostic = (
  attempt: ModelBakeoffAttemptRecord,
  diagnostic: ModelBakeoffDshDiagnostic,
): boolean => {
  const primaryKind = attempt.finish.kind === 'refused'
    ? 'refusal'
    : attempt.finish.kind;
  return diagnostic.diagnosticSchemaVersion ===
      'cp03-model-bakeoff-dsh-diagnostic/0.2'
    && diagnostic.primaryOutcome?.kind === primaryKind
    && diagnostic.primaryOutcome.detailCode === attempt.finish.detailCode
    && Array.isArray(diagnostic.secondaryConditions)
    && (attempt.finish.kind !== 'accepted'
      || (
        diagnostic.secondaryConditions.length === 0
        && diagnostic.terminalFinish?.kind === 'tool-calls'
        && diagnostic.terminalFinish.failureCode === null
      ));
};

const validDiagnosticEnvelope = (
  attempt: ModelBakeoffAttemptRecord,
  diagnostic: ModelBakeoffDshDiagnostic,
  entry: ModelBakeoffCase,
  replacementPolicy: boolean,
): boolean => exactDiagnosticBinding(diagnostic, attempt, entry)
  && Number.isInteger(diagnostic.streamCount)
  && diagnostic.streamCount >= 0
  && diagnostic.streamCount <= 1
  && diagnostic.undeclaredStreamCount === 0
  && Number.isInteger(diagnostic.toolCallCount)
  && diagnostic.toolCallCount >= 0
  && diagnostic.toolCallCount <= 1
  && Number.isInteger(diagnostic.acceptedDomainEventCount)
  && diagnostic.acceptedDomainEventCount >= 0
  && diagnostic.acceptedDomainEventCount <= 1
  && diagnostic.availableTools.every((name) =>
    name === expectedToolName(entry.phase)
    && !/search|ground|provider|file|shell|code|exec/i.test(name)
  )
  && diagnostic.imageBlockCount === (
    entry.role === 'Witness' || entry.role === 'Rewriter' ? 1 : 0
  )
  && (attempt.finish.kind === 'accepted'
    ? diagnostic.redactedOutputText !== null
    : diagnostic.redactedOutputText === null)
  && (!replacementPolicy || validReplacementDiagnostic(attempt, diagnostic));

const validFinishEvidence = (attempt: ModelBakeoffAttemptRecord): boolean => {
  if (attempt.finish.kind === 'accepted') {
    return attempt.finish.detailCode === null
      && attempt.refusal === null
      && attempt.error === null
      && attempt.preSideEffect === false
      && attempt.sideEffectAccepted === true
      && attempt.retryEligible === false
      && attempt.toolResult.accepted === true;
  }
  if (attempt.finish.kind === 'refused') {
    return attempt.refusal !== null
      && attempt.error === null
      && attempt.retryEligible === false
      && attempt.sideEffectAccepted === false
      && attempt.toolResult.accepted === false;
  }
  return attempt.refusal === null
    && attempt.error !== null
    && attempt.sideEffectAccepted === false
    && attempt.toolResult.accepted === false;
};

const outputBound = (
  attempt: ModelBakeoffAttemptRecord,
  diagnostic: ModelBakeoffDshDiagnostic,
): boolean => diagnostic.redactedOutputText !== null
  && diagnostic.redactedOutputText.length > 0
  && sha256(diagnostic.redactedOutputText) === attempt.redactedOutputSha256;

const forbiddenSecretField = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(forbiddenSecretField);
  const forbidden = new Set([
    'apiKey',
    'api_key',
    'authorizationHeader',
    'credentialValue',
    'secretValue',
    'bearerToken',
    'rawCredential',
  ]);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    forbidden.has(key) || forbiddenSecretField(child)
  );
};

const finalAttemptByCase = (
  archive: ModelBakeoffTechnicalArchive,
): ReadonlyMap<string, ModelBakeoffAttemptRecord> => {
  const byId = new Map(archive.result.attempts.map((attempt) => [attempt.attemptId, attempt]));
  return new Map(archive.result.cases.flatMap((outcome) => {
    const attempt = outcome.finalAttemptId === null ? undefined : byId.get(outcome.finalAttemptId);
    return attempt === undefined ? [] : [[outcome.caseId, attempt] as const];
  }));
};

const buildPairs = (input: {
  readonly archive: ModelBakeoffTechnicalArchive;
  readonly baseEligible: boolean;
  readonly caseEligible: ReadonlyMap<string, boolean>;
}): readonly ModelBakeoffPairEvidence[] => {
  const attempts = finalAttemptByCase(input.archive);
  const diagnostics = new Map(input.archive.diagnostics.map((entry) => [entry.attemptId, entry]));
  const pairs: ModelBakeoffPairEvidence[] = [];
  for (const roleDecision of ROLE_DECISIONS) {
    const provider = PROVIDER_BY_DECISION[roleDecision];
    const phases = PHASES_BY_DECISION[roleDecision];
    const models = [...new Set(input.archive.plan
      .filter((entry) => entry.provider === provider && phases.includes(entry.phase))
      .map(({ model }) => model))];
    for (const model of models) {
      const reasonCodes: string[] = [];
      const repetitions: ModelBakeoffPairRepetitionEvidence[] = [];
      for (const repetition of [1, 2] as const) {
        const cases = input.archive.plan.filter((entry) =>
          entry.model === model
          && entry.repetition === repetition
          && phases.includes(entry.phase)
        );
        const expectedCount = roleDecision === 'ConductorContinuity' ? 2 : 1;
        if (cases.length !== expectedCount) {
          reasonCodes.push(`REPETITION_${repetition}_CASE_SET_INVALID`);
          continue;
        }
        const eligible = input.baseEligible
          && cases.every(({ caseId }) => input.caseEligible.get(caseId) === true);
        if (!eligible) {
          reasonCodes.push(`REPETITION_${repetition}_TECHNICAL_INELIGIBLE`);
          continue;
        }
        if (roleDecision === 'ConductorContinuity') {
          const sessionIds = cases.map(({ caseId }) => {
            const attempt = attempts.get(caseId);
            return attempt === undefined ? null : diagnostics.get(attempt.attemptId)?.sessionId ?? null;
          });
          if (sessionIds[0] === null || sessionIds[0] !== sessionIds[1]) {
            reasonCodes.push(`REPETITION_${repetition}_CONTINUITY_MISMATCH`);
            continue;
          }
        }
        const texts = cases.map(({ caseId, phase }) => {
          const attempt = attempts.get(caseId)!;
          const text = diagnostics.get(attempt.attemptId)!.redactedOutputText!;
          return roleDecision === 'ConductorContinuity' ? `${phase}: ${text}` : text;
        });
        const outputText = texts.join('\n');
        repetitions.push(deepFreeze({
          repetition,
          caseIds: cases.map(({ caseId }) => caseId),
          outputText,
          outputSha256: sha256(outputText),
        }));
      }
      pairs.push(deepFreeze({
        roleDecision,
        provider,
        route: provider === 'deepseek' ? 'deepseek-official' : 'google',
        model,
        technicallyEligible: repetitions.length === 2 && reasonCodes.length === 0,
        reasonCodes: [...new Set(reasonCodes)],
        repetitions,
      }));
    }
  }
  return deepFreeze(pairs);
};

export function verifyModelBakeoffEvidence(input: {
  readonly archive: ModelBakeoffTechnicalArchive;
  readonly secretValues?: readonly string[];
}): ModelBakeoffEvidenceReport {
  const archive = input.archive;
  const legacyPolicy =
    archive.schemaVersion === 'cp03-model-bakeoff-technical-archive/0.1';
  const replacementPolicy =
    archive.schemaVersion === 'cp03-model-bakeoff-technical-archive/0.2';
  const versionBindingInvalid = !legacyPolicy && !replacementPolicy
    || (replacementPolicy
      ? archive.preflight.schemaVersion !== 'cp03-model-bakeoff-preflight/0.2'
        || !('executionPolicy' in archive)
      : archive.preflight.schemaVersion !== 'cp03-model-bakeoff-preflight/0.1'
        || 'executionPolicy' in archive);
  const findings: string[] = [];
  if (
    versionBindingInvalid
    || archive.result.cases.length !== 28
    || archive.result.attempts.length !== archive.result.counts.sent
    || archive.diagnostics.length !== archive.result.counts.sent
    || archive.result.transportDisposed !== true
  ) add(findings, 'archive', 'STRUCTURE_INVALID');

  const firstStartedAt = Date.parse(archive.result.attempts[0]?.startedAt ?? '');
  const authorization = authorizeModelBakeoff({
    approval: archive.approval,
    preflight: archive.preflight,
    ...(!replacementPolicy ? {} : { executionPolicy: archive.executionPolicy }),
    plan: archive.plan,
    fixtures: archive.fixtures,
    pricing: archive.pricing,
    roleCaps: archive.roleCaps,
    keychainReferences: archive.keychainReferences,
    archiveState: { resultExists: false, pendingResultExists: false },
    now: firstStartedAt,
  });
  if (
    authorization.status !== 'AUTHORIZED'
    && !archiveBoundAuthorizationValid(archive, firstStartedAt)
  ) add(findings, 'approval', 'BINDING_INVALID');
  if (
    verifyModelBakeoffPricingManifest(archive.pricing, firstStartedAt).status !== 'PASS'
    || verifyModelBakeoffRoleCapsManifest(archive.roleCaps).status !== 'PASS'
    || verifyModelBakeoffKeychainReferenceManifest(archive.keychainReferences).status !== 'PASS'
  ) add(findings, 'approval', 'BOUND_MANIFEST_INVALID');

  if (replacementPolicy && !replacementPolicyValid(archive)) {
    add(findings, 'policy', 'EXECUTION_POLICY_INVALID');
  }

  if (
    archive.plan.length !== 28
    || canonicalSha256(archive.plan) !== archive.preflight.planSha256
    || !archive.plan.every((entry, index) => entry.plannedOrdinal === index + 1)
    || new Set(archive.plan.map(({ caseId }) => caseId)).size !== 28
  ) add(findings, 'plan', 'EXACT_MATRIX_INVALID');

  const sentOrdinals = archive.result.attempts.map(({ sentOrdinal }) => sentOrdinal);
  if (
    archive.result.status !== 'COMPLETED'
    || archive.result.counts.planned !== 28
    || archive.result.counts.maximum !== 30
    || archive.result.counts.sent < 28
    || archive.result.counts.sent > 30
    || archive.result.counts.accepted !== 28
    || archive.result.counts.failed !== 0
    || archive.result.counts.skipped !== 0
    || archive.result.providerRequestsMade < 28
    || archive.result.providerRequestsMade > archive.result.counts.sent
    || new Set(sentOrdinals).size !== sentOrdinals.length
    || ![...sentOrdinals].sort((left, right) => left - right)
      .every((ordinal, index) => ordinal === index + 1)
  ) add(findings, 'dispatchBudget', 'RUN_NOT_EXACTLY_COMPLETED');

  const planByCase = new Map(archive.plan.map((entry) => [entry.caseId, entry]));
  const outcomeByCase = new Map(archive.result.cases.map((entry) => [entry.caseId, entry]));
  const diagnosticsByAttempt = new Map<string, ModelBakeoffDshDiagnostic>();
  for (const diagnostic of archive.diagnostics) {
    if (diagnosticsByAttempt.has(diagnostic.attemptId)) {
      add(findings, 'dshTrace', 'DIAGNOSTIC_ATTEMPT_DUPLICATED');
    }
    diagnosticsByAttempt.set(diagnostic.attemptId, diagnostic);
  }
  const caseEligible = new Map(archive.plan.map(({ caseId }) => [caseId, true]));
  const attemptIds = new Set<string>();
  for (const [index, attempt] of archive.result.attempts.entries()) {
    const entry = planByCase.get(attempt.caseId);
    const diagnostic = diagnosticsByAttempt.get(attempt.attemptId);
    const attemptContractValid = entry !== undefined
      && !attemptIds.has(attempt.attemptId)
      && attempt.sentOrdinal === index + 1
      && attempt.attemptId === `attempt_${String(index + 1).padStart(6, '0')}_${String(attempt.attemptOrdinal).padStart(2, '0')}`
      && validAttemptSchema(attempt)
      && validDurableReceipt(attempt)
      && exactAttemptBinding(attempt, entry, archive)
      && validFinishEvidence(attempt);
    attemptIds.add(attempt.attemptId);
    if (!attemptContractValid) {
      add(findings, 'contracts', `ATTEMPT_INVALID:${attempt.attemptId}`);
      caseEligible.set(attempt.caseId, false);
    }
    if (entry === undefined || !validGrounding(attempt, entry)) {
      add(findings, 'grounding', `ATTEMPT_INVALID:${attempt.attemptId}`);
      caseEligible.set(attempt.caseId, false);
    }
    if (!validAttemptChronology(attempt)) {
      add(findings, 'timing', `ATTEMPT_INVALID:${attempt.attemptId}`);
      caseEligible.set(attempt.caseId, false);
    }
    if (!validUsage(attempt, archive)) {
      add(findings, 'usageAndCost', `ATTEMPT_INVALID:${attempt.attemptId}`);
      caseEligible.set(attempt.caseId, false);
    }
    if (
      entry === undefined
      || diagnostic === undefined
      || !validDiagnosticEnvelope(attempt, diagnostic, entry, replacementPolicy)
    ) {
      add(findings, 'dshTrace', `ATTEMPT_INVALID:${attempt.attemptId}`);
      caseEligible.set(attempt.caseId, false);
    }
  }

  const attemptsByCase = new Map<string, ModelBakeoffAttemptRecord[]>();
  for (const attempt of archive.result.attempts) {
    const attempts = attemptsByCase.get(attempt.caseId) ?? [];
    attempts.push(attempt);
    attemptsByCase.set(attempt.caseId, attempts);
  }
  const retryProviders = new Set<ModelBakeoffProvider>();
  for (const entry of archive.plan) {
    const attempts = attemptsByCase.get(entry.caseId) ?? [];
    const first = attempts[0];
    const second = attempts[1];
    const oneAttemptValid = attempts.length === 1
      && first?.attemptOrdinal === 1
      && first.retryOf === null
      && first.retryEligible === false
      && first.finish.kind === 'accepted';
    const twoAttemptsValid = attempts.length === 2
      && first?.attemptOrdinal === 1
      && first.retryOf === null
      && first.retryEligible === true
      && first.finish.kind === 'transport_failure'
      && first.preSideEffect === true
      && first.sideEffectAccepted === false
      && second?.attemptOrdinal === 2
      && second.retryOf === first.attemptId
      && second.retryEligible === false
      && second.sentOrdinal === first.sentOrdinal + 1
      && second.finish.kind === 'accepted';
    if (twoAttemptsValid) {
      if (retryProviders.has(entry.provider)) {
        add(findings, 'contracts', `RETRY_SLOT_REUSED:${entry.provider}`);
        caseEligible.set(entry.caseId, false);
      }
      retryProviders.add(entry.provider);
    }
    if (!oneAttemptValid && !twoAttemptsValid) {
      add(findings, 'contracts', `RETRY_CHAIN_INVALID:${entry.caseId}`);
      caseEligible.set(entry.caseId, false);
    }
  }
  if (
    archive.result.retryUsed.deepseek !== retryProviders.has('deepseek')
    || archive.result.retryUsed.gemini !== retryProviders.has('gemini')
    || archive.result.counts.sent !== 28 + retryProviders.size
  ) add(findings, 'dispatchBudget', 'RETRY_ACCOUNTING_INVALID');

  const finalAttempts = finalAttemptByCase(archive);
  for (const entry of archive.plan) {
    const outcome = outcomeByCase.get(entry.caseId);
    const attempt = finalAttempts.get(entry.caseId);
    const diagnostic = attempt === undefined
      ? undefined
      : diagnosticsByAttempt.get(attempt.attemptId);
    let eligible = caseEligible.get(entry.caseId) === true;
    if (
      outcome?.status !== 'ACCEPTED'
      || attempt === undefined
      || !exactAttemptBinding(attempt, entry, archive)
      || !validAttemptContract(attempt, entry)
      || diagnostic === undefined
      || !exactDiagnosticBinding(diagnostic, attempt, entry)
      || !outputBound(attempt, diagnostic)
    ) {
      add(findings, 'contracts', `CASE_INVALID:${entry.caseId}`);
      eligible = false;
    }
    if (attempt === undefined || !validGrounding(attempt, entry)) {
      add(findings, 'grounding', `CASE_INVALID:${entry.caseId}`);
      eligible = false;
    }
    if (attempt === undefined || diagnostic === undefined || !validTiming(attempt, diagnostic)) {
      add(findings, 'timing', `CASE_INVALID:${entry.caseId}`);
      eligible = false;
    }
    if (attempt === undefined || !validUsage(attempt, archive)) {
      add(findings, 'usageAndCost', `CASE_INVALID:${entry.caseId}`);
      eligible = false;
    }
    if (
      attempt === undefined
      || diagnostic === undefined
      || !validDshTrace(attempt, diagnostic, entry)
    ) {
      add(findings, 'dshTrace', `CASE_INVALID:${entry.caseId}`);
      eligible = false;
    }
    caseEligible.set(entry.caseId, eligible);
  }

  const estimatedTotal = archive.result.attempts.reduce(
    (total, attempt) => total + attempt.usage.estimatedCostUsd,
    0,
  );
  if (
    Math.abs(estimatedTotal - archive.result.estimatedCostUsd) > 1e-9
    || estimatedTotal > archive.approval.maxUsd
  ) add(findings, 'usageAndCost', 'TOTAL_INVALID');

  for (const model of [...new Set(archive.plan
    .filter(({ role }) => role === 'CaseConductor')
    .map(({ model }) => model))]) {
    for (const repetition of [1, 2] as const) {
      const entries = archive.plan.filter((entry) =>
        entry.model === model
        && entry.repetition === repetition
        && entry.role === 'CaseConductor'
      );
      const sessions = entries.map(({ caseId }) => {
        const attempt = finalAttempts.get(caseId);
        return attempt === undefined ? null : diagnosticsByAttempt.get(attempt.attemptId)?.sessionId ?? null;
      });
      if (sessions.length !== 2 || sessions[0] === null || sessions[0] !== sessions[1]) {
        add(findings, 'dshTrace', `CONDUCTOR_CONTINUITY_INVALID:${model}:r${repetition}`);
        for (const entry of entries) caseEligible.set(entry.caseId, false);
      }
    }
  }

  const serialized = canonicalJson(archive);
  if (
    forbiddenSecretField(archive)
    || (input.secretValues ?? []).some((secret) =>
      secret.length > 0 && serialized.includes(secret)
    )
  ) add(findings, 'secretScan', 'FORBIDDEN_CONTENT');

  const legacyChecks = {
    archive: check(findings, 'archive'),
    approval: check(findings, 'approval'),
    plan: check(findings, 'plan'),
    dispatchBudget: check(findings, 'dispatchBudget'),
    contracts: check(findings, 'contracts'),
    grounding: check(findings, 'grounding'),
    timing: check(findings, 'timing'),
    usageAndCost: check(findings, 'usageAndCost'),
    dshTrace: check(findings, 'dshTrace'),
    secretScan: check(findings, 'secretScan'),
  } as const;
  const policyCheck = check(findings, 'policy');
  const checks = deepFreeze(replacementPolicy
    ? { ...legacyChecks, policy: policyCheck }
    : legacyChecks);
  const pairBaseEligible = replacementPolicy
    ? [
      checks.archive,
      checks.approval,
      checks.plan,
      policyCheck,
      checks.secretScan,
    ].every((value) => value === 'PASS')
    : [
      checks.archive,
      checks.approval,
      checks.plan,
      checks.dispatchBudget,
      checks.secretScan,
    ].every((value) => value === 'PASS');
  const pairs = buildPairs({
    archive,
    baseEligible: pairBaseEligible,
    caseEligible,
  });
  const unsigned = {
    schemaVersion: replacementPolicy
      ? 'cp03-model-bakeoff-evidence/0.2' as const
      : 'cp03-model-bakeoff-evidence/0.1' as const,
    runId: archive.preflight.runId,
    status: Object.values(checks).every((value) => value === 'PASS')
      ? 'PASS' as const
      : 'FAIL' as const,
    checks,
    findings: [...new Set(findings)].sort(),
    pairs,
    fullCouncilTimingProven: false as const,
    claimCeiling: replacementPolicy
      ? 'pair-local fixed-input evidence; exact run status remains global; two repetitions; not a reliability benchmark; not a Ruby interaction'
      : 'fixed-input bounded model-selection evidence; two repetitions; not a reliability benchmark; not a Ruby interaction',
  };
  return deepFreeze({
    ...unsigned,
    technicalEvidenceSha256: canonicalSha256(unsigned),
  });
}
