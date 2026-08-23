import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import type {
  CouncilRole,
  ProviderRoutingAssignment,
  ProviderRoutingManifest,
} from '../src/contract-types.js';
import type {
  CouncilAttemptRecord,
  CouncilPublicTrace,
  CouncilRuntimeResult,
} from '../src/council-runtime.js';
import {
  verifyCouncilRunEvidence,
  type CouncilRunArchive,
  type CouncilRunEvidenceReport,
} from '../src/council-run-evidence.js';
import {
  createProviderAttemptRecord,
  finalizeProviderAttemptRecord,
} from '../src/provider-envelope.js';
import {
  COUNCIL_DURABILITY_PROOF,
  type DurableConductorCommitReceipt,
  type DurableCouncilShardReceipt,
} from '../src/council-registry.js';

const roleOrder: readonly CouncilRole[] = [
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
];

const routingAssignment = (
  provider: 'deepseek' | 'gemini',
  role: CouncilRole,
  promptHash: string,
): ProviderRoutingAssignment => ({
  provider,
  route: provider === 'deepseek' ? 'deepseek-official' : 'gemini-official',
  model: provider === 'deepseek'
    ? 'deepseek-model-pending-bakeoff'
    : 'gemini-model-pending-bakeoff',
  adapterPackage: provider === 'deepseek'
    ? '@deepseek-ai/dsh-llm-deepseek'
    : '@deepseek-ai/dsh-llm-pi-ai',
  adapterVersion: '0.1.0-rc.6',
  promptHash,
  toolProfile: 'council-v2',
  maximumConcurrency: provider === 'deepseek' ? 3 : 2,
  inputClasses: role === 'Witness' || role === 'Rewriter' ? ['text', 'image'] : ['text'],
  inputLimitTokens: 4096,
  outputLimitTokens: 2048,
  timeoutMs: 12_000,
});

const manifest = (): ProviderRoutingManifest => ({
  schemaVersion: 'cp03-council-routing/0.1',
  manifestVersion: 'cp03-council-routing/manifest-0.1',
  plannedDispatches: 6,
  maximumDispatches: 8,
  assignments: {
    CaseConductor: routingAssignment('deepseek', 'CaseConductor', '1'.repeat(64)),
    Witness: routingAssignment('gemini', 'Witness', '2'.repeat(64)),
    Archivist: routingAssignment('deepseek', 'Archivist', '3'.repeat(64)),
    Rewriter: routingAssignment('gemini', 'Rewriter', '4'.repeat(64)),
    Guardian: routingAssignment('deepseek', 'Guardian', '5'.repeat(64)),
  },
});

const completedTiming = () => ({
  startedAtMonotonicMs: 1_000,
  systemStatusAtMonotonicMs: 1_050,
  firstPublicTraceAtMonotonicMs: 2_000,
  requiredShardsAtMonotonicMs: 4_000,
  conductorCommitAtMonotonicMs: 6_000,
  assemblyStartedAtMonotonicMs: 6_050,
  assemblyEndedAtMonotonicMs: 6_100,
  draftAcceptedAtMonotonicMs: 7_000,
  systemStatusTargetMet: true,
  firstPublicTraceTargetMet: true,
  requiredShardsTargetMet: true,
  conductorCommitTargetMet: true,
  draftTargetMet: true,
  hardDeadlineMet: true,
});

const completedOrchestration = () => ({
  activeConductorTurns: 2,
  settlementSinkTurns: 4,
  blockedSettlementSinkTurns: 4,
  undeclaredProviderStreams: 0,
  deadlineCancellationRequested: false,
  harnessDisposed: true,
  cleanupReasonCodes: [],
});

const createAttemptRecords = (
  runId: string,
  snapshotHash: string,
): CouncilAttemptRecord[] => {
  const currentManifest = manifest();
  const shardRecords = roleOrder.map((role, index) => {
    const assignment = currentManifest.assignments[role];
    const sentOrdinal = index + 1;
    const startedAt = new Date(1_000 + sentOrdinal * 100).toISOString();
    const rawPending = createProviderAttemptRecord({
      probeId: `council-shard-${role.toLowerCase()}`,
      provider: assignment.provider,
      route: assignment.route,
      model: assignment.model,
      purpose: `submit one typed ${role} council shard`,
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_council_shard'],
      providerKind: 'scripted',
    }, runId, 1, sentOrdinal, 13_000, startedAt, null);
    const finalized = finalizeProviderAttemptRecord(rawPending, {
      outcome: 'structured-tool',
      sideEffectAccepted: true,
    }, new Date(1_000 + sentOrdinal * 100 + 50).toISOString());
    return {
      ...finalized,
      contract: {
        ...finalized.contract,
        sessionEventRange: role === 'CaseConductor'
          ? {
              sessionId: '00000000-0000-4000-8000-000000000001',
              fromSequence: 1,
              toSequence: 1,
            }
          : null,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          estimatedCostUsd: 0.001,
        },
      },
      council: {
        role,
        phase: 'SHARD' as const,
        snapshotHash,
        promptHash: assignment.promptHash,
        declaredDispatchOrdinal: sentOrdinal,
      },
    };
  });

  const conductorAssignment = currentManifest.assignments.CaseConductor;
  const commitOrdinal = 6;
  const commitStartedAt = new Date(1_000 + commitOrdinal * 100).toISOString();
  const rawCommitPending = createProviderAttemptRecord({
    probeId: 'council-conductor_commit-caseconductor',
    provider: conductorAssignment.provider,
    route: conductorAssignment.route,
    model: conductorAssignment.model,
    purpose: 'submit one minimal CaseConductor commit',
    expectedOutcome: 'structured-tool',
    expectedTools: ['pact_submit_conductor_commit'],
    providerKind: 'scripted',
  }, runId, 1, commitOrdinal, 13_000, commitStartedAt, null);
  const finalizedCommit = finalizeProviderAttemptRecord(rawCommitPending, {
    outcome: 'structured-tool',
    sideEffectAccepted: true,
  }, new Date(1_000 + commitOrdinal * 100 + 50).toISOString());
  const commitRecord: CouncilAttemptRecord = {
    ...finalizedCommit,
    contract: {
      ...finalizedCommit.contract,
      sessionEventRange: {
        sessionId: '00000000-0000-4000-8000-000000000001',
        fromSequence: 2,
        toSequence: 2,
      },
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.001,
      },
    },
    council: {
      role: 'CaseConductor',
      phase: 'CONDUCTOR_COMMIT' as const,
      snapshotHash,
      promptHash: conductorAssignment.promptHash,
      declaredDispatchOrdinal: 6,
    },
  };

  return [...shardRecords, commitRecord];
};

const asTransportFailure = (
  record: CouncilAttemptRecord,
): CouncilAttemptRecord => ({
  ...record,
  contract: {
    ...record.contract,
    firstChunkAt: null,
    firstPublicTraceAt: null,
    finish: { kind: 'error', detailCode: 'TRANSPORT' },
    toolCalls: [],
  },
});

const asSuccessfulRetry = (
  initial: CouncilAttemptRecord,
  sentOrdinal: number,
): CouncilAttemptRecord => ({
  ...initial,
  attempt: 2,
  sentOrdinal,
  contract: {
    ...initial.contract,
    callId: `call_council_retry_${initial.council.role.toLowerCase()}_${sentOrdinal}`,
    retryOf: initial.contract.callId,
  },
});

const withSentOrdinal = (
  record: CouncilAttemptRecord,
  sentOrdinal: number,
): CouncilAttemptRecord => ({
  ...record,
  sentOrdinal,
  contract: {
    ...record.contract,
    callId: `call_council_initial_${record.council.role.toLowerCase()}_${sentOrdinal}`,
  },
});

const defaultWitnessShardHash = '2'.repeat(64);

const firstPublicTrace = (): CouncilPublicTrace => ({
  caseSessionId: 'case_council01',
  turnId: 'turn_council01',
  text: 'A bounded synthetic council contribution.',
  role: 'Witness',
  sourceContributionHash: defaultWitnessShardHash,
  acceptanceSequence: 2,
  projectedAtMonotonicMs: 2_000,
  durableAtMonotonicMs: 2_000,
});

const durableShardReceipts = (): DurableCouncilShardReceipt[] => [
  {
    accepted: true,
    status: 'DURABLE' as const,
    sessionId: '00000000-0000-4000-8000-000000000001',
    shardId: 'shard_conductor01',
    lastSeq: 1,
    turnId: 'turn_council01',
    payloadHash: 'c'.repeat(64),
    acceptanceSequence: 1,
    acceptedAtMonotonicMs: 1_800,
    projectedTrace: false,
    shardEventSeq: 1,
    traceEventSeq: null,
    [COUNCIL_DURABILITY_PROOF]: true,
  },
  {
    accepted: true,
    status: 'DURABLE' as const,
    sessionId: '00000000-0000-4000-8000-000000000002',
    shardId: 'shard_witness01',
    lastSeq: 3,
    turnId: 'turn_council01',
    payloadHash: defaultWitnessShardHash,
    acceptanceSequence: 2,
    acceptedAtMonotonicMs: 2_000,
    projectedTrace: true,
    shardEventSeq: 2,
    traceEventSeq: 3,
    [COUNCIL_DURABILITY_PROOF]: true,
  },
  {
    accepted: true,
    status: 'DURABLE' as const,
    sessionId: '00000000-0000-4000-8000-000000000003',
    shardId: 'shard_archivist01',
    lastSeq: 4,
    turnId: 'turn_council01',
    payloadHash: 'a'.repeat(64),
    acceptanceSequence: 3,
    acceptedAtMonotonicMs: 2_200,
    projectedTrace: false,
    shardEventSeq: 4,
    traceEventSeq: null,
    [COUNCIL_DURABILITY_PROOF]: true,
  },
  {
    accepted: true,
    status: 'DURABLE' as const,
    sessionId: '00000000-0000-4000-8000-000000000004',
    shardId: 'shard_rewriter01',
    lastSeq: 5,
    turnId: 'turn_council01',
    payloadHash: 'e'.repeat(64),
    acceptanceSequence: 4,
    acceptedAtMonotonicMs: 2_400,
    projectedTrace: false,
    shardEventSeq: 5,
    traceEventSeq: null,
    [COUNCIL_DURABILITY_PROOF]: true,
  },
  {
    accepted: true,
    status: 'DURABLE' as const,
    sessionId: '00000000-0000-4000-8000-000000000005',
    shardId: 'shard_guardian01',
    lastSeq: 6,
    turnId: 'turn_council01',
    payloadHash: '5'.repeat(64),
    acceptanceSequence: 5,
    acceptedAtMonotonicMs: 2_600,
    projectedTrace: false,
    shardEventSeq: 6,
    traceEventSeq: null,
    [COUNCIL_DURABILITY_PROOF]: true,
  },
];

const durableConductorCommitReceipt = (): DurableConductorCommitReceipt => ({
  accepted: true,
  status: 'DURABLE' as const,
  sessionId: '00000000-0000-4000-8000-000000000001',
  lastSeq: 7,
  turnId: 'turn_council01',
  payloadHash: 'b'.repeat(64),
  commitEventSeq: 7,
  [COUNCIL_DURABILITY_PROOF]: true,
});

const draft = () => ({
  identity: {
    draftId: 'draft_council01',
    schemaVersion: 'cp03-runtime/0.1' as const,
    caseSessionId: 'case_council01',
    turnId: 'turn_council01',
    parentSceneHash: 'b'.repeat(64),
  },
  decision: {
    status: 'PROPOSED' as const,
    actionSequence: ['Reframe', 'Continue'],
  },
  creative: {
    interpretation: 'Treat distance as a relation, not a recovered fact.',
    unresolvedAmbiguities: ['The exact spatial relation remains uncertain.'],
    spatialIntent: 'Use the registered bridge without replacing the source.',
    visualIntent: 'Preserve the seam between source and proposal.',
    cameraIntent: 'Hold a readable lateral relation.',
    lightIntent: 'Keep one restrained edge light.',
    soundIntent: 'Use only fictional room tone.',
    publicPoeticText: 'The grid leans; the source does not.',
    seamsAndContradictionsToPreserve: ['Near and not-near remain visible.'],
  },
  materials: {
    requestedAssetIds: ['asset-cup01'],
    requestedSpatialBridgeIds: ['bridge-window01'],
    provenanceAnchors: ['input_image01', 'source-plane'],
    rightsRequirements: ['rights-local-scene'],
  },
  execution: {
    executionMode: 'EXECUTABLE_PROPOSAL' as const,
    semanticCapabilityCalls: [{
      capability: 'performRegisteredInteraction',
      arguments: {
        actorId: 'interaction-actor-a',
        targetId: 'asset-cup01',
        affordance: 'pickup',
      },
    }],
    expectedChanges: ['interaction-actor-a', 'asset-cup01'],
    forbiddenChanges: ['source-plane'],
    forbiddenCapabilityIds: ['rawTransform'],
    rollbackRequirements: ['rollback-transient-overlay'],
    terminalIntent: 'Continue' as const,
  },
  agency: {
    contributions: [
      {
        role: 'CaseConductor' as const,
        childSessionId: '00000000-0000-4000-8000-000000000001',
        contributionHash: 'c'.repeat(64),
      },
      {
        role: 'Witness' as const,
        childSessionId: '00000000-0000-4000-8000-000000000002',
        contributionHash: defaultWitnessShardHash,
      },
      {
        role: 'Archivist' as const,
        childSessionId: '00000000-0000-4000-8000-000000000003',
        contributionHash: 'a'.repeat(64),
      },
      {
        role: 'Rewriter' as const,
        childSessionId: '00000000-0000-4000-8000-000000000004',
        contributionHash: 'e'.repeat(64),
      },
      {
        role: 'Guardian' as const,
        childSessionId: '00000000-0000-4000-8000-000000000005',
        contributionHash: '5'.repeat(64),
      },
    ],
    disagreements: ['Do not treat the spatial relation as historical fact.'],
    guardianChallenge: 'Execute only after approval of this exact hash-bound proposal.',
    witnessEvidence: {
      observations: [{
        observationId: 'observation_witness01',
        text: 'The synthetic image contains a visible source plane.',
        inputRefIds: ['input_image01', 'input_text01'],
      }],
      uncertainties: ['The spatial relation remains interpretive.'],
      evidenceAnchors: ['input_image01', 'input_text01'],
    },
    dissentRecords: [{
      dissentId: 'dissent_guardian01',
      text: 'Do not treat the spatial relation as historical fact.',
      evidenceIds: ['input_text01'],
    }],
  },
});

const canonicalSha256 = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value))
  .digest('hex');

const validCompletedResult = (
  runId: string,
  snapshotHash: string,
): CouncilRuntimeResult => {
  const completedDraft = draft();
  return {
    status: 'COMPLETED',
    draft: completedDraft,
    draftHash: canonicalSha256(completedDraft),
    firstPublicTrace: firstPublicTrace(),
    providerRequestsMade: 6,
    attemptRecords: createAttemptRecords(runId, snapshotHash),
    durableShardReceipts: durableShardReceipts(),
    durableConductorCommitReceipt: durableConductorCommitReceipt(),
    selectionBarrierClosed: true,
    timing: completedTiming(),
    orchestration: completedOrchestration(),
  };
};

const validCouncilRunArchive = (): CouncilRunArchive => {
  const runId = 'run_council_test_01';
  const snapshotHash = 'a'.repeat(64);
  return {
    schemaVersion: 'cp03-council-run/0.1',
    runId,
    snapshotHash,
    routingManifest: manifest(),
    result: validCompletedResult(runId, snapshotHash),
  };
};

describe('verifyCouncilRunEvidence', () => {
  it('accepts a genuine valid PASS council run archive', () => {
    const archive = validCouncilRunArchive();
    const report: CouncilRunEvidenceReport = verifyCouncilRunEvidence(
      JSON.stringify(archive),
      [],
    );

    expect(report).toMatchObject({
      schemaVersion: 'cp03-council-evidence-report/0.1',
      status: 'PASS',
      runId: archive.runId,
      counts: {
        plannedDispatches: 6,
        maximumDispatches: 8,
        sentDispatches: 6,
        attemptRecords: 6,
        durableRequiredShards: 5,
      },
      usageEstimate: {
        inputTokens: 600,
        outputTokens: 300,
        totalTokens: 900,
        estimatedCostUsd: 0.006,
        billingConfirmed: false,
      },
      checks: {
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
      },
      findings: [],
    });
  });

  it('binds the valid archive to adapter metadata produced by createProviderAttemptRecord', () => {
    const archive = validCouncilRunArchive();
    const geminiRecords = archive.result.attemptRecords.filter(
      (record) => record.provider === 'gemini',
    );

    expect(geminiRecords).toHaveLength(2);
    for (const record of geminiRecords) {
      expect(record.contract.adapterPackage).toBe('@deepseek-ai/dsh-llm-pi-ai');
      expect(record.contract.adapterVersion).toBe(
        archive.routingManifest.assignments[record.council.role].adapterVersion,
      );
    }
    expect(verifyCouncilRunEvidence(JSON.stringify(archive), []).status).toBe('PASS');
  });

  it('rejects malformed JSON', () => {
    const report = verifyCouncilRunEvidence('{ invalid json', []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.archive).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'ARCHIVE_JSON_INVALID',
      path: '$',
    });
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
      expect(report.checks[check]).toBe('FAIL');
    }
  });

  it('rejects non-object JSON root', () => {
    const report = verifyCouncilRunEvidence(JSON.stringify('not an object'), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.archive).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'ARCHIVE_OBJECT_REQUIRED',
      path: '$',
    });
  });

  it('rejects invalid schema version', () => {
    const invalid = {
      ...validCouncilRunArchive(),
      schemaVersion: 'cp03-council-run/0.2',
    };
    const report = verifyCouncilRunEvidence(JSON.stringify(invalid), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.archive).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'ARCHIVE_SCHEMA_VERSION_INVALID',
      path: 'schemaVersion',
    });
  });

  it('rejects missing required archive fields', () => {
    const { runId: _runId, result: _result, ...missingFields } = validCouncilRunArchive();
    const report = verifyCouncilRunEvidence(JSON.stringify(missingFields), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.archive).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      { code: 'RUN_ID_MISSING', path: 'runId' },
      { code: 'RESULT_RECORD_MISSING', path: 'result' },
    ]));
  });

  it('detects secret-shaped field names and exact secret values without leaking secrets', () => {
    const secretValue = 'super-secret-key-123456';
    const archiveWithSecret = {
      ...validCouncilRunArchive(),
      diagnostics: {
        apiKey: secretValue,
      },
    };
    const report = verifyCouncilRunEvidence(
      JSON.stringify(archiveWithSecret),
      [secretValue],
    );

    expect(report.status).toBe('FAIL');
    expect(report.checks.secretScan).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      { code: 'SECRET_FIELD_PRESENT', path: 'diagnostics.apiKey' },
      { code: 'SECRET_VALUE_PRESENT', path: '$serialized' },
    ]));
    expect(JSON.stringify(report)).not.toContain(secretValue);
  });

  it('rejects attempt count less than 6 or greater than 8 for a completed run', () => {
    const archive = validCouncilRunArchive();
    const fewerAttempts = {
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 5,
        attemptRecords: archive.result.attemptRecords.slice(0, 5),
      },
    };
    const reportFewer = verifyCouncilRunEvidence(JSON.stringify(fewerAttempts), []);
    expect(reportFewer.status).toBe('FAIL');
    expect(reportFewer.checks.dispatchLedger).toBe('FAIL');
    expect(reportFewer.findings).toContainEqual({
      code: 'SENT_DISPATCH_COUNT_OUT_OF_BOUNDS',
      path: 'result.sentDispatches',
    });
  });

  it('rejects non-sequential sentOrdinals or count mismatch', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((record, index) => ({
      ...record,
      sentOrdinal: index === 1 ? 1 : index + 1, // duplicate ordinal 1
    }));
    const mismatchArchive = {
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7, // mismatch with 6 records
        attemptRecords: records,
      },
    };
    const report = verifyCouncilRunEvidence(JSON.stringify(mismatchArchive), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.dispatchLedger).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      { code: 'ATTEMPT_COUNT_MISMATCH', path: 'result.attemptRecords' },
      { code: 'SENT_ORDINAL_SEQUENCE_INVALID', path: 'result.attemptRecords' },
    ]));
  });

  it('rejects missing role coverage or missing commit dispatch', () => {
    const archive = validCouncilRunArchive();
    const withoutWitness = {
      ...archive,
      result: {
        ...archive.result,
        attemptRecords: archive.result.attemptRecords.filter(
          (record) => record.council.role !== 'Witness',
        ),
      },
    };
    const report = verifyCouncilRunEvidence(JSON.stringify(withoutWitness), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.roleCoverage).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'ROLE_COVERAGE_MISSING',
      path: 'result.attemptRecords.Witness',
    });
  });

  it('rejects Conductor model mismatch between intent and commit', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((record) => {
      if (record.council.role === 'CaseConductor' && record.council.phase === 'CONDUCTOR_COMMIT') {
        return {
          ...record,
          contract: {
            ...record.contract,
            modelId: 'deepseek-different-model',
          },
        };
      }
      return record;
    });
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        attemptRecords: records,
      },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.selection).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'CONDUCTOR_MODEL_MISMATCH',
      path: 'result.attemptRecords[5].contract.modelId',
    });
  });

  it('rejects invalid providerKind', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((record, index) => {
      if (index === 0) {
        return {
          ...record,
          contract: {
            ...record.contract,
            providerKind: 'unsupported' as unknown as 'scripted',
          },
        };
      }
      return record;
    });
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        attemptRecords: records,
      },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.providerKind).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PROVIDER_KIND_INVALID',
      path: 'result.attemptRecords[0].contract.providerKind',
    });
  });

  it('rejects malformed provider call envelope, pending attempts, or late quarantined attempts', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((record, index) => {
      if (index === 0) {
        return {
          ...record,
          contract: {
            ...record.contract,
            toolCalls: null as unknown as [],
          },
        };
      }
      return record;
    });
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        attemptRecords: records,
      },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.contracts).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PROVIDER_ENVELOPE_INVALID',
      path: 'result.attemptRecords[0].contract',
    });
  });

  it('rejects a completed archive whose logical final slot stops without its accepted council tool', () => {
    const archive = validCouncilRunArchive();
    const stopped = archive.result.attemptRecords.map((record, index) =>
      index === 0
        ? {
            ...record,
            expectedOutcome: 'terminal-after-tool-result' as const,
            expectedTools: [],
            contract: {
              ...record.contract,
              finish: { kind: 'stop' as const },
              toolCalls: [],
            },
          }
        : record
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: stopped },
    }), []);

    expect(report.status).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      {
        code: 'COUNCIL_FINAL_EXPECTED_OUTCOME_INVALID',
        path: 'result.attemptRecords[0].expectedOutcome',
      },
      {
        code: 'COUNCIL_FINAL_EXPECTED_TOOLS_INVALID',
        path: 'result.attemptRecords[0].expectedTools',
      },
      {
        code: 'COUNCIL_FINAL_FINISH_INVALID',
        path: 'result.attemptRecords[0].contract.finish',
      },
      {
        code: 'COUNCIL_FINAL_TOOL_RECEIPT_INVALID',
        path: 'result.attemptRecords[0].contract.toolCalls',
      },
    ]));
  });

  it('rejects observed/unaccepted or self-declared wrong tools on a completed final slot', () => {
    const archive = validCouncilRunArchive();
    const observed = archive.result.attemptRecords.map((record, index) =>
      index === 1
        ? {
            ...record,
            contract: {
              ...record.contract,
              toolCalls: record.contract.toolCalls.map((receipt) => ({
                ...receipt,
                status: 'observed' as const,
              })),
            },
          }
        : record
    );
    const observedReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: observed },
    }), []);
    expect(observedReport.findings).toContainEqual({
      code: 'COUNCIL_FINAL_TOOL_RECEIPT_INVALID',
      path: 'result.attemptRecords[1].contract.toolCalls',
    });

    const wrongTool = archive.result.attemptRecords.map((record, index) =>
      index === 1
        ? {
            ...record,
            expectedTools: ['pact_submit_conductor_commit'] as const,
            contract: {
              ...record.contract,
              toolCalls: record.contract.toolCalls.map((receipt) => ({
                ...receipt,
                name: 'pact_submit_conductor_commit',
              })),
            },
          }
        : record
    );
    const wrongToolReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: wrongTool },
    }), []);
    expect(wrongToolReport.findings).toEqual(expect.arrayContaining([
      {
        code: 'COUNCIL_FINAL_EXPECTED_TOOLS_INVALID',
        path: 'result.attemptRecords[1].expectedTools',
      },
      {
        code: 'COUNCIL_FINAL_TOOL_RECEIPT_INVALID',
        path: 'result.attemptRecords[1].contract.toolCalls',
      },
    ]));
  });

  it('returns FAIL instead of throwing when expectedTools is not an array', () => {
    const archive = validCouncilRunArchive();
    const malformed = archive.result.attemptRecords.map((record, index) =>
      index === 0
        ? { ...record, expectedTools: null as unknown as [] }
        : record
    );

    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: malformed },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'ATTEMPT_RECORD_INVALID',
      path: 'result.attemptRecords[0]',
    });
  });

  it('rejects undeclared hidden settlement streams or invalid orchestration turns', () => {
    const archive = validCouncilRunArchive();
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        orchestration: {
          ...archive.result.orchestration,
          undeclaredProviderStreams: 1,
        },
      },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.orchestration).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'UNDECLARED_PROVIDER_STREAMS_PRESENT',
      path: 'result.orchestration.undeclaredProviderStreams',
    });
  });

  it('rejects unlinked first public trace', () => {
    const archive = validCouncilRunArchive();
    const unlinkedTrace: CouncilPublicTrace = {
      caseSessionId: 'case_council01',
      turnId: 'turn_council01',
      text: 'unlinked trace',
      role: 'Witness',
      sourceContributionHash: '0'.repeat(64), // not matching any durable shard receipt
      acceptanceSequence: 2,
      projectedAtMonotonicMs: 1_900,
      durableAtMonotonicMs: 2_000,
    };
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        firstPublicTrace: unlinkedTrace,
      },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.draftAuthority).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PUBLIC_TRACE_SHARD_HASH_UNLINKED',
      path: 'result.firstPublicTrace.sourceContributionHash',
    });
  });

  it('rejects promoted draft on non-COMPLETED status', () => {
    const archive = validCouncilRunArchive();
    const withheldWithDraft = {
      ...archive,
      result: {
        ...archive.result,
        status: 'WITHHELD' as const,
        draft: draft(), // promoted draft when withheld is forbidden
        draftHash: 'd'.repeat(64),
      },
    };
    const report = verifyCouncilRunEvidence(JSON.stringify(withheldWithDraft), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.draftAuthority).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PROMOTED_DRAFT_ON_NON_COMPLETED_STATUS',
      path: 'result.draft',
    });
  });

  it('rejects inconsistent timing booleans and hard deadline missed on completed run', () => {
    const archive = validCouncilRunArchive();
    const missedDeadline = {
      ...archive,
      result: {
        ...archive.result,
        timing: {
          ...archive.result.timing,
          hardDeadlineMet: false,
        },
      },
    };
    const reportMissed = verifyCouncilRunEvidence(JSON.stringify(missedDeadline), []);
    expect(reportMissed.status).toBe('FAIL');
    expect(reportMissed.checks.timing).toBe('FAIL');
    expect(reportMissed.findings).toContainEqual({
      code: 'HARD_DEADLINE_MISSED',
      path: 'result.timing.hardDeadlineMet',
    });

    const inconsistentBoolean = {
      ...archive,
      result: {
        ...archive.result,
        timing: {
          ...archive.result.timing,
          firstPublicTraceAtMonotonicMs: 4_000, // 3000ms elapsed > 2500ms target
          firstPublicTraceTargetMet: true, // inconsistent
        },
      },
    };
    const reportInconsistent = verifyCouncilRunEvidence(JSON.stringify(inconsistentBoolean), []);
    expect(reportInconsistent.status).toBe('FAIL');
    expect(reportInconsistent.checks.timing).toBe('FAIL');
    expect(reportInconsistent.findings).toContainEqual({
      code: 'PUBLIC_TRACE_TARGET_INCONSISTENT',
      path: 'result.timing.firstPublicTraceTargetMet',
    });
  });

  it('rejects missing or inconsistent token usage on completed attempts', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((record, index) => {
      if (index === 0) {
        return {
          ...record,
          contract: {
            ...record.contract,
            usage: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 200, // inconsistent: 100+50 !== 200
              estimatedCostUsd: 0.001,
            },
          },
        };
      }
      return record;
    });
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        attemptRecords: records,
      },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.usageEstimate).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'USAGE_TOKENS_INCONSISTENT',
      path: 'result.attemptRecords[0].contract.usage',
    });
  });

  it('preserves partial failure archives as FAIL without throwing', () => {
    const archive = validCouncilRunArchive();
    const partialFailureArchive = {
      ...archive,
      result: {
        status: 'WITHHELD' as const,
        draft: null,
        draftHash: null,
        firstPublicTrace: firstPublicTrace(),
        reasonCodes: ['GUARDIAN_WITHHOLD'],
        providerRequestsMade: 6,
        attemptRecords: archive.result.attemptRecords,
        durableShardReceipts: archive.result.durableShardReceipts,
        durableConductorCommitReceipt: durableConductorCommitReceipt(),
        selectionBarrierClosed: true,
        timing: completedTiming(),
        orchestration: completedOrchestration(),
      },
    };

    const report = verifyCouncilRunEvidence(JSON.stringify(partialFailureArchive), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.completion).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'RUN_STATUS_NON_TERMINAL',
      path: 'result.status',
    });
  });

  it('accepts a valid retry before the Conductor commit without requiring commit sentOrdinal 6', () => {
    const archive = validCouncilRunArchive();
    const initialAttempts = archive.result.attemptRecords;
    const witnessInitial = initialAttempts[1]!;
    const failedWitnessAttempt = asTransportFailure(witnessInitial);
    const retryWitnessAttempt = asSuccessfulRetry(witnessInitial, 6);
    const shiftedCommit = withSentOrdinal(initialAttempts[5]!, 7);
    const sevenAttempts = [
      initialAttempts[0]!,
      failedWitnessAttempt,
      retryWitnessAttempt,
      initialAttempts[2]!,
      initialAttempts[3]!,
      initialAttempts[4]!,
      shiftedCommit,
    ];
    const sevenArchive = {
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: sevenAttempts,
      },
    };
    const report = verifyCouncilRunEvidence(JSON.stringify(sevenArchive), []);
    expect(report.status).toBe('PASS');
    expect(report.counts.sentDispatches).toBe(7);
    expect(report.counts.attemptRecords).toBe(7);

    const retryBeforePrior = [
      initialAttempts[0]!,
      retryWitnessAttempt,
      failedWitnessAttempt,
      initialAttempts[2]!,
      initialAttempts[3]!,
      initialAttempts[4]!,
      shiftedCommit,
    ];
    const reorderedReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: retryBeforePrior,
      },
    }), []);
    expect(reorderedReport.status).toBe('PASS');
  });

  it('rejects unsupported role and phase pairs', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((record, index) =>
      index === 1
        ? {
            ...record,
            council: {
              ...record.council,
              phase: 'CONDUCTOR_COMMIT' as const,
            },
          }
        : record
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: records },
    }), []);

    expect(report.status).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'UNSUPPORTED_ROLE_PHASE_PAIR',
      path: 'result.attemptRecords[1].council.phase',
    });
  });

  it('rejects duplicate or missing initial declared slots', () => {
    const archive = validCouncilRunArchive();
    const duplicateWitness = withSentOrdinal(archive.result.attemptRecords[1]!, 7);
    const duplicateReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: [...archive.result.attemptRecords, duplicateWitness],
      },
    }), []);
    expect(duplicateReport.findings).toContainEqual({
      code: 'INITIAL_SLOT_DUPLICATE',
      path: 'result.attemptRecords.Witness.SHARD',
    });

    const replacedGuardian = archive.result.attemptRecords.map((record, index) =>
      index === 4
        ? {
            ...record,
            provider: 'gemini' as const,
            contract: {
              ...record.contract,
              providerRoute: archive.routingManifest.assignments.Witness.route,
              modelId: archive.routingManifest.assignments.Witness.model,
              adapterPackage: archive.routingManifest.assignments.Witness.adapterPackage,
              adapterVersion: archive.routingManifest.assignments.Witness.adapterVersion,
            },
            council: {
              ...record.council,
              role: 'Witness' as const,
              promptHash: archive.routingManifest.assignments.Witness.promptHash,
              declaredDispatchOrdinal: 2,
            },
          }
        : record
    );
    const missingReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: replacedGuardian },
    }), []);
    expect(missingReport.findings).toEqual(expect.arrayContaining([
      {
        code: 'INITIAL_SLOT_DUPLICATE',
        path: 'result.attemptRecords.Witness.SHARD',
      },
      {
        code: 'INITIAL_SLOT_MISSING',
        path: 'result.attemptRecords.Guardian.SHARD',
      },
    ]));
  });

  it('rejects a retry unless its prior attempt is a completed TRANSPORT error without an accepted tool', () => {
    const archive = validCouncilRunArchive();
    const witnessInitial = archive.result.attemptRecords[1]!;
    const retry = asSuccessfulRetry(witnessInitial, 7);
    const nonTransportReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: [...archive.result.attemptRecords, retry],
      },
    }), []);
    expect(nonTransportReport.findings).toContainEqual({
      code: 'RETRY_PRIOR_NOT_TRANSPORT_ERROR',
      path: 'result.attemptRecords[6].contract.retryOf',
    });

    const acceptedTransport = {
      ...asTransportFailure(witnessInitial),
      contract: {
        ...asTransportFailure(witnessInitial).contract,
        toolCalls: witnessInitial.contract.toolCalls,
      },
    };
    const acceptedReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: [
          archive.result.attemptRecords[0]!,
          acceptedTransport,
          ...archive.result.attemptRecords.slice(2),
          retry,
        ],
      },
    }), []);
    expect(acceptedReport.findings).toContainEqual({
      code: 'RETRY_PRIOR_SIDE_EFFECT_ACCEPTED',
      path: 'result.attemptRecords[6].contract.retryOf',
    });
  });

  it('rejects attempt greater than 2 and more than one retry per provider', () => {
    const archive = validCouncilRunArchive();
    const witnessInitial = archive.result.attemptRecords[1]!;
    const retryTwo = asTransportFailure(asSuccessfulRetry(witnessInitial, 7));
    const retryThree: CouncilAttemptRecord = {
      ...asSuccessfulRetry(witnessInitial, 8),
      attempt: 3,
      contract: {
        ...asSuccessfulRetry(witnessInitial, 8).contract,
        callId: 'call_council_retry_witness_8_third',
        retryOf: retryTwo.contract.callId,
      },
    };
    const attemptThreeReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 8,
        attemptRecords: [
          ...archive.result.attemptRecords.slice(0, 1),
          asTransportFailure(witnessInitial),
          ...archive.result.attemptRecords.slice(2),
          retryTwo,
          retryThree,
        ],
      },
    }), []);
    expect(attemptThreeReport.findings).toContainEqual({
      code: 'ATTEMPT_NUMBER_INVALID',
      path: 'result.attemptRecords[7].attempt',
    });

    const conductorInitial = archive.result.attemptRecords[0]!;
    const archivistInitial = archive.result.attemptRecords[2]!;
    const twoRetryReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 8,
        attemptRecords: [
          asTransportFailure(conductorInitial),
          archive.result.attemptRecords[1]!,
          asTransportFailure(archivistInitial),
          ...archive.result.attemptRecords.slice(3),
          asSuccessfulRetry(conductorInitial, 7),
          asSuccessfulRetry(archivistInitial, 8),
        ],
      },
    }), []);
    expect(twoRetryReport.findings).toContainEqual({
      code: 'PROVIDER_RETRY_LIMIT_EXCEEDED',
      path: 'result.attemptRecords[7]',
    });
  });

  it('gives the lower declared ordinal the sole provider retry slot', () => {
    const archive = validCouncilRunArchive();
    const conductorInitial = archive.result.attemptRecords[0]!;
    const archivistInitial = archive.result.attemptRecords[2]!;
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: [
          asTransportFailure(conductorInitial),
          archive.result.attemptRecords[1]!,
          asTransportFailure(archivistInitial),
          ...archive.result.attemptRecords.slice(3),
          asSuccessfulRetry(archivistInitial, 7),
        ],
      },
    }), []);

    expect(report.findings).toContainEqual({
      code: 'PROVIDER_RETRY_PRIORITY_INVALID',
      path: 'result.attemptRecords[6].contract.retryOf',
    });
  });

  it('rejects duplicate call IDs in attempt records', () => {
    const archive = validCouncilRunArchive();
    const duplicateCallIdRecords = archive.result.attemptRecords.map((r, i) =>
      i === 1 ? { ...r, contract: { ...r.contract, callId: archive.result.attemptRecords[0]!.contract.callId } } : r
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: duplicateCallIdRecords },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.dispatchLedger).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'DUPLICATE_CALL_ID',
      path: 'result.attemptRecords[1].contract.callId',
    });
  });

  it('rejects retryOf present on initial attempt 1', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((r, i) =>
      i === 0 ? { ...r, contract: { ...r.contract, retryOf: 'call_prior_nonexistent' } } : r
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: records },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.dispatchLedger).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'RETRY_OF_ON_INITIAL_ATTEMPT',
      path: 'result.attemptRecords[0].contract.retryOf',
    });
  });

  it('rejects broken retry chain when attempt > 1 has missing or unknown retryOf', () => {
    const archive = validCouncilRunArchive();
    const witnessInitial = archive.result.attemptRecords[1]!;
    const retryRecordMissing: CouncilAttemptRecord = {
      ...witnessInitial,
      attempt: 2,
      sentOrdinal: 7,
      contract: {
        ...witnessInitial.contract,
        callId: 'call_witness_retry_broken',
        retryOf: null,
      },
    };
    const reportMissing = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: [...archive.result.attemptRecords, retryRecordMissing],
      },
    }), []);
    expect(reportMissing.status).toBe('FAIL');
    expect(reportMissing.checks.dispatchLedger).toBe('FAIL');
    expect(reportMissing.findings).toContainEqual({
      code: 'RETRY_CHAIN_BROKEN',
      path: 'result.attemptRecords[6].contract.retryOf',
    });
  });

  it('rejects retry attempting to change role, phase, provider, or declaredDispatchOrdinal', () => {
    const archive = validCouncilRunArchive();
    const initialWitness = archive.result.attemptRecords[1]!;
    const mismatchedRetry: CouncilAttemptRecord = {
      ...initialWitness,
      attempt: 2,
      sentOrdinal: 7,
      provider: 'deepseek', // changed provider from gemini
      contract: {
        ...initialWitness.contract,
        callId: 'call_witness_mismatched_retry',
        retryOf: initialWitness.contract.callId,
      },
    };
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        providerRequestsMade: 7,
        attemptRecords: [...archive.result.attemptRecords, mismatchedRetry],
      },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.dispatchLedger).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'RETRY_BINDING_MISMATCH',
      path: 'result.attemptRecords[6]',
    });
  });

  it('rejects declared dispatch ordinal mismatch on initial slots', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((r, i) =>
      i === 0 ? { ...r, council: { ...r.council, declaredDispatchOrdinal: 2 } } : r
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: records },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.dispatchLedger).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'DISPATCH_ORDINAL_MISMATCH',
      path: 'result.attemptRecords[0].council.declaredDispatchOrdinal',
    });
  });

  it('rejects promptHash mismatch on Conductor commit attempt', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((r, i) =>
      i === 5 ? { ...r, council: { ...r.council, promptHash: '9'.repeat(64) } } : r
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: records },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.contracts).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PROMPT_HASH_MISMATCH',
      path: 'result.attemptRecords[5].council.promptHash',
    });
  });

  it('rejects mixed providerKind across attempt envelopes', () => {
    const archive = validCouncilRunArchive();
    const mixed = archive.result.attemptRecords.map((r, i) =>
      i === 0 ? { ...r, contract: { ...r.contract, providerKind: 'real' as const } } : r
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: mixed },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.providerKind).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PROVIDER_KIND_MISMATCH',
      path: 'result.attemptRecords',
    });
  });

  it('rejects missing or mismatched CaseConductor sessionEventRange evidence', () => {
    const archive = validCouncilRunArchive();
    const missingShardSession = archive.result.attemptRecords.map((r, i) =>
      i === 0 ? { ...r, contract: { ...r.contract, sessionEventRange: null } } : r
    );
    const reportMissing = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: missingShardSession },
    }), []);
    expect(reportMissing.status).toBe('FAIL');
    expect(reportMissing.checks.contracts).toBe('FAIL');
    expect(reportMissing.findings).toContainEqual({
      code: 'CONDUCTOR_SESSION_EVIDENCE_MISSING',
      path: 'result.attemptRecords[0].contract.sessionEventRange',
    });

    const mismatchedCommitSession = archive.result.attemptRecords.map((r, i) =>
      i === 5
        ? {
            ...r,
            contract: {
              ...r.contract,
              sessionEventRange: {
                sessionId: '00000000-0000-4000-8000-000000000099',
                fromSequence: 2,
                toSequence: 2,
              },
            },
          }
        : r
    );
    const reportMismatch = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: mismatchedCommitSession },
    }), []);
    expect(reportMismatch.status).toBe('FAIL');
    expect(reportMismatch.checks.contracts).toBe('FAIL');
    expect(reportMismatch.findings).toContainEqual({
      code: 'CONDUCTOR_SESSION_MISMATCH',
      path: 'result.attemptRecords[5].contract.sessionEventRange.sessionId',
    });
  });

  it('rejects duplicate shard IDs or payload hashes in durableShardReceipts', () => {
    const archive = validCouncilRunArchive();
    const dupShardId = archive.result.durableShardReceipts.map((receipt, i) =>
      i === 1 ? { ...receipt, shardId: archive.result.durableShardReceipts[0]!.shardId } : receipt
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, durableShardReceipts: dupShardId },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.contracts).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'DURABLE_SHARD_RECEIPT_DUPLICATE',
      path: 'result.durableShardReceipts[1].shardId',
    });

    const duplicateTraceHash = archive.result.durableShardReceipts.map((receipt, index) =>
      index === 3
        ? { ...receipt, payloadHash: archive.result.firstPublicTrace!.sourceContributionHash }
        : receipt
    );
    const hashReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, durableShardReceipts: duplicateTraceHash },
    }), []);
    expect(hashReport.findings).toEqual(expect.arrayContaining([
      {
        code: 'DURABLE_SHARD_RECEIPT_DUPLICATE',
        path: 'result.durableShardReceipts[3].payloadHash',
      },
      {
        code: 'PUBLIC_TRACE_RECEIPT_NOT_UNIQUE',
        path: 'result.firstPublicTrace.sourceContributionHash',
      },
    ]));
  });

  it('rejects public trace when linked receipt is not projected or not durable', () => {
    const archive = validCouncilRunArchive();
    const unprojectedReceipts = archive.result.durableShardReceipts.map((receipt, i) =>
      i === 1 ? { ...receipt, projectedTrace: false } : receipt
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, durableShardReceipts: unprojectedReceipts },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.draftAuthority).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PUBLIC_TRACE_RECEIPT_NOT_PROJECTED',
      path: 'result.firstPublicTrace.sourceContributionHash',
    });
  });

  it('binds every firstPublicTrace identity and timing field to its durable projected receipt', () => {
    const archive = validCouncilRunArchive();
    const trace = archive.result.firstPublicTrace!;
    const variants = [
      {
        path: 'result.firstPublicTrace.acceptanceSequence',
        result: { ...archive.result, firstPublicTrace: { ...trace, acceptanceSequence: 3 } },
      },
      {
        path: 'result.firstPublicTrace.turnId',
        result: { ...archive.result, firstPublicTrace: { ...trace, turnId: 'turn_other01' } },
      },
      {
        path: 'result.firstPublicTrace.projectedAtMonotonicMs',
        result: { ...archive.result, firstPublicTrace: { ...trace, projectedAtMonotonicMs: 1_999 } },
      },
      {
        path: 'result.firstPublicTrace.durableAtMonotonicMs',
        result: { ...archive.result, firstPublicTrace: { ...trace, durableAtMonotonicMs: 1_999 } },
      },
      {
        path: 'result.timing.firstPublicTraceAtMonotonicMs',
        result: {
          ...archive.result,
          timing: { ...archive.result.timing, firstPublicTraceAtMonotonicMs: 2_001 },
        },
      },
    ];

    for (const variant of variants) {
      const report = verifyCouncilRunEvidence(JSON.stringify({
        ...archive,
        result: variant.result,
      }), []);
      expect(report.findings).toContainEqual({
        code: 'PUBLIC_TRACE_RECEIPT_BINDING_MISMATCH',
        path: variant.path,
      });
    }
  });

  it('requires exactly one projected receipt and unique strictly increasing acceptance sequences', () => {
    const archive = validCouncilRunArchive();
    const twiceProjected = archive.result.durableShardReceipts.map((receipt, index) =>
      index === 3
        ? { ...receipt, projectedTrace: true, traceEventSeq: 8 }
        : receipt
    );
    const projectedReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, durableShardReceipts: twiceProjected },
    }), []);
    expect(projectedReport.findings).toContainEqual({
      code: 'PROJECTED_TRACE_RECEIPT_COUNT_INVALID',
      path: 'result.durableShardReceipts',
    });

    const duplicateSequence = archive.result.durableShardReceipts.map((receipt, index) =>
      index === 2 ? { ...receipt, acceptanceSequence: 2 } : receipt
    );
    const duplicateReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, durableShardReceipts: duplicateSequence },
    }), []);
    expect(duplicateReport.findings).toContainEqual({
      code: 'DURABLE_SHARD_ACCEPTANCE_SEQUENCE_DUPLICATE',
      path: 'result.durableShardReceipts[2].acceptanceSequence',
    });

    const outOfOrder = archive.result.durableShardReceipts.map((receipt, index) => {
      if (index === 2) return { ...receipt, acceptanceSequence: 4 };
      if (index === 3) return { ...receipt, acceptanceSequence: 3 };
      return receipt;
    });
    const orderReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, durableShardReceipts: outOfOrder },
    }), []);
    expect(orderReport.findings).toContainEqual({
      code: 'DURABLE_SHARD_ACCEPTANCE_SEQUENCE_ORDER_INVALID',
      path: 'result.durableShardReceipts',
    });
  });

  it('requires canonical receipt numbering, monotonic acceptance times, and bounded event sequences', () => {
    const archive = validCouncilRunArchive();
    if (archive.result.status !== 'COMPLETED') {
      throw new Error('fixture must be completed');
    }
    const receiptVariants = [
      {
        code: 'DURABLE_SHARD_ACCEPTANCE_SEQUENCE_INVALID',
        path: 'result.durableShardReceipts',
        receipts: archive.result.durableShardReceipts.map((receipt, index) =>
          index === 4 ? { ...receipt, acceptanceSequence: 6 } : receipt
        ),
      },
      {
        code: 'DURABLE_SHARD_ACCEPTED_AT_ORDER_INVALID',
        path: 'result.durableShardReceipts',
        receipts: archive.result.durableShardReceipts.map((receipt, index) =>
          index === 2 ? { ...receipt, acceptedAtMonotonicMs: 1_900 } : receipt
        ),
      },
      {
        code: 'DURABLE_SHARD_EVENT_SEQUENCE_INVALID',
        path: 'result.durableShardReceipts[2].shardEventSeq',
        receipts: archive.result.durableShardReceipts.map((receipt, index) =>
          index === 2 ? { ...receipt, shardEventSeq: receipt.lastSeq + 1 } : receipt
        ),
      },
      {
        code: 'DURABLE_TRACE_EVENT_SEQUENCE_INVALID',
        path: 'result.durableShardReceipts[1].traceEventSeq',
        receipts: archive.result.durableShardReceipts.map((receipt, index) =>
          index === 1 ? { ...receipt, traceEventSeq: receipt.shardEventSeq } : receipt
        ),
      },
      {
        code: 'DURABLE_TRACE_EVENT_SEQUENCE_INVALID',
        path: 'result.durableShardReceipts[1].traceEventSeq',
        receipts: archive.result.durableShardReceipts.map((receipt, index) =>
          index === 1 ? { ...receipt, traceEventSeq: receipt.lastSeq + 1 } : receipt
        ),
      },
      {
        code: 'DURABLE_TRACE_EVENT_SEQUENCE_INVALID',
        path: 'result.durableShardReceipts[2].traceEventSeq',
        receipts: archive.result.durableShardReceipts.map((receipt, index) =>
          index === 2 ? { ...receipt, traceEventSeq: receipt.lastSeq } : receipt
        ),
      },
    ];

    for (const variant of receiptVariants) {
      const report = verifyCouncilRunEvidence(JSON.stringify({
        ...archive,
        result: {
          ...archive.result,
          durableShardReceipts: variant.receipts,
        },
      }), []);
      expect(report.findings).toContainEqual({
        code: variant.code,
        path: variant.path,
      });
    }

    const commitReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        durableConductorCommitReceipt: {
          ...archive.result.durableConductorCommitReceipt,
          commitEventSeq: archive.result.durableConductorCommitReceipt.lastSeq + 1,
        },
      },
    }), []);
    expect(commitReport.findings).toContainEqual({
      code: 'DURABLE_COMMIT_EVENT_SEQUENCE_INVALID',
      path: 'result.durableConductorCommitReceipt.commitEventSeq',
    });
  });

  it('binds receipt, trace, and completed draft turn and case identities', () => {
    const archive = validCouncilRunArchive();
    if (archive.result.status !== 'COMPLETED') {
      throw new Error('fixture must be completed');
    }
    const changedDraft = {
      ...archive.result.draft,
      identity: { ...archive.result.draft.identity, turnId: 'turn_other01' },
    };
    const variants = [
      {
        path: 'result.durableShardReceipts[2].turnId',
        result: {
          ...archive.result,
          durableShardReceipts: archive.result.durableShardReceipts.map((receipt, index) =>
            index === 2 ? { ...receipt, turnId: 'turn_other01' } : receipt
          ),
        },
      },
      {
        path: 'result.durableConductorCommitReceipt.turnId',
        result: {
          ...archive.result,
          durableConductorCommitReceipt: {
            ...archive.result.durableConductorCommitReceipt,
            turnId: 'turn_other01',
          },
        },
      },
      {
        path: 'result.firstPublicTrace.turnId',
        result: {
          ...archive.result,
          firstPublicTrace: { ...archive.result.firstPublicTrace!, turnId: 'turn_other01' },
        },
      },
      {
        path: 'result.draft.identity.turnId',
        result: {
          ...archive.result,
          draft: changedDraft,
          draftHash: canonicalSha256(changedDraft),
        },
      },
    ];
    for (const variant of variants) {
      const report = verifyCouncilRunEvidence(JSON.stringify({
        ...archive,
        result: variant.result,
      }), []);
      expect(report.findings).toContainEqual({
        code: 'TURN_ID_MISMATCH',
        path: variant.path,
      });
    }

    const caseReport = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: {
        ...archive.result,
        firstPublicTrace: {
          ...archive.result.firstPublicTrace!,
          caseSessionId: 'case_other01',
        },
      },
    }), []);
    expect(caseReport.findings).toContainEqual({
      code: 'CASE_SESSION_ID_MISMATCH',
      path: 'result.firstPublicTrace.caseSessionId',
    });
  });

  it('binds the durable Conductor commit session to a Conductor shard receipt session', () => {
    const archive = validCouncilRunArchive();
    const receipts = archive.result.durableShardReceipts.map((receipt, index) =>
      index === 0
        ? { ...receipt, sessionId: '00000000-0000-4000-8000-000000000099' }
        : receipt
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, durableShardReceipts: receipts },
    }), []);

    expect(report.findings).toContainEqual({
      code: 'CONDUCTOR_SESSION_MISMATCH',
      path: 'result.durableConductorCommitReceipt.sessionId',
    });
  });

  it('rejects a fabricated but well-formed draftHash', () => {
    const archive = validCouncilRunArchive();
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, draftHash: '0'.repeat(64) },
    }), []);

    expect(report.findings).toContainEqual({
      code: 'DRAFT_HASH_MISMATCH',
      path: 'result.draftHash',
    });
  });

  it('rejects missing public trace on completed result', () => {
    const archive = validCouncilRunArchive();
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, firstPublicTrace: null },
    }), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.draftAuthority).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'PUBLIC_TRACE_MISSING',
      path: 'result.firstPublicTrace',
    });
  });

  it('rejects backdated timing timestamp or timing beyond hard deadline', () => {
    const archive = validCouncilRunArchive();
    const backdated = {
      ...archive,
      result: {
        ...archive.result,
        timing: {
          ...archive.result.timing,
          systemStatusAtMonotonicMs: 800, // < startedAtMonotonicMs (1_000)
        },
      },
    };
    const reportBackdated = verifyCouncilRunEvidence(JSON.stringify(backdated), []);
    expect(reportBackdated.status).toBe('FAIL');
    expect(reportBackdated.checks.timing).toBe('FAIL');
    expect(reportBackdated.findings).toContainEqual({
      code: 'TIMING_TIMESTAMP_BACKDATED',
      path: 'result.timing.systemStatusAtMonotonicMs',
    });

    const overdue = {
      ...archive,
      result: {
        ...archive.result,
        timing: {
          ...archive.result.timing,
          draftAcceptedAtMonotonicMs: 14_000, // >= 1_000 + 12_000
        },
      },
    };
    const reportOverdue = verifyCouncilRunEvidence(JSON.stringify(overdue), []);
    expect(reportOverdue.status).toBe('FAIL');
    expect(reportOverdue.checks.timing).toBe('FAIL');
    expect(reportOverdue.findings).toContainEqual({
      code: 'HARD_DEADLINE_INCONSISTENT',
      path: 'result.timing.draftAcceptedAtMonotonicMs',
    });
  });

  it('rejects invalid clean orchestration turns, cancellation requested, or cleanup reason codes', () => {
    const archive = validCouncilRunArchive();
    const badOrch = {
      ...archive,
      result: {
        ...archive.result,
        orchestration: {
          ...archive.result.orchestration,
          activeConductorTurns: 1,
          deadlineCancellationRequested: true,
          cleanupReasonCodes: ['FORCED_SHUTDOWN'],
        },
      },
    };
    const report = verifyCouncilRunEvidence(JSON.stringify(badOrch), []);
    expect(report.status).toBe('FAIL');
    expect(report.checks.orchestration).toBe('FAIL');
    expect(report.findings).toEqual(expect.arrayContaining([
      { code: 'ACTIVE_CONDUCTOR_TURN_COUNT_INVALID', path: 'result.orchestration.activeConductorTurns' },
      { code: 'DEADLINE_CANCELLATION_REQUESTED_INVALID', path: 'result.orchestration.deadlineCancellationRequested' },
      { code: 'CLEANUP_REASON_CODES_NON_EMPTY', path: 'result.orchestration.cleanupReasonCodes' },
    ]));
  });

  it('rejects selectionBarrierClosed false and structurally invalid draft', () => {
    const archive = validCouncilRunArchive();
    const openBarrier = {
      ...archive,
      result: {
        ...archive.result,
        selectionBarrierClosed: false,
      },
    };
    const reportBarrier = verifyCouncilRunEvidence(JSON.stringify(openBarrier), []);
    expect(reportBarrier.status).toBe('FAIL');
    expect(reportBarrier.checks.draftAuthority).toBe('FAIL');
    expect(reportBarrier.findings).toContainEqual({
      code: 'SELECTION_BARRIER_NOT_CLOSED',
      path: 'result.selectionBarrierClosed',
    });

    const invalidDraft = {
      ...archive,
      result: {
        ...archive.result,
        draft: {
          ...archive.result.draft,
          creative: {} as unknown as Record<string, unknown>, // invalid
        },
      },
    };
    const reportDraft = verifyCouncilRunEvidence(JSON.stringify(invalidDraft), []);
    expect(reportDraft.status).toBe('FAIL');
    expect(reportDraft.checks.draftAuthority).toBe('FAIL');
    expect(reportDraft.findings).toContainEqual({
      code: 'DRAFT_INVALID',
      path: 'result.draft',
    });
  });

  it('nulls estimatedCostUsd when an attempt has null cost without failing usage tokens check', () => {
    const archive = validCouncilRunArchive();
    const records = archive.result.attemptRecords.map((r, i) =>
      i === 0 ? { ...r, contract: { ...r.contract, usage: { ...r.contract.usage!, estimatedCostUsd: null } } } : r
    );
    const report = verifyCouncilRunEvidence(JSON.stringify({
      ...archive,
      result: { ...archive.result, attemptRecords: records },
    }), []);
    expect(report.status).toBe('PASS');
    expect(report.checks.usageEstimate).toBe('PASS');
    expect(report.usageEstimate.estimatedCostUsd).toBeNull();
    expect(report.usageEstimate.totalTokens).toBe(900);
  });

  it('detects short secret value without leaking it in report or findings', () => {
    const shortSecret = 'sec123';
    const archiveWithSecret = {
      ...validCouncilRunArchive(),
      diagnostics: {
        info: `some header containing ${shortSecret}`,
      },
    };
    const report = verifyCouncilRunEvidence(JSON.stringify(archiveWithSecret), [shortSecret]);
    expect(report.status).toBe('FAIL');
    expect(report.checks.secretScan).toBe('FAIL');
    expect(report.findings).toContainEqual({
      code: 'SECRET_VALUE_PRESENT',
      path: '$serialized',
    });
    expect(JSON.stringify(report)).not.toContain(shortSecret);
  });

  it('detects supplied secrets in decoded string leaves when JSON escaping hides the raw value', () => {
    const escapedSecret = 'fictional"quoted\\secret';
    const archive = {
      ...validCouncilRunArchive(),
      diagnostics: { info: `prefix:${escapedSecret}:suffix` },
    };
    const serialized = JSON.stringify(archive);
    expect(serialized).not.toContain(escapedSecret);

    const report = verifyCouncilRunEvidence(serialized, [escapedSecret]);
    expect(report.findings).toContainEqual({
      code: 'SECRET_VALUE_PRESENT',
      path: 'diagnostics.info',
    });
    expect(JSON.stringify(report)).not.toContain(escapedSecret);
  });

  it('detects supplied secrets in decoded object keys without echoing the key in a finding path', () => {
    const escapedSecretKey = 'fictional"key\\secret';
    const archive = {
      ...validCouncilRunArchive(),
      diagnostics: { [escapedSecretKey]: 'synthetic local value' },
    };
    const serialized = JSON.stringify(archive);
    expect(serialized).not.toContain(escapedSecretKey);

    const report = verifyCouncilRunEvidence(serialized, [escapedSecretKey]);
    expect(report.findings).toContainEqual({
      code: 'SECRET_VALUE_PRESENT',
      path: '$decoded-key',
    });
    expect(JSON.stringify(report)).not.toContain(escapedSecretKey);
  });

  it('redacts runId when it contains an exact supplied secret value', () => {
    const archive = validCouncilRunArchive();
    const report = verifyCouncilRunEvidence(JSON.stringify(archive), [archive.runId]);

    expect(report.runId).toBe('REDACTED');
    expect(JSON.stringify(report)).not.toContain(archive.runId);
  });

  it('nulls cost and aggregates tokens only from complete non-late valid envelopes', () => {
    const archive = validCouncilRunArchive();
    const variants = [
      archive.result.attemptRecords.map((record, index) =>
        index === 0
          ? { ...record, contract: { ...record.contract, toolCalls: null } }
          : record
      ),
      archive.result.attemptRecords.map((record, index) =>
        index === 0
          ? {
              ...record,
              contract: {
                ...record.contract,
                endedAt: null,
                latencyMs: null,
                finish: { kind: 'pending' as const },
              },
            }
          : record
      ),
      archive.result.attemptRecords.map((record, index) =>
        index === 0
          ? { ...record, contract: { ...record.contract, lateQuarantined: true } }
          : record
      ),
    ];

    for (const records of variants) {
      const report = verifyCouncilRunEvidence(JSON.stringify({
        ...archive,
        result: { ...archive.result, attemptRecords: records },
      }), []);
      expect(report.status).toBe('FAIL');
      expect(report.usageEstimate).toEqual({
        inputTokens: 500,
        outputTokens: 250,
        totalTokens: 750,
        estimatedCostUsd: null,
        billingConfirmed: false,
      });
    }
  });
});
