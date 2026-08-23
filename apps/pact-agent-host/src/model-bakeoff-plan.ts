import type { ModelBakeoffFixtureManifest } from './model-bakeoff-fixtures.js';

export const BAKEOFF_DEEPSEEK_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash',
] as const;

export const BAKEOFF_GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
] as const;

export const BAKEOFF_DEEPSEEK_PHASES = [
  'ConductorIntent',
  'Archivist',
  'Guardian',
  'ConductorCommit',
] as const;

export const BAKEOFF_GEMINI_PHASES = [
  'Witness',
  'Rewriter',
] as const;

export const BAKEOFF_REPETITIONS = [1, 2] as const;
export const BAKEOFF_PLANNED_DISPATCHES = 28 as const;
export const BAKEOFF_MAXIMUM_DISPATCHES = 30 as const;

export type ModelBakeoffProvider = 'deepseek' | 'gemini';
export type ModelBakeoffPhase =
  | typeof BAKEOFF_DEEPSEEK_PHASES[number]
  | typeof BAKEOFF_GEMINI_PHASES[number];
export type ModelBakeoffRole =
  | 'CaseConductor'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';
export type ModelBakeoffInputClass =
  | 'fictional_text'
  | 'synthetic_spatial_image'
  | 'synthetic_scene_registry';

export interface ModelBakeoffCase {
  readonly caseId: string;
  readonly plannedOrdinal: number;
  readonly provider: ModelBakeoffProvider;
  readonly route: 'deepseek-official' | 'google';
  readonly model:
    | typeof BAKEOFF_DEEPSEEK_MODELS[number]
    | typeof BAKEOFF_GEMINI_MODELS[number];
  readonly phase: ModelBakeoffPhase;
  readonly role: ModelBakeoffRole;
  readonly repetition: typeof BAKEOFF_REPETITIONS[number];
  readonly fixtureManifestSha256: string;
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly expectedInputClasses: readonly ModelBakeoffInputClass[];
  readonly continuityKey: string | null;
}

export interface ModelBakeoffPlanSummary {
  readonly intended: 28;
  readonly plannedDispatches: 28;
  readonly maximumDispatches: 30;
  readonly retrySlots: {
    readonly deepseek: 1;
    readonly gemini: 1;
  };
}

const roleForPhase: Readonly<Record<ModelBakeoffPhase, ModelBakeoffRole>> = {
  ConductorIntent: 'CaseConductor',
  Archivist: 'Archivist',
  Guardian: 'Guardian',
  ConductorCommit: 'CaseConductor',
  Witness: 'Witness',
  Rewriter: 'Rewriter',
};

const phaseSlug = (phase: ModelBakeoffPhase): string => phase
  .replace(/([a-z])([A-Z])/g, '$1-$2')
  .toLowerCase();

const freezeCases = (cases: ModelBakeoffCase[]): readonly ModelBakeoffCase[] => {
  for (const entry of cases) {
    Object.freeze(entry.expectedInputClasses);
    Object.freeze(entry);
  }
  return Object.freeze(cases);
};

export function createModelBakeoffPlan(
  fixtures: ModelBakeoffFixtureManifest,
): readonly ModelBakeoffCase[] {
  let plannedOrdinal = 0;
  const cases: ModelBakeoffCase[] = [];

  const append = (
    provider: ModelBakeoffProvider,
    model: ModelBakeoffCase['model'],
    phase: ModelBakeoffPhase,
    repetition: ModelBakeoffCase['repetition'],
  ): void => {
    plannedOrdinal += 1;
    const role = roleForPhase[phase];
    const imageRole = role === 'Witness' || role === 'Rewriter';
    const conductorPhase = phase === 'ConductorIntent' || phase === 'ConductorCommit';
    cases.push({
      caseId:
        `cp03-bakeoff-r${repetition}-${provider}-${model}-${phaseSlug(phase)}`,
      plannedOrdinal,
      provider,
      route: provider === 'deepseek' ? 'deepseek-official' : 'google',
      model,
      phase,
      role,
      repetition,
      fixtureManifestSha256: fixtures.fixtureManifestSha256,
      promptManifestSha256: fixtures.promptManifestSha256,
      schemaManifestSha256: fixtures.schemaManifestSha256,
      expectedInputClasses: imageRole
        ? ['fictional_text', 'synthetic_spatial_image', 'synthetic_scene_registry']
        : ['fictional_text', 'synthetic_scene_registry'],
      continuityKey: conductorPhase
        ? `bakeoff:${model}:r${repetition}:conductor`
        : null,
    });
  };

  for (const repetition of BAKEOFF_REPETITIONS) {
    const deepseekModels = repetition === 1
      ? BAKEOFF_DEEPSEEK_MODELS
      : [...BAKEOFF_DEEPSEEK_MODELS].reverse();
    const geminiModels = repetition === 1
      ? BAKEOFF_GEMINI_MODELS
      : [...BAKEOFF_GEMINI_MODELS].reverse();

    for (const model of deepseekModels) {
      for (const phase of BAKEOFF_DEEPSEEK_PHASES) {
        append('deepseek', model, phase, repetition);
      }
    }
    for (const model of geminiModels) {
      for (const phase of BAKEOFF_GEMINI_PHASES) {
        append('gemini', model, phase, repetition);
      }
    }
  }

  return freezeCases(cases);
}

export function summarizeModelBakeoffPlan(
  plan: readonly ModelBakeoffCase[],
): ModelBakeoffPlanSummary {
  if (
    plan.length !== BAKEOFF_PLANNED_DISPATCHES
    || plan.filter(({ provider }) => provider === 'deepseek').length !== 16
    || plan.filter(({ provider }) => provider === 'gemini').length !== 12
  ) {
    throw new Error('MODEL_BAKEOFF_PLAN_INCOMPLETE');
  }
  return Object.freeze({
    intended: 28,
    plannedDispatches: BAKEOFF_PLANNED_DISPATCHES,
    maximumDispatches: BAKEOFF_MAXIMUM_DISPATCHES,
    retrySlots: Object.freeze({ deepseek: 1, gemini: 1 }),
  });
}
