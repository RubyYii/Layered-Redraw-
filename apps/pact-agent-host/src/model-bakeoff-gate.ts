import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import * as cp03Contracts from '@layered-redraw/pact-cp03-contracts';

import {
  createModelBakeoffFixtures,
  type ModelBakeoffFixtureManifest,
} from './model-bakeoff-fixtures.js';
import {
  createModelBakeoffPlan,
  type ModelBakeoffCase,
  type ModelBakeoffProvider,
} from './model-bakeoff-plan.js';
import {
  verifyModelBakeoffKeychainReferenceManifest,
  verifyModelBakeoffPreflight,
  type ModelBakeoffKeychainReferenceManifest,
  type ModelBakeoffPreflight,
} from './model-bakeoff-preflight.js';
import {
  verifyModelBakeoffPricingManifest,
  verifyModelBakeoffRoleCapsManifest,
  type ModelBakeoffPricingManifest,
  type ModelBakeoffRoleCapsManifest,
} from './model-bakeoff-pricing.js';

export const MODEL_BAKEOFF_APPROVAL_MAX_AGE_MS = 15 * 60 * 1_000;

const validateModelBakeoffApproval = (
  cp03Contracts as unknown as {
    readonly validateModelBakeoffApproval: (value: unknown) => unknown;
  }
).validateModelBakeoffApproval;

export interface ModelBakeoffApprovalCandidate {
  readonly provider: ModelBakeoffProvider;
  readonly route: 'deepseek-official' | 'google';
  readonly model: string;
}

export interface ModelBakeoffApproval {
  readonly schemaVersion: 'cp03-model-bakeoff-approval/0.1';
  readonly approvalId: string;
  readonly approvedAt: string;
  readonly runId: string;
  readonly planSha256: string;
  readonly preflightSha256: string;
  readonly fixtureManifestSha256: string;
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly pricingManifestSha256: string;
  readonly candidates: readonly ModelBakeoffApprovalCandidate[];
  readonly repetitions: 2;
  readonly counts: {
    readonly intended: 28;
    readonly eligible: 28;
    readonly excluded: 0;
    readonly sent: 0;
    readonly plannedDispatches: 28;
    readonly maximumDispatches: 30;
  };
  readonly inputClasses: readonly [
    'fictional_text',
    'synthetic_spatial_image',
    'synthetic_scene_registry',
  ];
  readonly tokenCapsSha256: string;
  readonly keychainReferencesSha256: string;
  readonly retrySlots: { readonly deepseek: 1; readonly gemini: 1 };
  readonly worstCaseEstimatedUsd: number;
  readonly maxUsd: number;
  readonly oneRunOnly: true;
  readonly automaticRerun: false;
  readonly externalCapabilities: readonly [];
}

export type ModelBakeoffAuthorization =
  | { readonly status: 'AUTHORIZED'; readonly approval: ModelBakeoffApproval }
  | {
      readonly status: 'REFUSED';
      readonly code: 'MODEL_BAKEOFF_SCOPE_MISMATCH';
      readonly mismatches: readonly string[];
      readonly providerRequestsMade: 0;
    };

export interface ModelBakeoffArchiveState {
  readonly resultExists: boolean;
  readonly pendingResultExists: boolean;
}

const expectedCandidates: readonly ModelBakeoffApprovalCandidate[] = Object.freeze([
  Object.freeze({
    provider: 'deepseek',
    route: 'deepseek-official',
    model: 'deepseek-v4-pro',
  }),
  Object.freeze({
    provider: 'deepseek',
    route: 'deepseek-official',
    model: 'deepseek-v4-flash',
  }),
  Object.freeze({ provider: 'gemini', route: 'google', model: 'gemini-3.5-flash' }),
  Object.freeze({ provider: 'gemini', route: 'google', model: 'gemini-3.6-flash' }),
  Object.freeze({ provider: 'gemini', route: 'google', model: 'gemini-3.7-flash' }),
]);

const expectedCounts = Object.freeze({
  intended: 28,
  eligible: 28,
  excluded: 0,
  sent: 0,
  plannedDispatches: 28,
  maximumDispatches: 30,
});

const expectedInputClasses = Object.freeze([
  'fictional_text',
  'synthetic_spatial_image',
  'synthetic_scene_registry',
]);

const sameCanonical = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);

const addMismatch = (mismatches: string[], condition: boolean, field: string): void => {
  if (!condition) mismatches.push(field);
};

export function authorizeModelBakeoff(input: {
  readonly approval: ModelBakeoffApproval;
  readonly preflight: ModelBakeoffPreflight;
  readonly plan: readonly ModelBakeoffCase[];
  readonly fixtures: ModelBakeoffFixtureManifest;
  readonly pricing: ModelBakeoffPricingManifest;
  readonly roleCaps: ModelBakeoffRoleCapsManifest;
  readonly keychainReferences: ModelBakeoffKeychainReferenceManifest;
  readonly archiveState: ModelBakeoffArchiveState;
  readonly now?: number;
}): ModelBakeoffAuthorization {
  const mismatches: string[] = [];
  try {
    validateModelBakeoffApproval(input.approval);
  } catch {
    mismatches.push('approval.contract');
  }

  const now = input.now ?? Date.now();
  const approvedAt = Date.parse(input.approval.approvedAt);
  const approvalAge = now - approvedAt;
  addMismatch(
    mismatches,
    Number.isFinite(approvedAt)
      && approvalAge >= 0
      && approvalAge <= MODEL_BAKEOFF_APPROVAL_MAX_AGE_MS,
    'approvedAt',
  );

  const canonicalFixtures = createModelBakeoffFixtures().manifest;
  const canonicalPlan = createModelBakeoffPlan(canonicalFixtures);
  addMismatch(
    mismatches,
    verifyModelBakeoffPreflight(input.preflight).status === 'PASS'
      && input.preflight.status === 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL',
    'preflight',
  );
  addMismatch(mismatches, sameCanonical(input.fixtures, canonicalFixtures), 'fixtures');
  addMismatch(mismatches, sameCanonical(input.plan, canonicalPlan), 'plan');
  addMismatch(
    mismatches,
    verifyModelBakeoffPricingManifest(input.pricing, now).status === 'PASS',
    'pricing',
  );
  addMismatch(
    mismatches,
    verifyModelBakeoffRoleCapsManifest(input.roleCaps).status === 'PASS',
    'roleCaps',
  );
  addMismatch(
    mismatches,
    verifyModelBakeoffKeychainReferenceManifest(input.keychainReferences).status === 'PASS',
    'keychainReferences',
  );

  addMismatch(mismatches, input.approval.runId === input.preflight.runId, 'runId');
  addMismatch(
    mismatches,
    input.approval.planSha256 === input.preflight.planSha256
      && input.preflight.planSha256 === canonicalPlanHash(input.plan),
    'planSha256',
  );
  addMismatch(
    mismatches,
    input.approval.preflightSha256 === input.preflight.preflightSha256,
    'preflightSha256',
  );
  addMismatch(
    mismatches,
    input.approval.fixtureManifestSha256 === input.preflight.fixtureManifestSha256
      && input.preflight.fixtureManifestSha256 === input.fixtures.fixtureManifestSha256,
    'fixtureManifestSha256',
  );
  addMismatch(
    mismatches,
    input.approval.promptManifestSha256 === input.preflight.promptManifestSha256
      && input.preflight.promptManifestSha256 === input.fixtures.promptManifestSha256,
    'promptManifestSha256',
  );
  addMismatch(
    mismatches,
    input.approval.schemaManifestSha256 === input.preflight.schemaManifestSha256
      && input.preflight.schemaManifestSha256 === input.fixtures.schemaManifestSha256,
    'schemaManifestSha256',
  );
  addMismatch(
    mismatches,
    input.approval.pricingManifestSha256 === input.preflight.pricingManifestSha256
      && input.preflight.pricingManifestSha256 === input.pricing.manifestSha256,
    'pricingManifestSha256',
  );
  addMismatch(mismatches, sameCanonical(input.approval.candidates, expectedCandidates), 'candidates');
  addMismatch(mismatches, input.approval.repetitions === 2, 'repetitions');
  addMismatch(
    mismatches,
    sameCanonical(input.approval.counts, expectedCounts)
      && sameCanonical(input.preflight.counts, expectedCounts),
    'counts',
  );
  addMismatch(
    mismatches,
    sameCanonical(input.approval.inputClasses, expectedInputClasses),
    'inputClasses',
  );
  addMismatch(
    mismatches,
    input.approval.tokenCapsSha256 === input.roleCaps.manifestSha256
      && input.preflight.roleCapsSha256 === input.roleCaps.manifestSha256,
    'tokenCapsSha256',
  );
  addMismatch(
    mismatches,
    input.approval.keychainReferencesSha256 === input.keychainReferences.manifestSha256
      && input.preflight.keychainReferencesSha256 === input.keychainReferences.manifestSha256,
    'keychainReferencesSha256',
  );
  addMismatch(
    mismatches,
    sameCanonical(input.approval.retrySlots, { deepseek: 1, gemini: 1 }),
    'retrySlots',
  );
  addMismatch(
    mismatches,
    input.preflight.worstCaseEstimatedUsd !== null
      && input.approval.worstCaseEstimatedUsd === input.preflight.worstCaseEstimatedUsd,
    'worstCaseEstimatedUsd',
  );
  addMismatch(
    mismatches,
    input.preflight.worstCaseEstimatedUsd !== null
      && Number.isFinite(input.approval.maxUsd)
      && input.approval.maxUsd >= input.preflight.worstCaseEstimatedUsd,
    'maxUsd',
  );
  addMismatch(mismatches, input.approval.oneRunOnly === true, 'oneRunOnly');
  addMismatch(mismatches, input.approval.automaticRerun === false, 'automaticRerun');
  addMismatch(
    mismatches,
    input.approval.externalCapabilities.length === 0,
    'externalCapabilities',
  );
  addMismatch(
    mismatches,
    input.archiveState.resultExists === false,
    'archiveState.resultExists',
  );
  addMismatch(
    mismatches,
    input.archiveState.pendingResultExists === false,
    'archiveState.pendingResultExists',
  );

  const uniqueMismatches = [...new Set(mismatches)];
  if (uniqueMismatches.length > 0) {
    return Object.freeze({
      status: 'REFUSED' as const,
      code: 'MODEL_BAKEOFF_SCOPE_MISMATCH' as const,
      mismatches: Object.freeze(uniqueMismatches),
      providerRequestsMade: 0 as const,
    });
  }
  return Object.freeze({ status: 'AUTHORIZED' as const, approval: input.approval });
}

function canonicalPlanHash(plan: readonly ModelBakeoffCase[]): string {
  return createHash('sha256').update(canonicalJson(plan), 'utf8').digest('hex');
}
