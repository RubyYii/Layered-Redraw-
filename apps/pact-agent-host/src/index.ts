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
  CouncilRegistry,
  type AcceptedCouncilCommitReceipt,
  type AcceptedCouncilShardReceipt,
  type CouncilCommitReceipt,
  type CouncilProposalSnapshot,
  type CouncilRegistryOptions,
  type CouncilShardReceipt,
  type DurableConductorCommitReceipt,
  type DurableCouncilShardReceipt,
  type RejectedCouncilCommitReceipt,
  type RejectedCouncilShardReceipt,
} from './council-registry.js';
export {
  COUNCIL_ROLE_TOOLS,
  COUNCIL_ROOT_TOOLS,
  councilToolDefinitions,
  registerCouncilTools,
} from './council-tools.js';
export {
  CouncilToolBindingRegistry,
  type CouncilToolBinding,
  type CouncilToolPhase,
} from './council-tool-binding.js';
export {
  bindConductorCommitSubmission,
  bindCouncilRoleSubmission,
  type BindConductorCommitSubmissionInput,
  type BindCouncilRoleSubmissionInput,
  type ConductorCommitSubmission,
  type CouncilRoleSubmission,
} from './council-submission-binding.js';
export {
  allowedCouncilReferences,
  CouncilReferenceValidationError,
  validateCouncilAssemblyReferences,
  validateCouncilShardReferences,
  type CouncilAssemblyReferenceFailure,
  type AllowedCouncilReferences,
  type CouncilReferenceErrorCode,
} from './council-reference-validation.js';
export {
  durableConductorCommit,
  durableCouncilShard,
  recoverCouncilTraceProjection,
} from './council-durability.js';
export {
  evaluateGuardianConflict,
  type GuardianConflictInput,
  type GuardianConflictResult,
} from './guardian-conflict.js';
export {
  assembleCouncilDraft,
  type AssembleCouncilDraftInput,
  type AssembleCouncilDraftResult,
} from './draft-assembler.js';
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
export {
  COUNCIL_TIMING_LIMITS,
  freezeCouncilTurn,
  isBeforeCouncilDeadline,
  requiredRolesForTurn,
  type CouncilTurnInput,
  type CouncilTurnInputRef,
  type CouncilTurnScope,
  type CouncilTurnSnapshot,
  type FreezeCouncilTurnInput,
  type FrozenCouncilTurn,
} from './council-turn.js';
export {
  runCouncilRuntime,
  type CouncilAttemptRecord,
  type CouncilDispatchPhase,
  type CouncilPublicTrace,
  type CouncilRuntimeOptions,
  type CouncilRuntimeOrchestration,
  type CouncilRuntimeResult,
  type CouncilRuntimeTiming,
} from './council-runtime.js';
export {
  CouncilRoutingError,
  requireCouncilRoutingManifest,
  selectionForCouncilRole,
  type CouncilRoutingErrorCode,
} from './council-routing.js';
export {
  CouncilRunEvidenceError,
  verifyCouncilRunEvidence,
  type CouncilEvidenceCheck,
  type CouncilRunArchive,
  type CouncilRunEvidenceErrorCode,
  type CouncilRunEvidenceFinding,
  type CouncilRunEvidenceReport,
} from './council-run-evidence.js';
export {
  auditCp03CheckpointCandidate,
  canonicalCheckpointJson,
  checkpointSha256,
  createCp03CheckpointArchive,
  CP03_EVIDENCE_CLASSES,
  type Cp03CheckpointArchive,
  type Cp03CheckpointAudit,
  type Cp03CheckpointCandidate,
  type Cp03EvidenceClass,
} from './cp03-checkpoint-archive.js';
export {
  bindingForSnapshot,
  COUNCIL_ROLE_ORDER,
  councilCanonicalJson,
  councilSha256,
  CouncilTransportError,
  InMemoryCouncilDurability,
  runCriticalPathCouncil,
  type ArchivistShard,
  type ConductorDraftCommit,
  type ConductorIntentShard,
  type CouncilCommitDispatchRequest,
  type CouncilDispatchRecord,
  type CouncilDurability,
  type CouncilDurabilityEvent,
  type CouncilFailureResult,
  type CouncilProviderAdapter,
  type CouncilRole,
  type CouncilRunResult,
  type CouncilShard,
  type CouncilShardDispatchRequest,
  type CouncilSuccessResult,
  type CouncilTiming,
  type CouncilTurnSnapshot as CriticalPathCouncilTurnSnapshot,
  type DurableCouncilShard,
  type GuardianDisposition,
  type GuardianShard,
  type RewriterShard,
  type RunCriticalPathCouncilOptions,
  type WitnessShard,
} from './critical-path-council.js';
export {
  auditProviderRoutingManifest,
  type CriticalPathDispatchRole,
  type ProviderInputClass,
  type ProviderRoutingAssignment,
  type ProviderRoutingAudit,
  type ProviderRoutingManifest,
} from './critical-path-routing.js';
export {
  auditGemini37Catalog,
  inspectInstalledGemini37Catalog,
  verifyGemini37CatalogAudit,
  type Gemini37CatalogAudit,
  type Gemini37CatalogSource,
} from './model-catalog-audit.js';
export {
  ADAPTER_READINESS_CLAIM_CEILING,
  ADAPTER_READINESS_VERIFICATION_IDS,
  createAdapterReadinessManifest,
  verifyAdapterReadinessManifest,
  type AdapterReadinessManifest,
} from './adapter-readiness-evidence.js';
export { createSyntheticSpatialImage } from './synthetic-spatial-image.js';
export {
  createModelBakeoffFixtures,
  type ModelBakeoffFixtureManifest,
  type ModelBakeoffFixtures,
  type ModelBakeoffPromptManifest,
  type ModelBakeoffSchemaManifest,
} from './model-bakeoff-fixtures.js';
export {
  BAKEOFF_DEEPSEEK_MODELS,
  BAKEOFF_DEEPSEEK_PHASES,
  BAKEOFF_GEMINI_MODELS,
  BAKEOFF_GEMINI_PHASES,
  BAKEOFF_MAXIMUM_DISPATCHES,
  BAKEOFF_PLANNED_DISPATCHES,
  BAKEOFF_REPETITIONS,
  createModelBakeoffPlan,
  summarizeModelBakeoffPlan,
  type ModelBakeoffCase,
  type ModelBakeoffInputClass,
  type ModelBakeoffPhase,
  type ModelBakeoffPlanSummary,
  type ModelBakeoffProvider,
  type ModelBakeoffRole,
} from './model-bakeoff-plan.js';
export {
  MODEL_BAKEOFF_PRICING_URLS,
  createModelBakeoffPricingManifest,
  createModelBakeoffRoleCapsManifest,
  estimateModelBakeoffWorstCaseUsd,
  verifyModelBakeoffPricingManifest,
  verifyModelBakeoffRoleCapsManifest,
  type ModelBakeoffCostEstimate,
  type ModelBakeoffPricingAudit,
  type ModelBakeoffPricingManifest,
  type ModelBakeoffPricingRate,
  type ModelBakeoffRoleCapsManifest,
  type ModelBakeoffRoleTokenCap,
} from './model-bakeoff-pricing.js';
export {
  buildKeychainPresenceCommand,
  createModelBakeoffKeychainReferenceManifest,
  createModelBakeoffPreflight,
  inspectInstalledModelBakeoffCandidateFacts,
  inspectModelBakeoffCredentialPresence,
  resolveModelBakeoffRunRoot,
  verifyModelBakeoffKeychainReferenceManifest,
  verifyModelBakeoffPreflight,
  type CandidateCatalogFact,
  type KeychainPresenceCommand,
  type ModelBakeoffCredentialPresence,
  type ModelBakeoffKeychainReference,
  type ModelBakeoffKeychainReferenceManifest,
  type ModelBakeoffPreflight,
} from './model-bakeoff-preflight.js';
export {
  runModelBakeoff,
  type ModelBakeoffAttemptRecord,
  type ModelBakeoffCaseOutcome,
  type ModelBakeoffDispatchRequest,
  type ModelBakeoffProviderFacts,
  type ModelBakeoffRunResult,
  type ModelBakeoffSessionEventRange,
  type ModelBakeoffToolResult,
  type ModelBakeoffTransport,
  type ModelBakeoffTransportResult,
  type ModelBakeoffTransportResultKind,
} from './model-bakeoff-runner.js';
export {
  createModelBakeoffDshTransport,
  type ModelBakeoffDshDiagnostic,
  type ModelBakeoffDshTransport,
  type ModelBakeoffDshTransportOptions,
  type ModelBakeoffPromptContext,
} from './model-bakeoff-dsh-transport.js';
export {
  verifyModelBakeoffEvidence,
  type ModelBakeoffEvidenceCheck,
  type ModelBakeoffEvidenceReport,
  type ModelBakeoffPairEvidence,
  type ModelBakeoffPairRepetitionEvidence,
  type ModelBakeoffRoleDecision,
  type ModelBakeoffTechnicalArchive,
} from './model-bakeoff-evidence.js';
export {
  MODEL_BAKEOFF_REVIEW_CRITERIA,
  createModelBakeoffBlindReview,
  type ModelBakeoffBlindCandidate,
  type ModelBakeoffBlindIdentityMapping,
  type ModelBakeoffBlindOutput,
  type ModelBakeoffBlindPacket,
  type ModelBakeoffBlindRoleSection,
  type ModelBakeoffSealedMapping,
} from './model-bakeoff-blind-review.js';
