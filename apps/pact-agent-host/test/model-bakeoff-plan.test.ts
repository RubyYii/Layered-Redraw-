import { describe, expect, it } from 'vitest';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import {
  BAKEOFF_DEEPSEEK_MODELS,
  BAKEOFF_DEEPSEEK_PHASES,
  BAKEOFF_GEMINI_MODELS,
  BAKEOFF_GEMINI_PHASES,
  BAKEOFF_MAXIMUM_DISPATCHES,
  BAKEOFF_PLANNED_DISPATCHES,
  BAKEOFF_REPETITIONS,
  createModelBakeoffPlan,
  summarizeModelBakeoffPlan,
} from '../src/model-bakeoff-plan.js';

const expectedOrder = [
  '1:deepseek:deepseek-v4-pro:ConductorIntent',
  '1:deepseek:deepseek-v4-pro:Archivist',
  '1:deepseek:deepseek-v4-pro:Guardian',
  '1:deepseek:deepseek-v4-pro:ConductorCommit',
  '1:deepseek:deepseek-v4-flash:ConductorIntent',
  '1:deepseek:deepseek-v4-flash:Archivist',
  '1:deepseek:deepseek-v4-flash:Guardian',
  '1:deepseek:deepseek-v4-flash:ConductorCommit',
  '1:gemini:gemini-3.5-flash:Witness',
  '1:gemini:gemini-3.5-flash:Rewriter',
  '1:gemini:gemini-3.6-flash:Witness',
  '1:gemini:gemini-3.6-flash:Rewriter',
  '1:gemini:gemini-3.7-flash:Witness',
  '1:gemini:gemini-3.7-flash:Rewriter',
  '2:deepseek:deepseek-v4-flash:ConductorIntent',
  '2:deepseek:deepseek-v4-flash:Archivist',
  '2:deepseek:deepseek-v4-flash:Guardian',
  '2:deepseek:deepseek-v4-flash:ConductorCommit',
  '2:deepseek:deepseek-v4-pro:ConductorIntent',
  '2:deepseek:deepseek-v4-pro:Archivist',
  '2:deepseek:deepseek-v4-pro:Guardian',
  '2:deepseek:deepseek-v4-pro:ConductorCommit',
  '2:gemini:gemini-3.7-flash:Witness',
  '2:gemini:gemini-3.7-flash:Rewriter',
  '2:gemini:gemini-3.6-flash:Witness',
  '2:gemini:gemini-3.6-flash:Rewriter',
  '2:gemini:gemini-3.5-flash:Witness',
  '2:gemini:gemini-3.5-flash:Rewriter',
] as const;

describe('model bakeoff plan', () => {
  it('freezes the exact candidate, phase, repetition, and budget constants', () => {
    expect(BAKEOFF_DEEPSEEK_MODELS).toEqual([
      'deepseek-v4-pro',
      'deepseek-v4-flash',
    ]);
    expect(BAKEOFF_GEMINI_MODELS).toEqual([
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
    ]);
    expect(BAKEOFF_DEEPSEEK_PHASES).toEqual([
      'ConductorIntent',
      'Archivist',
      'Guardian',
      'ConductorCommit',
    ]);
    expect(BAKEOFF_GEMINI_PHASES).toEqual(['Witness', 'Rewriter']);
    expect(BAKEOFF_REPETITIONS).toEqual([1, 2]);
    expect(BAKEOFF_PLANNED_DISPATCHES).toBe(28);
    expect(BAKEOFF_MAXIMUM_DISPATCHES).toBe(30);
  });

  it('counterbalances model order while preserving phase continuity', () => {
    const plan = createModelBakeoffPlan(createModelBakeoffFixtures().manifest);

    expect(plan.map(({ repetition, provider, model, phase }) =>
      `${repetition}:${provider}:${model}:${phase}`
    )).toEqual(expectedOrder);
    expect(plan.map(({ plannedOrdinal }) => plannedOrdinal)).toEqual(
      Array.from({ length: 28 }, (_, index) => index + 1),
    );
    expect(new Set(plan.map(({ caseId }) => caseId)).size).toBe(28);
  });

  it('binds every case to the fixed inputs and restricts image bytes by role', () => {
    const fixtures = createModelBakeoffFixtures();
    const plan = createModelBakeoffPlan(fixtures.manifest);

    for (const entry of plan) {
      expect(entry.fixtureManifestSha256).toBe(fixtures.manifest.fixtureManifestSha256);
      expect(entry.promptManifestSha256).toBe(fixtures.manifest.promptManifestSha256);
      expect(entry.schemaManifestSha256).toBe(fixtures.manifest.schemaManifestSha256);
      expect(entry.expectedInputClasses).toContain('fictional_text');
      expect(entry.expectedInputClasses).toContain('synthetic_scene_registry');
      expect(entry.expectedInputClasses.includes('synthetic_spatial_image')).toBe(
        entry.role === 'Witness' || entry.role === 'Rewriter',
      );
      expect(entry.route).toBe(entry.provider === 'deepseek' ? 'deepseek-official' : 'google');
    }

    for (const repetition of BAKEOFF_REPETITIONS) {
      for (const model of BAKEOFF_DEEPSEEK_MODELS) {
        const pair = plan.filter((entry) =>
          entry.repetition === repetition && entry.model === model &&
          (entry.phase === 'ConductorIntent' || entry.phase === 'ConductorCommit')
        );
        expect(pair).toHaveLength(2);
        expect(pair[0]!.continuityKey).toBe(pair[1]!.continuityKey);
        expect(pair[0]!.continuityKey).toBe(`bakeoff:${model}:r${repetition}:conductor`);
      }
    }
    expect(plan.filter((entry) =>
      entry.phase !== 'ConductorIntent' && entry.phase !== 'ConductorCommit'
    ).every((entry) => entry.continuityKey === null)).toBe(true);
  });

  it('summarizes the full indivisible run without manufacturing eligibility', () => {
    const plan = createModelBakeoffPlan(createModelBakeoffFixtures().manifest);

    expect(plan).toHaveLength(28);
    expect(plan.filter(({ provider }) => provider === 'deepseek')).toHaveLength(16);
    expect(plan.filter(({ provider }) => provider === 'gemini')).toHaveLength(12);
    expect(summarizeModelBakeoffPlan(plan)).toEqual({
      intended: 28,
      plannedDispatches: 28,
      maximumDispatches: 30,
      retrySlots: { deepseek: 1, gemini: 1 },
    });
  });
});
