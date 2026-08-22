import {
  validateProviderCallEnvelope,
} from '@layered-redraw/pact-cp03-contracts';

import type { ProviderAttemptRecord } from './provider-envelope.js';
import type {
  ProviderCompatibilityRuntimePartialResult,
  ProviderCompatibilityRuntimeResult,
} from './provider-real-runner.js';
import type {
  ProviderRealRunApproval,
  ProviderRealRunPreflightFacts,
} from './provider-real-run-gate.js';
import {
  COMPATIBILITY_PROBES,
  probePlanSummary,
} from './probe-plan.js';

export interface ProviderRunArchive {
  readonly schemaVersion: 'cp03-provider-raw-run/0.1';
  readonly approval: ProviderRealRunApproval;
  readonly preflight: ProviderRealRunPreflightFacts;
  readonly result:
    | ProviderCompatibilityRuntimeResult
    | ProviderCompatibilityRuntimePartialResult;
}

type EvidenceCheck =
  | 'archive'
  | 'completion'
  | 'dispatchLedger'
  | 'probeCoverage'
  | 'selection'
  | 'providerKind'
  | 'contracts'
  | 'secretScan';

export interface ProviderRunEvidenceFinding {
  readonly code: string;
  readonly path: string;
}

export interface ProviderRunEvidenceReport {
  readonly schemaVersion: 'cp03-provider-evidence-report/0.1';
  readonly status: 'PASS' | 'FAIL';
  readonly runId: string;
  readonly counts: {
    readonly expectedProbes: number;
    readonly coveredProbes: number;
    readonly plannedDispatches: number;
    readonly sentDispatches: number;
    readonly attemptRecords: number;
  };
  readonly checks: Readonly<Record<EvidenceCheck, 'PASS' | 'FAIL'>>;
  readonly findings: readonly ProviderRunEvidenceFinding[];
}

export type ProviderRunEvidenceErrorCode =
  | 'PROVIDER_RUN_SECRET_LEAK_BLOCKED'
  | 'PROVIDER_RUN_EVIDENCE_INVALID';

export class ProviderRunEvidenceError extends Error {
  override readonly name = 'ProviderRunEvidenceError';

  constructor(
    readonly code: ProviderRunEvidenceErrorCode,
    readonly report: ProviderRunEvidenceReport,
  ) {
    super(code);
  }
}

const plan = probePlanSummary(COMPATIBILITY_PROBES);
const probeIds = COMPATIBILITY_PROBES.map((probe) => probe.id);
const probeById = new Map(COMPATIBILITY_PROBES.map((probe) => [
  probe.id,
  probe,
]));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sameStrings = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.length === right.length &&
  left.every((value, index) => value === right[index]);

const forbiddenSecretFields = new Set([
  'apikey',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'privatekey',
  'secret',
]);

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

const recordPath = (index: number, suffix = ''): string =>
  `result.attemptRecords[${index}]${suffix}`;

const expectedFinish = (outcome: string): string => {
  if (outcome === 'structured-tool') return 'tool_calls';
  if (outcome === 'terminal-after-tool-result') return 'stop';
  return 'aborted';
};

export const verifyProviderRunEvidence = (
  serialized: string,
  secretValues: readonly string[] = [],
): ProviderRunEvidenceReport => {
  const checks: Record<EvidenceCheck, 'PASS' | 'FAIL'> = {
    archive: 'PASS',
    completion: 'PASS',
    dispatchLedger: 'PASS',
    probeCoverage: 'PASS',
    selection: 'PASS',
    providerKind: 'PASS',
    contracts: 'PASS',
    secretScan: 'PASS',
  };
  const findings: ProviderRunEvidenceFinding[] = [];
  const findingKeys = new Set<string>();
  const add = (check: EvidenceCheck, code: string, path: string): void => {
    checks[check] = 'FAIL';
    const key = `${code}\u0000${path}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({ code, path });
  };

  const materialSecrets = secretValues.filter((value) =>
    value.trim().length >= 8
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
      'probeCoverage',
      'selection',
      'providerKind',
      'contracts',
    ] as const) {
      add(check, 'ARCHIVE_UNAVAILABLE', '$');
    }
    return {
      schemaVersion: 'cp03-provider-evidence-report/0.1',
      status: 'FAIL',
      runId: 'UNRESOLVED',
      counts: {
        expectedProbes: plan.intendedProbes,
        coveredProbes: 0,
        plannedDispatches: plan.plannedDispatches,
        sentDispatches: 0,
        attemptRecords: 0,
      },
      checks,
      findings,
    };
  }

  scanSecretFields(parsed, '', (code, path) => {
    add('secretScan', code, path);
  });

  if (!isRecord(parsed)) {
    add('archive', 'ARCHIVE_OBJECT_REQUIRED', '$');
  }
  const root = isRecord(parsed) ? parsed : {};
  if (root.schemaVersion !== 'cp03-provider-raw-run/0.1') {
    add('archive', 'ARCHIVE_SCHEMA_VERSION_INVALID', 'schemaVersion');
  }
  const approvalValue = root.approval;
  const preflightValue = root.preflight;
  const resultValue = root.result;
  if (!isRecord(approvalValue)) {
    add('archive', 'APPROVAL_RECORD_MISSING', 'approval');
  }
  if (!isRecord(preflightValue)) {
    add('archive', 'PREFLIGHT_RECORD_MISSING', 'preflight');
  }
  if (!isRecord(resultValue)) {
    add('archive', 'RESULT_RECORD_MISSING', 'result');
  }

  const approvalRecord = isRecord(approvalValue) ? approvalValue : {};
  const preflightRecord = isRecord(preflightValue) ? preflightValue : {};
  const resultRecord = isRecord(resultValue) ? resultValue : {};
  const runId = typeof approvalRecord.runId === 'string'
    ? approvalRecord.runId
    : 'UNRESOLVED';

  if (approvalRecord.schemaVersion !== 'cp03-provider-real-approval/0.1') {
    add('archive', 'APPROVAL_SCHEMA_VERSION_INVALID', 'approval.schemaVersion');
  }
  if (preflightRecord.status !== 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL') {
    add('archive', 'PREFLIGHT_NOT_ELIGIBLE', 'preflight.status');
  }

  const approvalProbeIds = Array.isArray(approvalRecord.probeIds)
    ? approvalRecord.probeIds.filter((value): value is string =>
        typeof value === 'string'
      )
    : [];
  if (!sameStrings(approvalProbeIds, probeIds)) {
    add('archive', 'APPROVED_PROBE_SCOPE_MISMATCH', 'approval.probeIds');
  }
  const approvedInputClasses = Array.isArray(approvalRecord.inputClasses)
    ? approvalRecord.inputClasses.filter((value): value is string =>
        typeof value === 'string'
      )
    : [];
  if (!sameStrings(approvedInputClasses, [
    'fictional_text',
    'synthetic_checkerboard',
  ])) {
    add('archive', 'APPROVED_INPUT_SCOPE_MISMATCH', 'approval.inputClasses');
  }
  if (approvalRecord.plannedDispatches !== plan.plannedDispatches) {
    add('archive', 'APPROVED_DISPATCH_PLAN_MISMATCH', 'approval.plannedDispatches');
  }
  if (approvalRecord.maximumDispatches !== plan.maximumDispatches) {
    add('archive', 'APPROVED_DISPATCH_MAXIMUM_MISMATCH', 'approval.maximumDispatches');
  }

  const preflightCounts = isRecord(preflightRecord.counts)
    ? preflightRecord.counts
    : {};
  const preflightProbes = isRecord(preflightRecord.probes)
    ? preflightRecord.probes
    : {};
  const eligibleProbeIds = Array.isArray(preflightProbes.eligible)
    ? preflightProbes.eligible.filter((value): value is string =>
        typeof value === 'string'
      )
    : [];
  if (
    preflightCounts.intended !== plan.intendedProbes ||
    preflightCounts.eligible !== plan.intendedProbes ||
    preflightCounts.excluded !== 0 ||
    preflightCounts.plannedDispatches !== plan.plannedDispatches ||
    preflightCounts.sentDispatches !== 0 ||
    preflightCounts.maximumDispatches !== plan.maximumDispatches ||
    !sameStrings(eligibleProbeIds, probeIds)
  ) {
    add('archive', 'PREFLIGHT_PLAN_MISMATCH', 'preflight');
  }

  if (
    resultRecord.status !== 'COMPLETED' ||
    resultRecord.completedProbes !== plan.intendedProbes
  ) {
    add('completion', 'RUN_COMPLETION_MISMATCH', 'result');
  }
  const sentDispatches = typeof resultRecord.sentDispatches === 'number'
    ? resultRecord.sentDispatches
    : 0;
  if (
    !Number.isInteger(sentDispatches) ||
    sentDispatches < plan.plannedDispatches ||
    sentDispatches > plan.maximumDispatches
  ) {
    add('dispatchLedger', 'SENT_DISPATCH_COUNT_OUT_OF_BOUNDS', 'result.sentDispatches');
  }

  const records = Array.isArray(resultRecord.attemptRecords)
    ? resultRecord.attemptRecords
    : [];
  if (!Array.isArray(resultRecord.attemptRecords)) {
    add('dispatchLedger', 'ATTEMPT_RECORDS_MISSING', 'result.attemptRecords');
  }
  if (records.length !== sentDispatches) {
    add('dispatchLedger', 'ATTEMPT_COUNT_MISMATCH', 'result.attemptRecords');
  }

  const typedRecords: ProviderAttemptRecord[] = [];
  records.forEach((value, index) => {
    if (!isRecord(value) || !isRecord(value.contract)) {
      add('contracts', 'ATTEMPT_RECORD_INVALID', recordPath(index));
      return;
    }
    if (
      typeof value.runId !== 'string' ||
      typeof value.probeId !== 'string' ||
      (value.provider !== 'deepseek' && value.provider !== 'gemini') ||
      typeof value.purpose !== 'string' ||
      ![
        'structured-tool',
        'terminal-after-tool-result',
        'hard-timeout-cancel',
        'cancel-after-first-chunk',
      ].includes(String(value.expectedOutcome)) ||
      !Number.isInteger(value.sentOrdinal)
    ) {
      add('contracts', 'ATTEMPT_RECORD_INVALID', recordPath(index));
      return;
    }
    try {
      validateProviderCallEnvelope(value.contract);
    } catch {
      add('contracts', 'PROVIDER_ENVELOPE_INVALID', recordPath(index, '.contract'));
      return;
    }
    typedRecords.push(value as unknown as ProviderAttemptRecord);
  });

  const ordinals = typedRecords.map((record) => record.sentOrdinal).sort(
    (left, right) => left - right,
  );
  if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
    add('dispatchLedger', 'SENT_ORDINAL_SEQUENCE_INVALID', 'result.attemptRecords');
  }

  const covered = new Set<string>();
  typedRecords.forEach((record, index) => {
    const probe = probeById.get(record.probeId as typeof probeIds[number]);
    if (probe === undefined) {
      add('probeCoverage', 'UNDECLARED_PROBE_EVIDENCE', recordPath(index, '.probeId'));
      return;
    }
    covered.add(record.probeId);
    if (record.runId !== runId) {
      add('archive', 'RUN_ID_MISMATCH', recordPath(index, '.runId'));
    }
    if (record.provider !== probe.provider) {
      add('selection', 'PROBE_PROVIDER_MISMATCH', recordPath(index, '.provider'));
    }
    const selection = isRecord(approvalRecord.selection)
      ? approvalRecord.selection
      : {};
    const approvedValue = selection[record.provider];
    const approved = isRecord(approvedValue)
      ? approvedValue
      : {};
    if (record.contract.providerRoute !== approved.route) {
      add(
        'selection',
        'APPROVED_SELECTION_MISMATCH',
        recordPath(index, '.contract.providerRoute'),
      );
    }
    if (record.contract.modelId !== approved.model) {
      add(
        'selection',
        'APPROVED_SELECTION_MISMATCH',
        recordPath(index, '.contract.modelId'),
      );
    }
    if (record.contract.providerKind !== 'real') {
      add(
        'providerKind',
        'PROVIDER_KIND_NOT_REAL',
        recordPath(index, '.contract.providerKind'),
      );
    }
    if (
      record.contract.endedAt === null ||
      record.contract.finish.kind === 'pending'
    ) {
      add('contracts', 'PROVIDER_ENVELOPE_UNFINISHED', recordPath(index, '.contract'));
    }
    if (record.contract.lateQuarantined) {
      add('contracts', 'LATE_RESULT_QUARANTINED', recordPath(index, '.contract'));
    }
  });

  for (const probeId of probeIds) {
    if (!covered.has(probeId)) {
      add(
        'probeCoverage',
        'PROBE_EVIDENCE_MISSING',
        `result.attemptRecords.${probeId}`,
      );
    }
  }

  for (const probe of COMPATIBILITY_PROBES) {
    for (const dispatch of probe.dispatches) {
      const matching = typedRecords
        .filter((record) =>
          record.probeId === probe.id && record.purpose === dispatch.purpose
        )
        .sort((left, right) => left.sentOrdinal - right.sentOrdinal);
      if (matching.length === 0) {
        add(
          'dispatchLedger',
          'PLANNED_DISPATCH_EVIDENCE_MISSING',
          `result.attemptRecords.${probe.id}.${dispatch.purpose}`,
        );
        continue;
      }
      const final = matching.at(-1);
      if (final === undefined) continue;
      if (final.expectedOutcome !== dispatch.expectedOutcome) {
        add(
          'dispatchLedger',
          'EXPECTED_OUTCOME_METADATA_MISMATCH',
          `result.attemptRecords.${probe.id}.${dispatch.purpose}`,
        );
      }
      if (final.contract.finish.kind !== expectedFinish(dispatch.expectedOutcome)) {
        add(
          'dispatchLedger',
          'EXPECTED_PROVIDER_OUTCOME_MISSING',
          `result.attemptRecords.${probe.id}.${dispatch.purpose}`,
        );
      }
      const expectedTools = [...(dispatch.expectedTools ?? [])].sort();
      const acceptedTools = final.contract.toolCalls
        .filter((receipt) => receipt.status === 'accepted')
        .map((receipt) => receipt.name)
        .sort();
      if (!sameStrings(acceptedTools, expectedTools)) {
        add(
          'dispatchLedger',
          'EXPECTED_PROVIDER_TOOL_EVIDENCE_MISMATCH',
          `result.attemptRecords.${probe.id}.${dispatch.purpose}`,
        );
      }
      for (const retry of matching.slice(0, -1)) {
        if (
          retry.contract.finish.kind !== 'error' ||
          retry.contract.toolCalls.some((receipt) => receipt.status === 'accepted')
        ) {
          add(
            'dispatchLedger',
            'UNSAFE_RETRY_EVIDENCE',
            `result.attemptRecords.${probe.id}.${dispatch.purpose}`,
          );
        }
      }
    }
  }

  const declaredDispatchKeys = new Set(COMPATIBILITY_PROBES.flatMap((probe) =>
    probe.dispatches.map((dispatch) => `${probe.id}\u0000${dispatch.purpose}`)
  ));
  typedRecords.forEach((record, index) => {
    if (!declaredDispatchKeys.has(`${record.probeId}\u0000${record.purpose}`)) {
      add('dispatchLedger', 'UNDECLARED_DISPATCH_EVIDENCE', recordPath(index, '.purpose'));
    }
  });

  const approvalSelection = isRecord(approvalRecord.selection)
    ? approvalRecord.selection
    : {};
  const preflightSelection = isRecord(preflightRecord.selection)
    ? preflightRecord.selection
    : {};
  for (const provider of ['deepseek', 'gemini'] as const) {
    const approved = isRecord(approvalSelection[provider])
      ? approvalSelection[provider]
      : {};
    const preflight = isRecord(preflightSelection[provider])
      ? preflightSelection[provider]
      : {};
    if (approved.route !== preflight.route || approved.model !== preflight.model) {
      add('selection', 'PREFLIGHT_APPROVAL_SELECTION_MISMATCH', `selection.${provider}`);
    }
  }

  return {
    schemaVersion: 'cp03-provider-evidence-report/0.1',
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    runId,
    counts: {
      expectedProbes: plan.intendedProbes,
      coveredProbes: probeIds.filter((probeId) => covered.has(probeId)).length,
      plannedDispatches: plan.plannedDispatches,
      sentDispatches,
      attemptRecords: records.length,
    },
    checks,
    findings,
  };
};
