import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';

import { registerPactSessionEventTypes } from './events.js';
import { registerPactTools } from './pact-tools.js';
import { SubmissionRegistry } from './submission-registry.js';

export const name = 'pact-agent-host';
export const inject = ['tools'];

export interface Config {
  readonly mode: 'foundation-gate';
}

export const Config: z<Config> = z.object({
  mode: z.const('foundation-gate').default('foundation-gate'),
});

export function apply(ctx: Context, config: Config): void {
  if (config.mode !== 'foundation-gate') {
    throw new Error('unsupported PACT host mode');
  }
  ctx.effect(function* pactHostFoundation() {
    yield registerPactSessionEventTypes();
    yield registerPactTools(ctx, new SubmissionRegistry());
  }, 'pact foundation host');
}

export {
  coldInspect,
  createFoundationHarness,
  type FoundationHarness,
  type FoundationHarnessOptions,
} from './create-foundation-harness.js';
export {
  durableTurn,
  PactDurabilityError,
  waitForTurnEnd,
} from './durable-turn.js';
export { type PactRole } from './events.js';
export { registerPactTools } from './pact-tools.js';
export { SubmissionRegistry } from './submission-registry.js';
export {
  COMPATIBILITY_LIMITS,
  inspectCompatibilityConfig,
} from './compatibility-config.js';
export {
  COMPATIBILITY_PROBES,
  probePlanSummary,
} from './probe-plan.js';
export { buildProviderPreflightReport } from './preflight-report.js';
export {
  CaseSessionLedger,
  type ApprovedExecutionInput,
  type CaseAction,
  type CaseSessionInitialState,
  type CaseSessionMode,
  type CaseSessionSnapshot,
  type CaseSessionStateSummary,
  type CaseSessionStatus,
  type CaseSessionTransition,
  type CaseSessionTransitionRecord,
  type CheckpointResetInput,
  type FailureNoMutationInput,
  type LocalKeepOpaqueInput,
} from './case-session.js';
export {
  persistCaseSessionTransition,
  type CaseSessionTransitionDurabilityReceipt,
} from './case-session-persistence.js';
