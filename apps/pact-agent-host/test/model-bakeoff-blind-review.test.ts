import { describe, expect, it } from 'vitest';

import {
  createModelBakeoffBlindReview,
  MODEL_BAKEOFF_REVIEW_CRITERIA,
} from '../src/model-bakeoff-blind-review.js';
import { verifyModelBakeoffEvidence } from '../src/model-bakeoff-evidence.js';
import {
  cloneArchive,
  createPassingModelBakeoffArchive,
} from './model-bakeoff-test-fixtures.js';

const FIXED_SEED = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

describe('blinded model bakeoff packet', () => {
  it('regenerates deterministically while keeping identity only in the sealed mapping', async () => {
    const archive = await createPassingModelBakeoffArchive();
    const evidence = verifyModelBakeoffEvidence({ archive });
    const first = createModelBakeoffBlindReview({
      evidence,
      seed: FIXED_SEED,
      createdAt: '2000-01-01T12:10:00.000Z',
    });
    const second = createModelBakeoffBlindReview({
      evidence,
      seed: FIXED_SEED,
      createdAt: '2000-01-01T12:10:00.000Z',
    });

    expect(first).toEqual(second);
    expect(first.packet.criteria).toEqual(MODEL_BAKEOFF_REVIEW_CRITERIA);
    expect(first.packet.roles.map(({ roleDecision }) => roleDecision)).toEqual([
      'ConductorContinuity',
      'Witness',
      'Archivist',
      'Rewriter',
      'Guardian',
    ]);
    expect(first.packet.roles.every(({ candidates, decision }) =>
      candidates.every(({ outputs }) => outputs.length === 2)
      && decision.selectedBlindLabel === null
      && decision.authorNotes === ''
    )).toBe(true);
    expect(first.sealedMapping.seedHex).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sealedMapping.mappings).toHaveLength(12);
    expect(first.packet.packetSha256).toMatch(/^[a-f0-9]{64}$/);

    const visible = JSON.stringify(first.packet);
    for (const identity of [
      'deepseek',
      'gemini',
      'google',
      'deepseek-official',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'seedHex',
      'pricing',
      'latency',
      'inputTokens',
      'outputTokens',
      'attemptId',
    ]) expect(visible.toLowerCase()).not.toContain(identity.toLowerCase());
    expect(JSON.stringify(first.sealedMapping)).toContain('gemini-3.7-flash');
    expect(first.packet).not.toHaveProperty('selectedModel');
  });

  it('excludes a technically ineligible pair and never fills the author decision', async () => {
    const archive = await createPassingModelBakeoffArchive();
    const target = archive.diagnostics.find((diagnostic) =>
      diagnostic.role === 'Rewriter' && diagnostic.model === 'gemini-3.5-flash'
    )!;
    (target as unknown as { redactedOutputText: string | null }).redactedOutputText =
      'tampered output';
    const evidence = verifyModelBakeoffEvidence({ archive });
    const review = createModelBakeoffBlindReview({
      evidence,
      seed: FIXED_SEED,
      createdAt: '2000-01-01T12:10:00.000Z',
    });
    const rewriter = review.packet.roles.find(({ roleDecision }) =>
      roleDecision === 'Rewriter'
    )!;

    expect(rewriter.candidates).toHaveLength(2);
    expect(rewriter.decision).toEqual({ selectedBlindLabel: null, authorNotes: '' });
    expect(review.sealedMapping.mappings.some(({ model }) => model === 'gemini-3.5-flash'
      && review.sealedMapping.mappings.find(({ model: candidate }) => candidate === model)
        ?.roleDecision === 'Rewriter')).toBe(false);
  });

  it('labels replacement evidence as partial and includes only pair-eligible candidates', async () => {
    const archive = cloneArchive(await createPassingModelBakeoffArchive({
      replacementPolicy: true,
    }));
    const target = archive.diagnostics.find((diagnostic) =>
      diagnostic.role === 'Guardian'
      && diagnostic.model === 'deepseek-v4-pro'
      && archive.plan.find(({ caseId }) => caseId === diagnostic.caseId)?.repetition === 1
    )!;
    (target as unknown as { redactedOutputText: string | null }).redactedOutputText =
      'synthetic invalidated Guardian output';
    const evidence = verifyModelBakeoffEvidence({ archive });
    const review = createModelBakeoffBlindReview({
      evidence,
      seed: FIXED_SEED,
      createdAt: '2000-01-01T12:10:00.000Z',
    });

    expect(evidence.status).toBe('FAIL');
    expect(review.packet.schemaVersion).toBe('cp03-model-bakeoff-blind-review/0.2');
    expect(review.packet.claimCeiling).toContain('partial technical coverage');
    expect(review.sealedMapping.mappings).toHaveLength(11);
    expect(review.sealedMapping.mappings.some(({ roleDecision, model }) =>
      roleDecision === 'Guardian' && model === 'deepseek-v4-pro'
    )).toBe(false);
    expect(review.packet.roles.every(({ decision }) =>
      decision.selectedBlindLabel === null && decision.authorNotes === ''
    )).toBe(true);
  });
});
