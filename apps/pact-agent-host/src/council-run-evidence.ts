import { createHash } from 'node:crypto';

import {
  canonicalJson,
  validateAgentActionDraft,
  validateProviderCallEnvelope,
} from '@layered-redraw/pact-cp03-contracts';

import type {
  CouncilRole,
  ProviderRoutingManifest,
} from './contract-types.js';
import {
  COUNCIL_TIMING_LIMITS,
} from './council-turn.js';
import type {
  CouncilAttemptRecord,
  CouncilRuntimeResult,
} from './council-runtime.js';
import {
  requireCouncilRoutingManifest,
} from './council-routing.js';

export interface CouncilRunArchive {
  readonly schemaVersion: 'cp03-council-run/0.1';
  readonly runId: string;
  readonly snapshotHash: string;
  readonly routingManifest: ProviderRoutingManifest;
  readonly result: CouncilRuntimeResult;
}

export type CouncilEvidenceCheck =
  | 'archive'
  | 'completion'
  | 'dispatchLedger'
  | 'roleCoverage'
  | 'selection'
  | 'providerKind'
  | 'contracts'
  | 'timing'
  | 'orchestration'
  | 'draftAuthority'
  | 'usageEstimate'
  | 'secretScan';

export interface CouncilRunEvidenceFinding {
  readonly code: string;
  readonly path: string;
}

export interface CouncilRunEvidenceReport {
  readonly schemaVersion: 'cp03-council-evidence-report/0.1';
  readonly status: 'PASS' | 'FAIL';
  readonly runId: string;
  readonly counts: {
    readonly plannedDispatches: 6;
    readonly maximumDispatches: 8;
    readonly sentDispatches: number;
    readonly attemptRecords: number;
    readonly durableRequiredShards: number;
  };
  readonly usageEstimate: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostUsd: number | null;
    readonly billingConfirmed: false;
  };
  readonly checks: Readonly<Record<CouncilEvidenceCheck, 'PASS' | 'FAIL'>>;
  readonly findings: readonly CouncilRunEvidenceFinding[];
}

export type CouncilRunEvidenceErrorCode =
  | 'COUNCIL_RUN_SECRET_LEAK_BLOCKED'
  | 'COUNCIL_RUN_EVIDENCE_INVALID';

export class CouncilRunEvidenceError extends Error {
  override readonly name = 'CouncilRunEvidenceError';

  constructor(
    readonly code: CouncilRunEvidenceErrorCode,
    readonly report: CouncilRunEvidenceReport,
  ) {
    super(code);
  }
}

const REQUIRED_COUNCIL_ROLES: readonly CouncilRole[] = [
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
];

const INITIAL_COUNCIL_SLOTS = [
  { role: 'CaseConductor', phase: 'SHARD', declaredDispatchOrdinal: 1 },
  { role: 'Witness', phase: 'SHARD', declaredDispatchOrdinal: 2 },
  { role: 'Archivist', phase: 'SHARD', declaredDispatchOrdinal: 3 },
  { role: 'Rewriter', phase: 'SHARD', declaredDispatchOrdinal: 4 },
  { role: 'Guardian', phase: 'SHARD', declaredDispatchOrdinal: 5 },
  { role: 'CaseConductor', phase: 'CONDUCTOR_COMMIT', declaredDispatchOrdinal: 6 },
] as const;

const councilSlotKey = (role: string, phase: string): string => `${role}:${phase}`;

const INITIAL_COUNCIL_SLOT_BY_KEY = new Map(
  INITIAL_COUNCIL_SLOTS.map((slot) => [
    councilSlotKey(slot.role, slot.phase),
    slot,
  ]),
);

const forbiddenSecretFields = new Set([
  'apikey',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'privatekey',
  'secret',
  'clientsecret',
  'apisecret',
  'authtoken',
  'bearertoken',
  'password',
  'passwd',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizedField = (value: string): string =>
  value.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

const scanSecretFields = (
  value: unknown,
  path: string,
  add: (code: string, path: string) => void,
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecretFields(
      item,
      `${path}[${index}]`,
      add,
    ));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path.length === 0 ? key : `${path}.${key}`;
    if (forbiddenSecretFields.has(normalizedField(key))) {
      add('SECRET_FIELD_PRESENT', childPath);
    }
    scanSecretFields(child, childPath, add);
  }
};

const scanSecretValues = (
  value: unknown,
  path: string,
  secretValues: readonly string[],
  add: (code: string, path: string) => void,
): void => {
  if (typeof value === 'string') {
    if (secretValues.some((secret) => value.includes(secret))) {
      add('SECRET_VALUE_PRESENT', path.length === 0 ? '$' : path);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecretValues(
      item,
      `${path}[${index}]`,
      secretValues,
      add,
    ));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path.length === 0 ? key : `${path}.${key}`;
    scanSecretValues(child, childPath, secretValues, add);
  }
};

const hasAcceptedToolSideEffect = (record: CouncilAttemptRecord): boolean =>
  record.contract.toolCalls.some((toolCall) => toolCall.status === 'accepted');

const isCompletedTransportError = (record: CouncilAttemptRecord): boolean =>
  record.contract.endedAt !== null &&
  record.contract.finish.kind === 'error' &&
  record.contract.finish.detailCode === 'TRANSPORT';

export const verifyCouncilRunEvidence = (
  serialized: string,
  secretValues: readonly string[] = [],
): CouncilRunEvidenceReport => {
  const checks: Record<CouncilEvidenceCheck, 'PASS' | 'FAIL'> = {
    archive: 'PASS',
    completion: 'PASS',
    dispatchLedger: 'PASS',
    roleCoverage: 'PASS',
    selection: 'PASS',
    providerKind: 'PASS',
    contracts: 'PASS',
    timing: 'PASS',
    orchestration: 'PASS',
    draftAuthority: 'PASS',
    usageEstimate: 'PASS',
    secretScan: 'PASS',
  };
  const findings: CouncilRunEvidenceFinding[] = [];
  const findingKeys = new Set<string>();
  const add = (check: CouncilEvidenceCheck, code: string, path: string): void => {
    checks[check] = 'FAIL';
    const key = `${code}\u0000${path}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({ code, path });
  };

  const materialSecrets = secretValues.filter((value) =>
    typeof value === 'string' && value.length > 0
  );
  if (materialSecrets.some((value) => serialized.includes(value))) {
    add('secretScan', 'SECRET_VALUE_PRESENT', '$serialized');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    add('archive', 'ARCHIVE_JSON_INVALID', '$');
    for (const check of [
      'completion',
      'dispatchLedger',
      'roleCoverage',
      'selection',
      'providerKind',
      'contracts',
      'timing',
      'orchestration',
      'draftAuthority',
      'usageEstimate',
    ] as const) {
      add(check, 'ARCHIVE_UNAVAILABLE', '$');
    }
    return {
      schemaVersion: 'cp03-council-evidence-report/0.1',
      status: 'FAIL',
      runId: 'UNRESOLVED',
      counts: {
        plannedDispatches: 6,
        maximumDispatches: 8,
        sentDispatches: 0,
        attemptRecords: 0,
        durableRequiredShards: 0,
      },
      usageEstimate: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: null,
        billingConfirmed: false,
      },
      checks,
      findings,
    };
  }

  scanSecretFields(parsed, '', (code, path) => {
    add('secretScan', code, path);
  });
  scanSecretValues(parsed, '', materialSecrets, (code, path) => {
    add('secretScan', code, path);
  });

  if (!isRecord(parsed)) {
    add('archive', 'ARCHIVE_OBJECT_REQUIRED', '$');
  }
  const root = isRecord(parsed) ? parsed : {};
  if (root.schemaVersion !== 'cp03-council-run/0.1') {
    add('archive', 'ARCHIVE_SCHEMA_VERSION_INVALID', 'schemaVersion');
  }
  const runId = typeof root.runId === 'string' && root.runId.trim().length > 0
    ? root.runId
    : 'UNRESOLVED';
  const reportedRunId = materialSecrets.some((secret) => runId.includes(secret))
    ? 'REDACTED'
    : runId;
  if (runId === 'UNRESOLVED') {
    add('archive', 'RUN_ID_MISSING', 'runId');
  }
  if (typeof root.snapshotHash !== 'string' || !/^[0-9a-f]{64}$/.test(root.snapshotHash)) {
    add('archive', 'SNAPSHOT_HASH_INVALID', 'snapshotHash');
  }
  if (!isRecord(root.routingManifest)) {
    add('archive', 'ROUTING_MANIFEST_MISSING', 'routingManifest');
  }
  if (!isRecord(root.result)) {
    add('archive', 'RESULT_RECORD_MISSING', 'result');
  }

  let manifest: ProviderRoutingManifest | undefined;
  if (isRecord(root.routingManifest)) {
    try {
      manifest = requireCouncilRoutingManifest(root.routingManifest);
    } catch {
      add('selection', 'ROUTING_MANIFEST_INVALID', 'routingManifest');
    }
  }

  const resultRecord = isRecord(root.result) ? root.result : {};
  const resultStatus = resultRecord.status;

  if (resultStatus !== 'COMPLETED') {
    add('completion', 'RUN_STATUS_NON_TERMINAL', 'result.status');
  }

  const sentDispatches = typeof resultRecord.providerRequestsMade === 'number'
    ? resultRecord.providerRequestsMade
    : 0;
  const records = Array.isArray(resultRecord.attemptRecords)
    ? resultRecord.attemptRecords
    : [];

  if (
    !Number.isInteger(sentDispatches) ||
    sentDispatches < 6 ||
    sentDispatches > 8
  ) {
    add('dispatchLedger', 'SENT_DISPATCH_COUNT_OUT_OF_BOUNDS', 'result.sentDispatches');
  }
  if (!Array.isArray(resultRecord.attemptRecords)) {
    add('dispatchLedger', 'ATTEMPT_RECORDS_MISSING', 'result.attemptRecords');
  }
  if (records.length !== sentDispatches) {
    add('dispatchLedger', 'ATTEMPT_COUNT_MISMATCH', 'result.attemptRecords');
  }

  const typedEntries: Array<{ record: CouncilAttemptRecord; index: number }> = [];
  const seenCallIds = new Set<string>();
  const recordsByCallId = new Map<string, { record: CouncilAttemptRecord; index: number }>();

  records.forEach((value, index) => {
    const path = `result.attemptRecords[${index}]`;
    if (isRecord(value) && isRecord(value.contract)) {
      if (value.contract.providerKind !== 'real' && value.contract.providerKind !== 'scripted') {
        add('providerKind', 'PROVIDER_KIND_INVALID', `${path}.contract.providerKind`);
      }
    }
    if (!isRecord(value) || !isRecord(value.contract) || !isRecord(value.council)) {
      add('contracts', 'ATTEMPT_RECORD_INVALID', path);
      return;
    }
    if (
      typeof value.runId !== 'string' ||
      typeof value.probeId !== 'string' ||
      (value.provider !== 'deepseek' && value.provider !== 'gemini') ||
      typeof value.purpose !== 'string' ||
      !['structured-tool', 'terminal-after-tool-result', 'hard-timeout-cancel', 'cancel-after-first-chunk'].includes(String(value.expectedOutcome)) ||
      !Number.isInteger(value.sentOrdinal) ||
      typeof value.council.role !== 'string' ||
      (value.council.phase !== 'SHARD' && value.council.phase !== 'CONDUCTOR_COMMIT') ||
      typeof value.council.snapshotHash !== 'string' ||
      typeof value.council.promptHash !== 'string' ||
      !Number.isInteger(value.council.declaredDispatchOrdinal)
    ) {
      add('contracts', 'ATTEMPT_RECORD_INVALID', path);
      return;
    }
    try {
      validateProviderCallEnvelope(value.contract);
    } catch {
      add('contracts', 'PROVIDER_ENVELOPE_INVALID', `${path}.contract`);
      return;
    }
    const typedRecord = value as unknown as CouncilAttemptRecord;
    typedEntries.push({ record: typedRecord, index });

    const callId = typedRecord.contract.callId;
    if (seenCallIds.has(callId)) {
      add('dispatchLedger', 'DUPLICATE_CALL_ID', `${path}.contract.callId`);
    } else {
      recordsByCallId.set(callId, { record: typedRecord, index });
    }
    seenCallIds.add(callId);
  });

  const typedRecords = typedEntries.map(({ record }) => record);
  const ordinals = records.map((record) => isRecord(record) ? record.sentOrdinal : undefined);
  if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
    add('dispatchLedger', 'SENT_ORDINAL_SEQUENCE_INVALID', 'result.attemptRecords');
  }

  const providerKinds = new Set(typedRecords.map((r) => r.contract.providerKind));
  if (providerKinds.size > 1) {
    add('providerKind', 'PROVIDER_KIND_MISMATCH', 'result.attemptRecords');
  }

  const initialEntriesBySlot = new Map<string, Array<{ record: CouncilAttemptRecord; index: number }>>();
  const retryEntries: Array<{ record: CouncilAttemptRecord; index: number }> = [];

  for (const entry of typedEntries) {
    const { record, index } = entry;
    const path = `result.attemptRecords[${index}]`;
    const slotKey = councilSlotKey(record.council.role, record.council.phase);
    const slot = INITIAL_COUNCIL_SLOT_BY_KEY.get(slotKey);
    if (slot === undefined) {
      add('dispatchLedger', 'UNSUPPORTED_ROLE_PHASE_PAIR', `${path}.council.phase`);
    }

    if (!Number.isInteger(record.attempt) || record.attempt < 1 || record.attempt > 2) {
      add('dispatchLedger', 'ATTEMPT_NUMBER_INVALID', `${path}.attempt`);
      continue;
    }
    if (record.attempt === 1) {
      if (record.contract.retryOf !== null) {
        add('dispatchLedger', 'RETRY_OF_ON_INITIAL_ATTEMPT', `${path}.contract.retryOf`);
      }
      if (slot !== undefined) {
        const initialEntries = initialEntriesBySlot.get(slotKey) ?? [];
        initialEntries.push(entry);
        initialEntriesBySlot.set(slotKey, initialEntries);
        if (record.council.declaredDispatchOrdinal !== slot.declaredDispatchOrdinal) {
          add('dispatchLedger', 'DISPATCH_ORDINAL_MISMATCH', `${path}.council.declaredDispatchOrdinal`);
        }
        if (record.council.phase === 'SHARD' && record.sentOrdinal !== slot.declaredDispatchOrdinal) {
          add('dispatchLedger', 'DISPATCH_ORDINAL_MISMATCH', `${path}.sentOrdinal`);
        }
      }
    } else {
      retryEntries.push(entry);
    }
  }

  if (resultStatus === 'COMPLETED') {
    for (const slot of INITIAL_COUNCIL_SLOTS) {
      const key = councilSlotKey(slot.role, slot.phase);
      const initialEntries = initialEntriesBySlot.get(key) ?? [];
      const slotPath = `result.attemptRecords.${slot.role}.${slot.phase}`;
      if (initialEntries.length === 0) {
        add('dispatchLedger', 'INITIAL_SLOT_MISSING', slotPath);
      } else if (initialEntries.length > 1) {
        add('dispatchLedger', 'INITIAL_SLOT_DUPLICATE', slotPath);
      }
    }
  }

  const retryCountByProvider = new Map<string, number>();
  for (const { record, index } of retryEntries) {
    const path = `result.attemptRecords[${index}]`;
    const providerRetryCount = (retryCountByProvider.get(record.provider) ?? 0) + 1;
    retryCountByProvider.set(record.provider, providerRetryCount);
    if (providerRetryCount > 1) {
      add('dispatchLedger', 'PROVIDER_RETRY_LIMIT_EXCEEDED', path);
    }

    const retryOf = record.contract.retryOf;
    if (typeof retryOf !== 'string' || retryOf.trim().length === 0) {
      add('dispatchLedger', 'RETRY_CHAIN_BROKEN', `${path}.contract.retryOf`);
      continue;
    }
    const prior = recordsByCallId.get(retryOf);
    if (prior === undefined || prior.index >= index || prior.record.attempt !== 1) {
      add('dispatchLedger', 'RETRY_CHAIN_BROKEN', `${path}.contract.retryOf`);
      continue;
    }

    if (
      record.council.role !== prior.record.council.role ||
      record.council.phase !== prior.record.council.phase ||
      record.provider !== prior.record.provider ||
      record.council.declaredDispatchOrdinal !== prior.record.council.declaredDispatchOrdinal ||
      record.contract.providerRoute !== prior.record.contract.providerRoute ||
      record.contract.modelId !== prior.record.contract.modelId ||
      record.contract.adapterPackage !== prior.record.contract.adapterPackage ||
      record.contract.adapterVersion !== prior.record.contract.adapterVersion ||
      record.council.promptHash !== prior.record.council.promptHash
    ) {
      add('dispatchLedger', 'RETRY_BINDING_MISMATCH', path);
    }
    if (!isCompletedTransportError(prior.record)) {
      add('dispatchLedger', 'RETRY_PRIOR_NOT_TRANSPORT_ERROR', `${path}.contract.retryOf`);
    }
    if (hasAcceptedToolSideEffect(prior.record)) {
      add('dispatchLedger', 'RETRY_PRIOR_SIDE_EFFECT_ACCEPTED', `${path}.contract.retryOf`);
    }

    if (
      prior.record.council.phase === 'SHARD' &&
      isCompletedTransportError(prior.record) &&
      !hasAcceptedToolSideEffect(prior.record)
    ) {
      const eligibleFailures = typedEntries
        .filter(({ record: candidate }) =>
          candidate.attempt === 1 &&
          candidate.provider === record.provider &&
          candidate.council.phase === 'SHARD' &&
          isCompletedTransportError(candidate) &&
          !hasAcceptedToolSideEffect(candidate)
        )
        .map(({ record: candidate }) => candidate.council.declaredDispatchOrdinal);
      const lowestEligibleOrdinal = Math.min(...eligibleFailures);
      if (
        eligibleFailures.length > 1 &&
        prior.record.council.declaredDispatchOrdinal !== lowestEligibleOrdinal
      ) {
        add('dispatchLedger', 'PROVIDER_RETRY_PRIORITY_INVALID', `${path}.contract.retryOf`);
      }
    }
  }

  const coveredRoles = new Set<string>();
  let conductorCommitAttempt: CouncilAttemptRecord | undefined;
  let conductorIntentAttempt: CouncilAttemptRecord | undefined;
  let conductorIntentIndex = -1;
  let conductorCommitIndex = -1;

  typedEntries.forEach(({ record, index }) => {
    const path = `result.attemptRecords[${index}]`;
    if (record.runId !== runId) {
      add('archive', 'RUN_ID_MISMATCH', `${path}.runId`);
    }
    if (record.council.snapshotHash !== root.snapshotHash) {
      add('contracts', 'SNAPSHOT_HASH_MISMATCH', `${path}.council.snapshotHash`);
    }

    const role = record.council.role;
    const phase = record.council.phase;
    if (record.attempt === 1) {
      if (phase === 'SHARD') {
        coveredRoles.add(role);
        if (role === 'CaseConductor') {
          conductorIntentAttempt = record;
          conductorIntentIndex = index;
        }
      } else if (phase === 'CONDUCTOR_COMMIT' && role === 'CaseConductor') {
        conductorCommitAttempt = record;
        conductorCommitIndex = index;
      }

    }

    if (manifest !== undefined) {
      const assignment = manifest.assignments[role as CouncilRole];
      if (assignment !== undefined) {
        if (record.provider !== assignment.provider) {
          add('selection', 'ROUTING_SELECTION_MISMATCH', `${path}.provider`);
        }
        if (record.contract.providerRoute !== assignment.route) {
          add('selection', 'ROUTING_SELECTION_MISMATCH', `${path}.contract.providerRoute`);
        }
        if (record.contract.modelId !== assignment.model) {
          add('selection', 'ROUTING_SELECTION_MISMATCH', `${path}.contract.modelId`);
        }
        if (record.contract.adapterPackage !== assignment.adapterPackage) {
          add('selection', 'ROUTING_SELECTION_MISMATCH', `${path}.contract.adapterPackage`);
        }
        if (record.contract.adapterVersion !== assignment.adapterVersion) {
          add('selection', 'ROUTING_SELECTION_MISMATCH', `${path}.contract.adapterVersion`);
        }
        if (record.council.promptHash !== assignment.promptHash) {
          add('contracts', 'PROMPT_HASH_MISMATCH', `${path}.council.promptHash`);
        }
      }
    }

    if (record.contract.providerKind !== 'real' && record.contract.providerKind !== 'scripted') {
      add('providerKind', 'PROVIDER_KIND_INVALID', `${path}.contract.providerKind`);
    }
    if (resultStatus === 'COMPLETED') {
      if (record.contract.endedAt === null || record.contract.finish.kind === 'pending') {
        add('contracts', 'PROVIDER_ENVELOPE_UNFINISHED', `${path}.contract`);
      }
      if (record.contract.lateQuarantined) {
        add('contracts', 'LATE_RESULT_QUARANTINED', `${path}.contract`);
      }
    }
  });

  let conductorSessionId: string | undefined;
  if (resultStatus === 'COMPLETED') {
    for (const role of REQUIRED_COUNCIL_ROLES) {
      if (!coveredRoles.has(role)) {
        add('roleCoverage', 'ROLE_COVERAGE_MISSING', `result.attemptRecords.${role}`);
      }
    }
    if (conductorCommitAttempt === undefined) {
      add('roleCoverage', 'COMMIT_DISPATCH_MISSING', 'result.attemptRecords.CaseConductor.commit');
    }
    if (
      conductorIntentAttempt !== undefined &&
      conductorCommitAttempt !== undefined &&
      (
        conductorIntentAttempt.contract.providerRoute !== conductorCommitAttempt.contract.providerRoute ||
        conductorIntentAttempt.contract.modelId !== conductorCommitAttempt.contract.modelId
      )
    ) {
      add('selection', 'CONDUCTOR_MODEL_MISMATCH', `result.attemptRecords[${conductorCommitIndex}].contract.modelId`);
    }

    const shardSessionRange = conductorIntentAttempt?.contract.sessionEventRange;
    const commitSessionRange = conductorCommitAttempt?.contract.sessionEventRange;
    if (
      !isRecord(shardSessionRange) ||
      typeof shardSessionRange.sessionId !== 'string' ||
      shardSessionRange.sessionId.length === 0
    ) {
      if (conductorIntentIndex >= 0) {
        add(
          'contracts',
          'CONDUCTOR_SESSION_EVIDENCE_MISSING',
          `result.attemptRecords[${conductorIntentIndex}].contract.sessionEventRange`,
        );
      }
    } else {
      conductorSessionId = shardSessionRange.sessionId;
    }

    if (
      !isRecord(commitSessionRange) ||
      typeof commitSessionRange.sessionId !== 'string' ||
      commitSessionRange.sessionId.length === 0
    ) {
      if (conductorCommitIndex >= 0) {
        add(
          'contracts',
          'CONDUCTOR_SESSION_EVIDENCE_MISSING',
          `result.attemptRecords[${conductorCommitIndex}].contract.sessionEventRange`,
        );
      }
    } else if (conductorSessionId !== undefined && commitSessionRange.sessionId !== conductorSessionId) {
      add(
        'contracts',
        'CONDUCTOR_SESSION_MISMATCH',
        `result.attemptRecords[${conductorCommitIndex}].contract.sessionEventRange.sessionId`,
      );
    }

    const commitReceipt = resultRecord.durableConductorCommitReceipt;
    if (
      conductorSessionId !== undefined &&
      isRecord(commitReceipt) &&
      typeof commitReceipt.sessionId === 'string' &&
      commitReceipt.sessionId !== conductorSessionId
    ) {
      add('contracts', 'CONDUCTOR_SESSION_MISMATCH', 'result.durableConductorCommitReceipt.sessionId');
    }
  }

  const completedDraft = resultStatus === 'COMPLETED' && isRecord(resultRecord.draft)
    ? resultRecord.draft
    : undefined;
  const completedDraftIdentity = completedDraft !== undefined && isRecord(completedDraft.identity)
    ? completedDraft.identity
    : undefined;
  const completedTurnId = typeof completedDraftIdentity?.turnId === 'string'
    ? completedDraftIdentity.turnId
    : undefined;
  const completedCaseSessionId = typeof completedDraftIdentity?.caseSessionId === 'string'
    ? completedDraftIdentity.caseSessionId
    : undefined;

  const durableShards = Array.isArray(resultRecord.durableShardReceipts)
    ? resultRecord.durableShardReceipts
    : [];
  const seenReceiptShardIds = new Set<string>();
  const seenReceiptPayloadHashes = new Set<string>();
  const seenReceiptAcceptanceSequences = new Set<number>();
  let previousAcceptanceSequence = 0;
  let projectedReceiptCount = 0;

  durableShards.forEach((receipt, index) => {
    const path = `result.durableShardReceipts[${index}]`;
    if (!isRecord(receipt)) {
      add('contracts', 'DURABLE_SHARD_RECEIPT_INVALID', path);
      return;
    }
    if (
      receipt.accepted !== true ||
      receipt.status !== 'DURABLE' ||
      typeof receipt.shardId !== 'string' ||
      receipt.shardId.length === 0 ||
      typeof receipt.payloadHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(receipt.payloadHash) ||
      typeof receipt.sessionId !== 'string' ||
      receipt.sessionId.length === 0 ||
      typeof receipt.turnId !== 'string' ||
      receipt.turnId.length === 0 ||
      typeof receipt.lastSeq !== 'number' ||
      !Number.isInteger(receipt.lastSeq) ||
      receipt.lastSeq < 0 ||
      typeof receipt.acceptanceSequence !== 'number' ||
      !Number.isInteger(receipt.acceptanceSequence) ||
      receipt.acceptanceSequence < 1 ||
      typeof receipt.acceptedAtMonotonicMs !== 'number' ||
      !Number.isFinite(receipt.acceptedAtMonotonicMs) ||
      receipt.acceptedAtMonotonicMs < 0 ||
      typeof receipt.projectedTrace !== 'boolean' ||
      typeof receipt.shardEventSeq !== 'number' ||
      !Number.isInteger(receipt.shardEventSeq) ||
      receipt.shardEventSeq < 0 ||
      (receipt.projectedTrace
        ? (typeof receipt.traceEventSeq !== 'number' || !Number.isInteger(receipt.traceEventSeq) || receipt.traceEventSeq < 0)
        : (receipt.traceEventSeq !== null && (typeof receipt.traceEventSeq !== 'number' || !Number.isInteger(receipt.traceEventSeq) || receipt.traceEventSeq < 0)))
    ) {
      add('contracts', 'DURABLE_SHARD_RECEIPT_INVALID', path);
    }
    if (typeof receipt.shardId === 'string') {
      if (seenReceiptShardIds.has(receipt.shardId)) {
        add('contracts', 'DURABLE_SHARD_RECEIPT_DUPLICATE', `${path}.shardId`);
      }
      seenReceiptShardIds.add(receipt.shardId);
    }
    if (typeof receipt.payloadHash === 'string') {
      if (seenReceiptPayloadHashes.has(receipt.payloadHash)) {
        add('contracts', 'DURABLE_SHARD_RECEIPT_DUPLICATE', `${path}.payloadHash`);
      }
      seenReceiptPayloadHashes.add(receipt.payloadHash);
    }
    if (
      typeof receipt.acceptanceSequence === 'number' &&
      Number.isInteger(receipt.acceptanceSequence)
    ) {
      if (seenReceiptAcceptanceSequences.has(receipt.acceptanceSequence)) {
        add(
          'contracts',
          'DURABLE_SHARD_ACCEPTANCE_SEQUENCE_DUPLICATE',
          `${path}.acceptanceSequence`,
        );
      }
      seenReceiptAcceptanceSequences.add(receipt.acceptanceSequence);
      if (receipt.acceptanceSequence <= previousAcceptanceSequence) {
        add(
          'contracts',
          'DURABLE_SHARD_ACCEPTANCE_SEQUENCE_ORDER_INVALID',
          'result.durableShardReceipts',
        );
      }
      previousAcceptanceSequence = receipt.acceptanceSequence;
    }
    if (receipt.projectedTrace === true) {
      projectedReceiptCount += 1;
    }
    if (completedTurnId !== undefined && receipt.turnId !== completedTurnId) {
      add('contracts', 'TURN_ID_MISMATCH', `${path}.turnId`);
    }
  });

  const durableTurnId = durableShards.find((receipt) =>
    isRecord(receipt) && typeof receipt.turnId === 'string'
  );
  if (
    completedTurnId !== undefined &&
    isRecord(durableTurnId) &&
    durableTurnId.turnId !== completedTurnId
  ) {
    add('draftAuthority', 'TURN_ID_MISMATCH', 'result.draft.identity.turnId');
  }

  if (resultStatus === 'COMPLETED') {
    if (durableShards.length !== 5) {
      add('roleCoverage', 'DURABLE_SHARD_RECEIPT_COUNT_INVALID', 'result.durableShardReceipts');
    }
    if (projectedReceiptCount !== 1) {
      add(
        'draftAuthority',
        'PROJECTED_TRACE_RECEIPT_COUNT_INVALID',
        'result.durableShardReceipts',
      );
    }
    const commitReceipt = resultRecord.durableConductorCommitReceipt;
    if (!isRecord(commitReceipt)) {
      add('roleCoverage', 'DURABLE_COMMIT_RECEIPT_MISSING', 'result.durableConductorCommitReceipt');
    } else {
      if (
        commitReceipt.accepted !== true ||
        commitReceipt.status !== 'DURABLE' ||
        typeof commitReceipt.sessionId !== 'string' ||
        commitReceipt.sessionId.length === 0 ||
        typeof commitReceipt.turnId !== 'string' ||
        commitReceipt.turnId.length === 0 ||
        typeof commitReceipt.payloadHash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(commitReceipt.payloadHash) ||
        typeof commitReceipt.lastSeq !== 'number' ||
        !Number.isInteger(commitReceipt.lastSeq) ||
        commitReceipt.lastSeq < 0 ||
        typeof commitReceipt.commitEventSeq !== 'number' ||
        !Number.isInteger(commitReceipt.commitEventSeq) ||
        commitReceipt.commitEventSeq < 0
      ) {
        add('contracts', 'DURABLE_COMMIT_RECEIPT_INVALID', 'result.durableConductorCommitReceipt');
      }
      if (completedTurnId !== undefined && commitReceipt.turnId !== completedTurnId) {
        add('contracts', 'TURN_ID_MISMATCH', 'result.durableConductorCommitReceipt.turnId');
      }
      if (
        typeof commitReceipt.sessionId === 'string' &&
        !durableShards.some((receipt) =>
          isRecord(receipt) && receipt.sessionId === commitReceipt.sessionId
        )
      ) {
        add(
          'contracts',
          'CONDUCTOR_SESSION_MISMATCH',
          'result.durableConductorCommitReceipt.sessionId',
        );
      }
    }
  }

  if (resultStatus === 'COMPLETED') {
    if (resultRecord.selectionBarrierClosed !== true) {
      add('draftAuthority', 'SELECTION_BARRIER_NOT_CLOSED', 'result.selectionBarrierClosed');
    }

    if (resultRecord.firstPublicTrace === null || !isRecord(resultRecord.firstPublicTrace)) {
      add('draftAuthority', 'PUBLIC_TRACE_MISSING', 'result.firstPublicTrace');
    } else {
      const trace = resultRecord.firstPublicTrace;
      if (trace.role !== 'Witness' && trace.role !== 'Rewriter') {
        add('draftAuthority', 'PUBLIC_TRACE_ROLE_INVALID', 'result.firstPublicTrace.role');
      }
      if (
        typeof trace.caseSessionId !== 'string' ||
        trace.caseSessionId.length === 0 ||
        typeof trace.turnId !== 'string' ||
        trace.turnId.length === 0 ||
        typeof trace.text !== 'string' ||
        trace.text.length === 0 ||
        typeof trace.sourceContributionHash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(trace.sourceContributionHash) ||
        typeof trace.acceptanceSequence !== 'number' ||
        !Number.isInteger(trace.acceptanceSequence) ||
        trace.acceptanceSequence < 1 ||
        typeof trace.projectedAtMonotonicMs !== 'number' ||
        !Number.isFinite(trace.projectedAtMonotonicMs) ||
        trace.projectedAtMonotonicMs < 0 ||
        typeof trace.durableAtMonotonicMs !== 'number' ||
        !Number.isFinite(trace.durableAtMonotonicMs) ||
        trace.durableAtMonotonicMs < 0
      ) {
        add('draftAuthority', 'PUBLIC_TRACE_INVALID', 'result.firstPublicTrace');
      }

      if (completedTurnId !== undefined && trace.turnId !== completedTurnId) {
        add('draftAuthority', 'TURN_ID_MISMATCH', 'result.firstPublicTrace.turnId');
      }
      if (
        completedCaseSessionId !== undefined &&
        trace.caseSessionId !== completedCaseSessionId
      ) {
        add(
          'draftAuthority',
          'CASE_SESSION_ID_MISMATCH',
          'result.firstPublicTrace.caseSessionId',
        );
      }

      const matchingReceipts = durableShards.filter(
        (receipt) => isRecord(receipt) && receipt.payloadHash === trace.sourceContributionHash,
      ) as Record<string, unknown>[];

      if (matchingReceipts.length === 0) {
        add('draftAuthority', 'PUBLIC_TRACE_SHARD_HASH_UNLINKED', 'result.firstPublicTrace.sourceContributionHash');
      } else if (matchingReceipts.length > 1) {
        add('draftAuthority', 'PUBLIC_TRACE_RECEIPT_NOT_UNIQUE', 'result.firstPublicTrace.sourceContributionHash');
      } else {
        const matchingReceipt = matchingReceipts[0]!;
        if (matchingReceipt.projectedTrace !== true) {
          add('draftAuthority', 'PUBLIC_TRACE_RECEIPT_NOT_PROJECTED', 'result.firstPublicTrace.sourceContributionHash');
        }
        if (matchingReceipt.status !== 'DURABLE') {
          add('draftAuthority', 'PUBLIC_TRACE_RECEIPT_NOT_DURABLE', 'result.firstPublicTrace.sourceContributionHash');
        }
        if (matchingReceipt.traceEventSeq === null || typeof matchingReceipt.traceEventSeq !== 'number') {
          add('draftAuthority', 'PUBLIC_TRACE_INVALID', 'result.firstPublicTrace.sourceContributionHash');
        }
        if (trace.acceptanceSequence !== matchingReceipt.acceptanceSequence) {
          add(
            'draftAuthority',
            'PUBLIC_TRACE_RECEIPT_BINDING_MISMATCH',
            'result.firstPublicTrace.acceptanceSequence',
          );
        }
        if (trace.turnId !== matchingReceipt.turnId) {
          add(
            'draftAuthority',
            'PUBLIC_TRACE_RECEIPT_BINDING_MISMATCH',
            'result.firstPublicTrace.turnId',
          );
        }
        if (trace.projectedAtMonotonicMs !== matchingReceipt.acceptedAtMonotonicMs) {
          add(
            'draftAuthority',
            'PUBLIC_TRACE_RECEIPT_BINDING_MISMATCH',
            'result.firstPublicTrace.projectedAtMonotonicMs',
          );
        }
        if (
          typeof matchingReceipt.acceptedAtMonotonicMs === 'number' &&
          typeof trace.durableAtMonotonicMs === 'number' &&
          trace.durableAtMonotonicMs < matchingReceipt.acceptedAtMonotonicMs
        ) {
          add(
            'draftAuthority',
            'PUBLIC_TRACE_RECEIPT_BINDING_MISMATCH',
            'result.firstPublicTrace.durableAtMonotonicMs',
          );
        }
        const traceTiming = isRecord(resultRecord.timing) ? resultRecord.timing : undefined;
        if (
          traceTiming !== undefined &&
          traceTiming.firstPublicTraceAtMonotonicMs !== trace.durableAtMonotonicMs
        ) {
          add(
            'draftAuthority',
            'PUBLIC_TRACE_RECEIPT_BINDING_MISMATCH',
            'result.timing.firstPublicTraceAtMonotonicMs',
          );
        }
      }
    }

    if (completedDraft === undefined) {
      add('completion', 'DRAFT_MISSING_ON_COMPLETED_STATUS', 'result.draft');
    } else {
      let draftContractValid = true;
      try {
        validateAgentActionDraft(completedDraft);
      } catch {
        draftContractValid = false;
        add('draftAuthority', 'DRAFT_INVALID', 'result.draft');
      }
      const draftDecision = isRecord(completedDraft.decision) ? completedDraft.decision : {};
      if (draftDecision.status !== 'PROPOSED') {
        add('draftAuthority', 'DRAFT_DECISION_STATUS_INVALID', 'result.draft.decision.status');
      }
      if (
        draftContractValid &&
        typeof resultRecord.draftHash === 'string' &&
        /^[0-9a-f]{64}$/.test(resultRecord.draftHash)
      ) {
        try {
          const computedDraftHash = createHash('sha256')
            .update(canonicalJson(completedDraft))
            .digest('hex');
          if (resultRecord.draftHash !== computedDraftHash) {
            add('draftAuthority', 'DRAFT_HASH_MISMATCH', 'result.draftHash');
          }
        } catch {
          add('draftAuthority', 'DRAFT_INVALID', 'result.draft');
        }
      }
    }
    if (typeof resultRecord.draftHash !== 'string' || !/^[0-9a-f]{64}$/.test(resultRecord.draftHash)) {
      add('draftAuthority', 'DRAFT_HASH_INVALID', 'result.draftHash');
    }
  } else {
    if (resultRecord.draft !== null && resultRecord.draft !== undefined) {
      add('draftAuthority', 'PROMOTED_DRAFT_ON_NON_COMPLETED_STATUS', 'result.draft');
    }
    if (resultRecord.draftHash !== null && resultRecord.draftHash !== undefined) {
      add('draftAuthority', 'PROMOTED_DRAFT_HASH_ON_NON_COMPLETED_STATUS', 'result.draftHash');
    }
  }

  const timingRecord = isRecord(resultRecord.timing) ? resultRecord.timing : undefined;
  if (timingRecord === undefined) {
    add('timing', 'TIMING_RECORD_MISSING', 'result.timing');
  } else {
    const started = timingRecord.startedAtMonotonicMs;
    if (typeof started !== 'number' || !Number.isFinite(started) || started < 0) {
      add('timing', 'TIMING_RECORD_INVALID', 'result.timing.startedAtMonotonicMs');
    } else {
      const checkTarget = (
        atMs: unknown,
        targetMet: unknown,
        limitMs: number,
        inconsistentCode: string,
        atPath: string,
        metPath: string,
      ) => {
        if (typeof atMs !== 'number' || !Number.isFinite(atMs)) {
          if (resultStatus === 'COMPLETED') {
            add('timing', 'TIMING_RECORD_INVALID', atPath);
          }
        } else if (atMs < started) {
          add('timing', 'TIMING_TIMESTAMP_BACKDATED', atPath);
        } else {
          const elapsed = atMs - started;
          const expectedMet = elapsed <= limitMs;
          if (typeof targetMet !== 'boolean' || targetMet !== expectedMet) {
            add('timing', inconsistentCode, metPath);
          }
        }
      };

      checkTarget(
        timingRecord.systemStatusAtMonotonicMs,
        timingRecord.systemStatusTargetMet,
        COUNCIL_TIMING_LIMITS.systemStatusTargetMs,
        'SYSTEM_STATUS_TARGET_INCONSISTENT',
        'result.timing.systemStatusAtMonotonicMs',
        'result.timing.systemStatusTargetMet',
      );
      checkTarget(
        timingRecord.firstPublicTraceAtMonotonicMs,
        timingRecord.firstPublicTraceTargetMet,
        COUNCIL_TIMING_LIMITS.firstPublicTraceTargetMs,
        'PUBLIC_TRACE_TARGET_INCONSISTENT',
        'result.timing.firstPublicTraceAtMonotonicMs',
        'result.timing.firstPublicTraceTargetMet',
      );
      checkTarget(
        timingRecord.requiredShardsAtMonotonicMs,
        timingRecord.requiredShardsTargetMet,
        COUNCIL_TIMING_LIMITS.requiredShardsTargetMs,
        'REQUIRED_SHARDS_TARGET_INCONSISTENT',
        'result.timing.requiredShardsAtMonotonicMs',
        'result.timing.requiredShardsTargetMet',
      );
      checkTarget(
        timingRecord.conductorCommitAtMonotonicMs,
        timingRecord.conductorCommitTargetMet,
        COUNCIL_TIMING_LIMITS.conductorCommitTargetMs,
        'CONDUCTOR_COMMIT_TARGET_INCONSISTENT',
        'result.timing.conductorCommitAtMonotonicMs',
        'result.timing.conductorCommitTargetMet',
      );
      checkTarget(
        timingRecord.draftAcceptedAtMonotonicMs,
        timingRecord.draftTargetMet,
        COUNCIL_TIMING_LIMITS.draftTargetMs,
        'DRAFT_TARGET_INCONSISTENT',
        'result.timing.draftAcceptedAtMonotonicMs',
        'result.timing.draftTargetMet',
      );

      if (resultStatus === 'COMPLETED') {
        if (timingRecord.hardDeadlineMet !== true) {
          add('timing', 'HARD_DEADLINE_MISSED', 'result.timing.hardDeadlineMet');
        }
        if (
          typeof timingRecord.draftAcceptedAtMonotonicMs === 'number' &&
          timingRecord.draftAcceptedAtMonotonicMs >= started + COUNCIL_TIMING_LIMITS.hardDeadlineMs
        ) {
          add('timing', 'HARD_DEADLINE_INCONSISTENT', 'result.timing.draftAcceptedAtMonotonicMs');
        }
      }
    }
  }

  const orch = isRecord(resultRecord.orchestration) ? resultRecord.orchestration : undefined;
  if (orch === undefined) {
    add('orchestration', 'ORCHESTRATION_RECORD_MISSING', 'result.orchestration');
  } else {
    if (typeof orch.undeclaredProviderStreams !== 'number' || orch.undeclaredProviderStreams !== 0) {
      add('orchestration', 'UNDECLARED_PROVIDER_STREAMS_PRESENT', 'result.orchestration.undeclaredProviderStreams');
    }
    if (resultStatus === 'COMPLETED') {
      if (orch.activeConductorTurns !== 2) {
        add('orchestration', 'ACTIVE_CONDUCTOR_TURN_COUNT_INVALID', 'result.orchestration.activeConductorTurns');
      }
      if (orch.settlementSinkTurns !== 4) {
        add('orchestration', 'SETTLEMENT_SINK_TURN_COUNT_INVALID', 'result.orchestration.settlementSinkTurns');
      }
      if (orch.blockedSettlementSinkTurns !== 4) {
        add('orchestration', 'BLOCKED_SETTLEMENT_SINK_COUNT_INVALID', 'result.orchestration.blockedSettlementSinkTurns');
      }
      if (orch.deadlineCancellationRequested !== false) {
        add('orchestration', 'DEADLINE_CANCELLATION_REQUESTED_INVALID', 'result.orchestration.deadlineCancellationRequested');
      }
      if (orch.harnessDisposed !== true) {
        add('orchestration', 'HARNESS_NOT_DISPOSED', 'result.orchestration.harnessDisposed');
      }
      if (!Array.isArray(orch.cleanupReasonCodes) || orch.cleanupReasonCodes.length !== 0) {
        add('orchestration', 'CLEANUP_REASON_CODES_NON_EMPTY', 'result.orchestration.cleanupReasonCodes');
      }
    }
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let costSum: number | null = 0;
  let costAggregationSupported = typedEntries.length === records.length;

  typedEntries.forEach(({ record, index }) => {
    const path = `result.attemptRecords[${index}].contract.usage`;
    if (
      record.contract.endedAt === null ||
      record.contract.finish.kind === 'pending' ||
      record.contract.lateQuarantined
    ) {
      costAggregationSupported = false;
      costSum = null;
      return;
    }
    const usage = record.contract?.usage;
    if (!isRecord(usage)) {
      if (resultStatus === 'COMPLETED') {
        add('usageEstimate', 'USAGE_RECORD_MISSING', path);
      }
      costAggregationSupported = false;
      costSum = null;
      return;
    }
    const inp = usage.inputTokens;
    const out = usage.outputTokens;
    const tot = usage.totalTokens;
    const cost = usage.estimatedCostUsd;

    if (
      typeof inp !== 'number' || !Number.isInteger(inp) || inp < 0 ||
      typeof out !== 'number' || !Number.isInteger(out) || out < 0 ||
      typeof tot !== 'number' || !Number.isInteger(tot) || tot < 0
    ) {
      add('usageEstimate', 'USAGE_TOKENS_INVALID', path);
      costAggregationSupported = false;
      costSum = null;
      return;
    }
    if (tot !== inp + out) {
      add('usageEstimate', 'USAGE_TOKENS_INCONSISTENT', path);
      costAggregationSupported = false;
      costSum = null;
      return;
    }
    totalInputTokens += inp;
    totalOutputTokens += out;
    totalTokens += tot;

    if (typeof cost === 'number') {
      if (cost < 0 || !Number.isFinite(cost)) {
        add('usageEstimate', 'USAGE_COST_INVALID', `${path}.estimatedCostUsd`);
        costSum = null;
      } else if (costSum !== null) {
        costSum += cost;
      }
    } else if (cost === null) {
      costSum = null;
    } else {
      add('usageEstimate', 'USAGE_COST_INVALID', `${path}.estimatedCostUsd`);
      costSum = null;
    }
  });

  if (typedRecords.length === 0 || !costAggregationSupported) {
    costSum = null;
  }

  return {
    schemaVersion: 'cp03-council-evidence-report/0.1',
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    runId: reportedRunId,
    counts: {
      plannedDispatches: 6,
      maximumDispatches: 8,
      sentDispatches,
      attemptRecords: records.length,
      durableRequiredShards: durableShards.length,
    },
    usageEstimate: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalTokens,
      estimatedCostUsd: costSum === null ? null : Math.round(costSum * 1_000_000) / 1_000_000,
      billingConfirmed: false,
    },
    checks,
    findings,
  };
};
