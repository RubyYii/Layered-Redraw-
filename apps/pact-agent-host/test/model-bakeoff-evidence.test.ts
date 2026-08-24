import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  verifyModelBakeoffEvidence,
  type ModelBakeoffEvidenceReport,
  type ModelBakeoffTechnicalArchive,
} from '../src/model-bakeoff-evidence.js';
import {
  cloneArchive,
  createPassingModelBakeoffArchive,
} from './model-bakeoff-test-fixtures.js';

const ALL_CHECKS = [
  'archive',
  'approval',
  'plan',
  'dispatchBudget',
  'contracts',
  'grounding',
  'timing',
  'usageAndCost',
  'dshTrace',
  'secretScan',
] as const;

describe('model bakeoff technical evidence', () => {
  it('reverifies the committed Task 8 archive without changing its legacy result or hash', async () => {
    const historicalRoot = new URL(
      '../../../checkpoints/cp03/model-bakeoff/cp03-model-bakeoff-20260824T055034Z/result/',
      import.meta.url,
    );
    const archive = JSON.parse(await readFile(
      new URL('technical-archive.json', historicalRoot),
      'utf8',
    )) as ModelBakeoffTechnicalArchive;
    const archived = JSON.parse(await readFile(
      new URL('technical-evidence.json', historicalRoot),
      'utf8',
    )) as ModelBakeoffEvidenceReport;

    const reverified = verifyModelBakeoffEvidence({ archive });

    expect(reverified.status).toBe('FAIL');
    expect(reverified.pairs.filter(({ technicallyEligible }) => technicallyEligible))
      .toHaveLength(0);
    expect(reverified.technicalEvidenceSha256)
      .toBe(archived.technicalEvidenceSha256);
    expect(reverified).toEqual(archived);
  });

  it('verifies every bound fact while preserving the Stage B timing ceiling', async () => {
    const archive = await createPassingModelBakeoffArchive();
    const report = verifyModelBakeoffEvidence({
      archive,
      secretValues: ['deepseek-secret-not-in-archive', 'gemini-secret-not-in-archive'],
    });

    expect(report.status).toBe('PASS');
    expect(Object.keys(report.checks).sort()).toEqual([...ALL_CHECKS].sort());
    expect(Object.values(report.checks).every((value) => value === 'PASS')).toBe(true);
    expect(report.fullCouncilTimingProven).toBe(false);
    expect(report.claimCeiling).toContain('not a reliability benchmark');
    expect(report.pairs).toHaveLength(12);
    expect(report.pairs.every(({ technicallyEligible }) => technicallyEligible)).toBe(true);
    expect(report.pairs.filter(({ roleDecision }) => roleDecision === 'ConductorContinuity'))
      .toHaveLength(2);
    expect(report.pairs.filter(({ roleDecision }) => roleDecision === 'Witness'))
      .toHaveLength(3);
    expect(report.pairs.every(({ repetitions }) =>
      repetitions.length === 2 && repetitions.every(({ outputText }) => outputText.length > 0)
    )).toBe(true);
    expect(report.technicalEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts both bounded provider retry slots only when each chain is exact', async () => {
    const archive = await createPassingModelBakeoffArchive({
      retryProviders: ['deepseek', 'gemini'],
    });
    const report = verifyModelBakeoffEvidence({ archive });

    expect(archive.result.counts.sent).toBe(30);
    expect(archive.result.providerRequestsMade).toBe(28);
    expect(archive.result.retryUsed).toEqual({ deepseek: true, gemini: true });
    expect(report.status).toBe('PASS');
    expect(report.checks.dispatchBudget).toBe('PASS');
    expect(report.checks.contracts).toBe('PASS');
    expect(report.pairs.every(({ technicallyEligible }) => technicallyEligible)).toBe(true);
  });

  it('fails the exact evidence class that was tampered without turning it into a model-quality judgment', async () => {
    const source = await createPassingModelBakeoffArchive();
    const grounding = cloneArchive(source);
    const witness = grounding.result.attempts.find(({ role }) => role === 'Witness')!;
    (witness as unknown as { groundedInputRefs: string[] }).groundedInputRefs = [
      'synthetic-scene-01',
    ];
    const groundingReport = verifyModelBakeoffEvidence({ archive: grounding });
    expect(groundingReport.checks.grounding).toBe('FAIL');
    expect(groundingReport.status).toBe('FAIL');

    const trace = cloneArchive(source);
    (trace.diagnostics[0]!.sessionEventRange as unknown as { toSequence: number })
      .toSequence += 1;
    const traceReport = verifyModelBakeoffEvidence({ archive: trace });
    expect(traceReport.checks.dshTrace).toBe('FAIL');

    const secret = cloneArchive(source);
    (secret.diagnostics[0]! as unknown as { redactedOutputText: string | null })
      .redactedOutputText = 'deepseek-secret-not-in-archive';
    const secretReport = verifyModelBakeoffEvidence({
      archive: secret,
      secretValues: ['deepseek-secret-not-in-archive'],
    });
    expect(secretReport.checks.secretScan).toBe('FAIL');
    expect(secretReport).not.toHaveProperty('modelChoice');
  });

  it('makes only the affected role/model pair ineligible when one repetition loses technical binding', async () => {
    const archive = await createPassingModelBakeoffArchive();
    const target = archive.diagnostics.find((diagnostic) =>
      diagnostic.role === 'Witness'
      && diagnostic.model === 'gemini-3.7-flash'
      && archive.plan.find(({ caseId }) => caseId === diagnostic.caseId)?.repetition === 2
    )!;
    (target as unknown as { redactedOutputText: string | null }).redactedOutputText =
      `${target.redactedOutputText} tampered`;

    const report = verifyModelBakeoffEvidence({ archive });
    const affected = report.pairs.find(({ roleDecision, model }) =>
      roleDecision === 'Witness' && model === 'gemini-3.7-flash'
    )!;
    const unaffected = report.pairs.find(({ roleDecision, model }) =>
      roleDecision === 'Witness' && model === 'gemini-3.6-flash'
    )!;

    expect(report.checks.contracts).toBe('FAIL');
    expect(affected.technicallyEligible).toBe(false);
    expect(affected.repetitions).toHaveLength(1);
    expect(unaffected.technicallyEligible).toBe(true);
    expect(unaffected.repetitions).toHaveLength(2);
  });

  it('keeps a complete replacement-policy Witness pair eligible when an unrelated Guardian case fails', async () => {
    const archive = cloneArchive(await createPassingModelBakeoffArchive({
      replacementPolicy: true,
    }));
    const guardianCase = archive.plan.find((entry) =>
      entry.role === 'Guardian'
      && entry.model === 'deepseek-v4-pro'
      && entry.repetition === 1
    )!;
    const guardianOutcome = archive.result.cases.find(
      ({ caseId }) => caseId === guardianCase.caseId,
    )!;
    (guardianOutcome as unknown as { status: string; code: string }).status = 'FAILED';
    (guardianOutcome as unknown as { status: string; code: string }).code =
      'SYNTHETIC_GUARDIAN_FAILURE';
    (archive.result as unknown as { status: string }).status = 'PARTIAL';
    (archive.result.counts as unknown as { accepted: number; failed: number }).accepted = 27;
    (archive.result.counts as unknown as { accepted: number; failed: number }).failed = 1;

    const report = verifyModelBakeoffEvidence({ archive });
    const witness = report.pairs.find(({ roleDecision, model }) =>
      roleDecision === 'Witness' && model === 'gemini-3.5-flash'
    )!;
    const guardian = report.pairs.find(({ roleDecision, model }) =>
      roleDecision === 'Guardian' && model === 'deepseek-v4-pro'
    )!;

    expect(report.schemaVersion).toBe('cp03-model-bakeoff-evidence/0.2');
    expect(report.status).toBe('FAIL');
    expect(report.checks.dispatchBudget).toBe('FAIL');
    expect(report.checks.policy).toBe('PASS');
    expect(witness.technicallyEligible).toBe(true);
    expect(witness.repetitions).toHaveLength(2);
    expect(guardian.technicallyEligible).toBe(false);
    expect(guardian.reasonCodes).toContain('REPETITION_1_TECHNICAL_INELIGIBLE');
  });

  it('fails every replacement pair closed when the bound execution policy drifts', async () => {
    const archive = cloneArchive(await createPassingModelBakeoffArchive({
      replacementPolicy: true,
    }));
    (archive.executionPolicy as unknown as { outputSanitizer: string })
      .outputSanitizer = 'enabled';

    const report = verifyModelBakeoffEvidence({ archive });

    expect(report.schemaVersion).toBe('cp03-model-bakeoff-evidence/0.2');
    expect(report.checks.policy).toBe('FAIL');
    expect(report.status).toBe('FAIL');
    expect(report.pairs.every(({ technicallyEligible }) => !technicallyEligible))
      .toBe(true);
  });
});
