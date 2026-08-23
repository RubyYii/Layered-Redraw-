import { describe, expect, it } from 'vitest';

import type {
  CouncilRole,
  ProviderRoutingAssignment,
  ProviderRoutingManifest,
} from '../src/contract-types.js';
import {
  COUNCIL_TIMING_LIMITS,
  type CouncilTurnSnapshot,
} from '../src/council-turn.js';
import {
  CouncilRoutingError,
  requireCouncilRoutingManifest,
  selectionForCouncilRole,
} from '../src/council-routing.js';
import {
  fullCouncilTurnInput,
  fullTurnScope,
} from './council-fixtures.js';

const validAssignment = (
  provider: 'deepseek' | 'gemini',
  role: CouncilRole,
  overrides: Partial<ProviderRoutingAssignment> = {},
): ProviderRoutingAssignment => ({
  provider,
  route: provider === 'deepseek' ? 'deepseek-official' : 'gemini-official',
  model: provider === 'deepseek'
    ? 'deepseek-model-pending-bakeoff'
    : 'gemini-model-pending-bakeoff',
  adapterPackage: provider === 'deepseek'
    ? '@deepseek-ai/dsh-llm-deepseek'
    : '@google/generative-ai',
  adapterVersion: '0.1.0-rc.6',
  promptHash: 'a'.repeat(64),
  toolProfile: 'council-v2',
  maximumConcurrency: provider === 'deepseek' ? 3 : 2,
  inputClasses: role === 'Witness' || role === 'Rewriter' ? ['text', 'image'] : ['text'],
  inputLimitTokens: 4096,
  outputLimitTokens: 2048,
  timeoutMs: 12_000,
  ...overrides,
});

const validManifest = (
  overrides: Partial<ProviderRoutingManifest> = {},
): ProviderRoutingManifest => ({
  schemaVersion: 'cp03-council-routing/0.1',
  manifestVersion: 'cp03-council-routing/manifest-0.1',
  plannedDispatches: 6,
  maximumDispatches: 8,
  assignments: {
    CaseConductor: validAssignment('deepseek', 'CaseConductor'),
    Witness: validAssignment('gemini', 'Witness'),
    Archivist: validAssignment('deepseek', 'Archivist'),
    Rewriter: validAssignment('gemini', 'Rewriter'),
    Guardian: validAssignment('deepseek', 'Guardian'),
  },
  ...overrides,
});

const validSnapshot = (): CouncilTurnSnapshot => ({
  schemaVersion: 'cp03-council-turn/0.1',
  caseSessionId: fullCouncilTurnInput.caseSessionId,
  turnId: fullCouncilTurnInput.turnId,
  parentSceneHash: fullCouncilTurnInput.parentSceneHash,
  sourceLockIds: fullCouncilTurnInput.sourceLockIds,
  inputRefs: fullCouncilTurnInput.inputRefs,
  registryVersion: fullCouncilTurnInput.registryVersion,
  registeredAssetIds: fullCouncilTurnInput.registeredAssetIds,
  registeredSpatialBridgeIds: fullCouncilTurnInput.registeredSpatialBridgeIds,
  registeredSceneObjectIds: fullCouncilTurnInput.registeredSceneObjectIds,
  registeredAffordanceIds: fullCouncilTurnInput.registeredAffordanceIds,
  registeredRightsIds: fullCouncilTurnInput.registeredRightsIds,
  supportedRollbackCapabilityIds: fullCouncilTurnInput.supportedRollbackCapabilityIds,
  allowedSemanticCapabilityIds: fullCouncilTurnInput.allowedSemanticCapabilityIds,
  caseActionState: fullCouncilTurnInput.caseActionState,
  turnScope: fullTurnScope,
  requiredRoles: ['CaseConductor', 'Witness', 'Archivist', 'Rewriter', 'Guardian'],
  routingManifestVersion: 'cp03-council-routing/manifest-0.1',
  deadlineId: fullCouncilTurnInput.deadlineId,
  deadlineMs: COUNCIL_TIMING_LIMITS.hardDeadlineMs,
});

describe('council routing manifest validation', () => {
  it('accepts a canonical dual-provider routing manifest', () => {
    const manifest = validManifest();
    const result = requireCouncilRoutingManifest(manifest);
    expect(result).toEqual(manifest);
  });

  it('accepts a valid manifest together with a matching turn snapshot', () => {
    const manifest = validManifest();
    const snapshot = validSnapshot();
    const result = requireCouncilRoutingManifest(manifest, snapshot);
    expect(result).toEqual(manifest);
  });

  it('rejects an invalid schema version', () => {
    const manifest = {
      ...validManifest(),
      schemaVersion: 'cp03-council-routing/0.2',
    };
    expect(() => requireCouncilRoutingManifest(manifest)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_SCHEMA_VERSION_INVALID',
      }),
    );
  });

  it('rejects a non-object or malformed manifest', () => {
    expect(() => requireCouncilRoutingManifest(null)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_MANIFEST_INVALID',
      }),
    );
    expect(() => requireCouncilRoutingManifest('invalid')).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_MANIFEST_INVALID',
      }),
    );
  });

  it('rejects when the provider set is not exactly {deepseek, gemini}', () => {
    const allDeepSeek = validManifest({
      assignments: {
        CaseConductor: validAssignment('deepseek', 'CaseConductor'),
        Witness: validAssignment('deepseek', 'Witness'),
        Archivist: validAssignment('deepseek', 'Archivist'),
        Rewriter: validAssignment('deepseek', 'Rewriter'),
        Guardian: validAssignment('deepseek', 'Guardian'),
      },
    });
    expect(() => requireCouncilRoutingManifest(allDeepSeek)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_PROVIDER_SET_INVALID',
      }),
    );

    const thirdProvider = validManifest({
      assignments: {
        ...validManifest().assignments,
        Guardian: {
          ...validAssignment('deepseek', 'Guardian'),
          provider: 'anthropic' as unknown as 'deepseek',
        },
      },
    });
    expect(() => requireCouncilRoutingManifest(thirdProvider)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_PROVIDER_SET_INVALID',
      }),
    );
  });

  it('rejects when any of the five required roles is missing', () => {
    const { Guardian: _guardian, ...withoutGuardian } = validManifest().assignments;
    const manifest = {
      ...validManifest(),
      assignments: withoutGuardian,
    };
    expect(() => requireCouncilRoutingManifest(manifest)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_ROLE_MISSING',
      }),
    );
  });

  it('rejects planned/maximum dispatches not equal to 6/8', () => {
    const invalidPlanned = { ...validManifest(), plannedDispatches: 5 };
    expect(() => requireCouncilRoutingManifest(invalidPlanned)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_DISPATCH_COUNT_INVALID',
      }),
    );

    const invalidMax = { ...validManifest(), maximumDispatches: 10 };
    expect(() => requireCouncilRoutingManifest(invalidMax)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_DISPATCH_COUNT_INVALID',
      }),
    );
  });

  it('rejects empty CaseConductor route or model', () => {
    const emptyRoute = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', { route: '' }),
      },
    });
    expect(() => requireCouncilRoutingManifest(emptyRoute)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_CONDUCTOR_ROUTE_INVALID',
      }),
    );

    const emptyModel = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', { model: '' }),
      },
    });
    expect(() => requireCouncilRoutingManifest(emptyModel)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_CONDUCTOR_ROUTE_INVALID',
      }),
    );
  });

  it('rejects when Witness does not support image input', () => {
    const noImageWitness = validManifest({
      assignments: {
        ...validManifest().assignments,
        Witness: validAssignment('gemini', 'Witness', { inputClasses: ['text'] }),
      },
    });
    expect(() => requireCouncilRoutingManifest(noImageWitness)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_INPUT_CLASS_UNSUPPORTED',
      }),
    );
  });

  it('rejects when Rewriter does not support image input', () => {
    const noImageRewriter = validManifest({
      assignments: {
        ...validManifest().assignments,
        Rewriter: validAssignment('gemini', 'Rewriter', { inputClasses: ['text'] }),
      },
    });
    expect(() => requireCouncilRoutingManifest(noImageRewriter)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_REWRITER_IMAGE_UNSUPPORTED',
      }),
    );
  });

  it('rejects when audio input class is assigned to any role', () => {
    const audioAssignment = validManifest({
      assignments: {
        ...validManifest().assignments,
        Witness: validAssignment('gemini', 'Witness', {
          inputClasses: ['text', 'image', 'audio'],
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(audioAssignment)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_AUDIO_UNSUPPORTED',
      }),
    );
  });

  it('rejects when snapshot contains audio inputRef', () => {
    const manifest = validManifest();
    const snapshotWithAudio: CouncilTurnSnapshot = {
      ...validSnapshot(),
      inputRefs: [
        { refId: 'input_audio01', inputClass: 'audio' },
      ],
    };
    expect(() => requireCouncilRoutingManifest(manifest, snapshotWithAudio)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_AUDIO_UNSUPPORTED',
      }),
    );
  });

  it('rejects when snapshot manifestVersion does not match manifest manifestVersion', () => {
    const manifest = validManifest();
    const snapshotMismatch: CouncilTurnSnapshot = {
      ...validSnapshot(),
      routingManifestVersion: 'cp03-council-routing/manifest-other',
    };
    expect(() => requireCouncilRoutingManifest(manifest, snapshotMismatch)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_MANIFEST_VERSION_MISMATCH',
      }),
    );
  });

  it('rejects a prompt hash that is not 64 lowercase hex characters', () => {
    const upperHex = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          promptHash: 'A'.repeat(64),
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(upperHex)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_PROMPT_HASH_INVALID',
      }),
    );

    const shortHex = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          promptHash: 'a'.repeat(32),
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(shortHex)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_PROMPT_HASH_INVALID',
      }),
    );
  });

  it('rejects invalid toolProfile, token limits, or timeout', () => {
    const badToolProfile = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          toolProfile: 'unknown' as unknown as 'council-v2',
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(badToolProfile)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_TOOL_PROFILE_INVALID',
      }),
    );

    const nonPositiveTokens = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          inputLimitTokens: 0,
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(nonPositiveTokens)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_LIMITS_INVALID',
      }),
    );

    const excessiveTimeout = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          timeoutMs: 15_000,
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(excessiveTimeout)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_TIMEOUT_OUT_OF_BOUNDS',
      }),
    );
  });

  it('rejects insufficient maximumConcurrency for simultaneous roles', () => {
    // DeepSeek has 3 simultaneous roles (Conductor, Archivist, Guardian), so concurrency must be >= 3
    const lowDeepSeekConcurrency = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          maximumConcurrency: 2,
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(lowDeepSeekConcurrency)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_CONCURRENCY_INSUFFICIENT',
      }),
    );

    // Gemini has 2 simultaneous roles (Witness, Rewriter), so concurrency must be >= 2
    const lowGeminiConcurrency = validManifest({
      assignments: {
        ...validManifest().assignments,
        Witness: validAssignment('gemini', 'Witness', {
          maximumConcurrency: 1,
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(lowGeminiConcurrency)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_CONCURRENCY_INSUFFICIENT',
      }),
    );
  });

  it('rejects fallback lists at manifest root or inside assignments', () => {
    const rootFallback = {
      ...validManifest(),
      fallbackRoutes: ['gemini-fallback'],
    };
    expect(() => requireCouncilRoutingManifest(rootFallback)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_FALLBACK_FORBIDDEN',
      }),
    );

    const assignmentFallback = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: {
          ...validAssignment('deepseek', 'CaseConductor'),
          fallbackModel: 'deepseek-chat-v3',
        } as unknown as ProviderRoutingAssignment,
      },
    });
    expect(() => requireCouncilRoutingManifest(assignmentFallback)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_FALLBACK_FORBIDDEN',
      }),
    );
  });

  it('rejects contract-invalid manifest with extra properties or invalid adapter version', () => {
    const extraPropertyManifest = {
      ...validManifest(),
      extraProperty: 'not_allowed_by_contracts_schema',
    };
    expect(() => requireCouncilRoutingManifest(extraPropertyManifest)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_MANIFEST_INVALID',
      }),
    );

    const invalidAdapterVersionManifest = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          adapterVersion: 'not-valid-semver',
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(invalidAdapterVersionManifest)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_MANIFEST_INVALID',
      }),
    );

    const invalidRouteFamily = validManifest({
      assignments: {
        ...validManifest().assignments,
        CaseConductor: validAssignment('deepseek', 'CaseConductor', {
          route: 'gemini-custom-route',
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(invalidRouteFamily)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_MANIFEST_INVALID',
      }),
    );

    const duplicateInputClasses = validManifest({
      assignments: {
        ...validManifest().assignments,
        Witness: validAssignment('gemini', 'Witness', {
          inputClasses: ['text', 'text'] as unknown as ['text', 'image'],
        }),
      },
    });
    expect(() => requireCouncilRoutingManifest(duplicateInputClasses)).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_MANIFEST_INVALID',
      }),
    );
  });

  it('returns a deeply frozen manifest representation including assignments and inputClasses', () => {
    const manifest = validManifest();
    const result = requireCouncilRoutingManifest(manifest);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.assignments)).toBe(true);
    expect(Object.isFrozen(result.assignments.Witness)).toBe(true);
    expect(Object.isFrozen(result.assignments.Witness.inputClasses)).toBe(true);
  });
});

describe('selectionForCouncilRole', () => {
  it('returns the frozen assignment for each role', () => {
    const manifest = validManifest();
    expect(selectionForCouncilRole(manifest, 'CaseConductor')).toEqual(
      manifest.assignments.CaseConductor,
    );
    expect(selectionForCouncilRole(manifest, 'Witness')).toEqual(
      manifest.assignments.Witness,
    );
    expect(selectionForCouncilRole(manifest, 'Archivist')).toEqual(
      manifest.assignments.Archivist,
    );
    expect(selectionForCouncilRole(manifest, 'Rewriter')).toEqual(
      manifest.assignments.Rewriter,
    );
    expect(selectionForCouncilRole(manifest, 'Guardian')).toEqual(
      manifest.assignments.Guardian,
    );
    const assignment = selectionForCouncilRole(manifest, 'Witness');
    expect(Object.isFrozen(assignment)).toBe(true);
    expect(Object.isFrozen(assignment.inputClasses)).toBe(true);
  });

  it('throws COUNCIL_ROUTING_ROLE_MISSING for an unassigned role', () => {
    const { Guardian: _guardian, ...withoutGuardian } = validManifest().assignments;
    const manifest = {
      ...validManifest(),
      assignments: withoutGuardian,
    } as unknown as ProviderRoutingManifest;
    expect(() => selectionForCouncilRole(manifest, 'Guardian')).toThrowError(
      expect.objectContaining({
        name: 'CouncilRoutingError',
        code: 'COUNCIL_ROUTING_ROLE_MISSING',
      }),
    );
  });
});
