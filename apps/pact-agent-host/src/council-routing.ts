import { validateProviderRoutingManifest } from '@layered-redraw/pact-cp03-contracts';
import type {
  CouncilRole,
  ProviderRoutingAssignment,
  ProviderRoutingManifest,
} from './contract-types.js';
import {
  COUNCIL_TIMING_LIMITS,
  type CouncilTurnSnapshot,
} from './council-turn.js';

export type CouncilRoutingErrorCode =
  | 'COUNCIL_ROUTING_MANIFEST_INVALID'
  | 'COUNCIL_ROUTING_SCHEMA_VERSION_INVALID'
  | 'COUNCIL_ROUTING_DISPATCH_COUNT_INVALID'
  | 'COUNCIL_ROUTING_PROVIDER_SET_INVALID'
  | 'COUNCIL_ROUTING_ROLE_MISSING'
  | 'COUNCIL_ROUTING_CONDUCTOR_ROUTE_INVALID'
  | 'COUNCIL_ROUTING_INPUT_CLASS_UNSUPPORTED'
  | 'COUNCIL_ROUTING_REWRITER_IMAGE_UNSUPPORTED'
  | 'COUNCIL_ROUTING_AUDIO_UNSUPPORTED'
  | 'COUNCIL_ROUTING_SNAPSHOT_INPUT_UNSUPPORTED'
  | 'COUNCIL_ROUTING_MANIFEST_VERSION_MISMATCH'
  | 'COUNCIL_ROUTING_PROMPT_HASH_INVALID'
  | 'COUNCIL_ROUTING_TOOL_PROFILE_INVALID'
  | 'COUNCIL_ROUTING_LIMITS_INVALID'
  | 'COUNCIL_ROUTING_TIMEOUT_OUT_OF_BOUNDS'
  | 'COUNCIL_ROUTING_CONCURRENCY_INSUFFICIENT'
  | 'COUNCIL_ROUTING_FALLBACK_FORBIDDEN';

export class CouncilRoutingError extends Error {
  constructor(
    readonly code: CouncilRoutingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CouncilRoutingError';
  }
}

const REQUIRED_COUNCIL_ROLES: readonly CouncilRole[] = [
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
];

const FORBIDDEN_FALLBACK_KEYS = new Set([
  'fallback',
  'fallbacks',
  'fallbackprovider',
  'fallbackproviders',
  'fallbackroute',
  'fallbackroutes',
  'fallbackmodel',
  'fallbackmodels',
  'modelfallback',
  'providerfallback',
  'retrymodels',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasFallbackKeys = (obj: Record<string, unknown>): boolean => {
  for (const key of Object.keys(obj)) {
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    if (FORBIDDEN_FALLBACK_KEYS.has(normalized)) return true;
  }
  return false;
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      if (child !== null && typeof child === 'object') {
        deepFreeze(child);
      }
    }
    Object.freeze(value);
  }
  return value;
};

const mapValidationError = (manifest: unknown): never => {
  if (!isRecord(manifest)) {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_MANIFEST_INVALID',
      'manifest must be a valid object',
    );
  }
  if (manifest.schemaVersion !== 'cp03-council-routing/0.1') {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_SCHEMA_VERSION_INVALID',
      `invalid schemaVersion: ${String(manifest.schemaVersion)}`,
    );
  }
  if (hasFallbackKeys(manifest)) {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_FALLBACK_FORBIDDEN',
      'fallback configurations are strictly forbidden on routing manifest',
    );
  }
  if (
    typeof manifest.manifestVersion !== 'string' ||
    manifest.manifestVersion.trim().length === 0
  ) {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_MANIFEST_INVALID',
      'manifestVersion must be a non-empty string',
    );
  }
  if (manifest.plannedDispatches !== 6 || manifest.maximumDispatches !== 8) {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_DISPATCH_COUNT_INVALID',
      `planned/maximum dispatches must equal 6/8, received ${String(manifest.plannedDispatches)}/${String(manifest.maximumDispatches)}`,
    );
  }
  if (!isRecord(manifest.assignments)) {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_ROLE_MISSING',
      'manifest assignments must be an object',
    );
  }
  const assignments = manifest.assignments;
  for (const role of REQUIRED_COUNCIL_ROLES) {
    if (!isRecord(assignments[role])) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_ROLE_MISSING',
        `missing routing assignment for role ${role}`,
      );
    }
    const assignment = assignments[role] as Record<string, unknown>;
    if (hasFallbackKeys(assignment)) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_FALLBACK_FORBIDDEN',
        `fallback configurations are strictly forbidden on role assignment for ${role}`,
      );
    }
    const provider = assignment.provider;
    if (provider !== 'deepseek' && provider !== 'gemini') {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_PROVIDER_SET_INVALID',
        `unsupported provider ${String(provider)} on role ${role}`,
      );
    }
    const route = assignment.route;
    const model = assignment.model;
    if (typeof route !== 'string' || route.trim().length === 0) {
      if (role === 'CaseConductor') {
        throw new CouncilRoutingError(
          'COUNCIL_ROUTING_CONDUCTOR_ROUTE_INVALID',
          'CaseConductor route must be a non-empty string',
        );
      }
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_MANIFEST_INVALID',
        `route must be a non-empty string on role ${role}`,
      );
    }
    if (typeof model !== 'string' || model.trim().length === 0) {
      if (role === 'CaseConductor') {
        throw new CouncilRoutingError(
          'COUNCIL_ROUTING_CONDUCTOR_ROUTE_INVALID',
          'CaseConductor model must be a non-empty string',
        );
      }
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_MANIFEST_INVALID',
        `model must be a non-empty string on role ${role}`,
      );
    }
    const promptHash = assignment.promptHash;
    if (typeof promptHash !== 'string' || !/^[0-9a-f]{64}$/.test(promptHash)) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_PROMPT_HASH_INVALID',
        `promptHash on role ${role} must be 64 lowercase hex characters`,
      );
    }
    if (assignment.toolProfile !== 'council-v2') {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_TOOL_PROFILE_INVALID',
        `toolProfile on role ${role} must be 'council-v2'`,
      );
    }
    const inputLimitTokens = assignment.inputLimitTokens;
    const outputLimitTokens = assignment.outputLimitTokens;
    if (
      typeof inputLimitTokens !== 'number' ||
      !Number.isInteger(inputLimitTokens) ||
      inputLimitTokens <= 0 ||
      typeof outputLimitTokens !== 'number' ||
      !Number.isInteger(outputLimitTokens) ||
      outputLimitTokens <= 0
    ) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_LIMITS_INVALID',
        `token limits on role ${role} must be positive integers`,
      );
    }
    const timeoutMs = assignment.timeoutMs;
    if (
      typeof timeoutMs !== 'number' ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > COUNCIL_TIMING_LIMITS.hardDeadlineMs
    ) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_TIMEOUT_OUT_OF_BOUNDS',
        `timeoutMs on role ${role} must be positive and <= ${COUNCIL_TIMING_LIMITS.hardDeadlineMs}`,
      );
    }
  }

  const providers = new Set(
    REQUIRED_COUNCIL_ROLES.map((r) => (assignments[r] as Record<string, unknown>)?.provider),
  );
  if (providers.size !== 2 || !providers.has('deepseek') || !providers.has('gemini')) {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_PROVIDER_SET_INVALID',
      'provider set must be exactly {deepseek, gemini}',
    );
  }

  throw new CouncilRoutingError(
    'COUNCIL_ROUTING_MANIFEST_INVALID',
    'ProviderRoutingManifest contract validation failed',
  );
};

export const requireCouncilRoutingManifest = (
  manifest: unknown,
  snapshot?: CouncilTurnSnapshot,
): ProviderRoutingManifest => {
  try {
    validateProviderRoutingManifest(manifest);
  } catch {
    mapValidationError(manifest);
  }

  const rawManifest = manifest as Record<string, unknown>;
  const assignments = rawManifest.assignments as Record<string, Record<string, unknown>>;

  for (const role of REQUIRED_COUNCIL_ROLES) {
    const assignment = assignments[role] as Record<string, unknown>;
    if (hasFallbackKeys(assignment)) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_FALLBACK_FORBIDDEN',
        `fallback configurations are strictly forbidden on role assignment for ${role}`,
      );
    }

    const inputClasses = assignment.inputClasses;
    if (!Array.isArray(inputClasses) || !inputClasses.includes('text')) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_INPUT_CLASS_UNSUPPORTED',
        `inputClasses on role ${role} must include 'text'`,
      );
    }
    if (inputClasses.includes('audio')) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_AUDIO_UNSUPPORTED',
        `audio input is outside CP03 implementation plan on role ${role}`,
      );
    }
    if (role === 'Witness' && !inputClasses.includes('image')) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_INPUT_CLASS_UNSUPPORTED',
        'Witness role must support image input',
      );
    }
    if (role === 'Rewriter' && !inputClasses.includes('image')) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_REWRITER_IMAGE_UNSUPPORTED',
        'Rewriter role must support image input',
      );
    }
  }

  const roleCountByProvider: Record<string, number> = {};
  for (const role of REQUIRED_COUNCIL_ROLES) {
    const assignment = assignments[role] as Record<string, unknown>;
    const provider = assignment.provider as string;
    roleCountByProvider[provider] = (roleCountByProvider[provider] ?? 0) + 1;
  }
  for (const role of REQUIRED_COUNCIL_ROLES) {
    const assignment = assignments[role] as Record<string, unknown>;
    const provider = assignment.provider as string;
    const simultaneous = roleCountByProvider[provider] ?? 0;
    const maxConcurrency = assignment.maximumConcurrency;
    if (
      typeof maxConcurrency !== 'number' ||
      !Number.isInteger(maxConcurrency) ||
      maxConcurrency < simultaneous
    ) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_CONCURRENCY_INSUFFICIENT',
        `maximumConcurrency on role ${role} is ${String(maxConcurrency)}, but provider ${provider} has ${simultaneous} simultaneous roles`,
      );
    }
  }

  if (snapshot !== undefined) {
    if (snapshot.routingManifestVersion !== rawManifest.manifestVersion) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_MANIFEST_VERSION_MISMATCH',
        `snapshot manifest version ${snapshot.routingManifestVersion} does not match manifest version ${String(rawManifest.manifestVersion)}`,
      );
    }
    if (snapshot.inputRefs?.some((ref) => ref.inputClass === 'audio')) {
      throw new CouncilRoutingError(
        'COUNCIL_ROUTING_AUDIO_UNSUPPORTED',
        'audio input in snapshot is unsupported',
      );
    }
    const hasImageRef = snapshot.inputRefs?.some((ref) => ref.inputClass === 'image') ?? false;
    if (hasImageRef) {
      const witnessAssignment = assignments.Witness as Record<string, unknown>;
      const witnessClasses = witnessAssignment.inputClasses as readonly string[];
      if (!witnessClasses.includes('image')) {
        throw new CouncilRoutingError(
          'COUNCIL_ROUTING_SNAPSHOT_INPUT_UNSUPPORTED',
          'snapshot contains image inputRef but Witness assignment does not support image',
        );
      }
    }
  }

  return deepFreeze(manifest as unknown as ProviderRoutingManifest);
};

export const selectionForCouncilRole = (
  manifest: ProviderRoutingManifest,
  role: CouncilRole,
): ProviderRoutingAssignment => {
  const assignment = manifest?.assignments?.[role];
  if (!isRecord(assignment)) {
    throw new CouncilRoutingError(
      'COUNCIL_ROUTING_ROLE_MISSING',
      `no routing assignment for role ${role}`,
    );
  }
  return deepFreeze(assignment);
};
