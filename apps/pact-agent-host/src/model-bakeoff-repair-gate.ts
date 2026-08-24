import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

export const MODEL_BAKEOFF_REPAIR_BANNER =
  'LOCAL SCRIPTED REPAIR — PROVIDER UNVERIFIED — NO PREFLIGHT — NO REPLACEMENT RUN' as const;

export interface ModelBakeoffRepairAssertionSelector {
  readonly file: string;
  readonly title: string;
}

export interface ModelBakeoffRepairCheckDefinition {
  readonly id: string;
  readonly label: string;
  readonly evidence: readonly ModelBakeoffRepairAssertionSelector[];
}

const evidence = (
  file: string,
  ...titles: readonly string[]
): readonly ModelBakeoffRepairAssertionSelector[] => titles.map((title) => ({ file, title }));

export const MODEL_BAKEOFF_REPAIR_CHECKS = Object.freeze([
  {
    id: 'canonical-role-binding',
    label: 'Direct role submission binds into one canonical shard',
    evidence: evidence(
      'test/council-submission-binding.test.ts',
      'binds deterministic canonical shard identity without changing agent content',
    ),
  },
  {
    id: 'wrapper-rejection',
    label: 'Wrapper-shaped tool input is rejected without repair',
    evidence: evidence(
      'test/council-submission-binding.test.ts',
      'rejects wrappers, model-authored runtime fields, role-content forgery, and stale turns',
    ),
  },
  {
    id: 'runtime-schema-rejection',
    label: 'Model-authored runtime schema and version fields are rejected',
    evidence: evidence(
      'test/council-submission-binding.test.ts',
      'rejects wrappers, model-authored runtime fields, role-content forgery, and stale turns',
    ),
  },
  {
    id: 'unknown-reference-rejection',
    label: 'Unknown rights, registry, capability, object, and evidence references fail closed',
    evidence: [
      ...evidence(
        'test/council-reference-validation.test.ts',
        'rejects unknown Witness and Archivist references before durability',
        'rejects unregistered capability, object, affordance, and effect references',
        'rejects unknown Guardian registries before durability and cross-shard evidence later',
      ),
    ],
  },
  {
    id: 'known-reference-identity',
    label: 'Known references are accepted without mapping or mutation',
    evidence: evidence(
      'test/council-reference-validation.test.ts',
      'accepts every known reference without changing a shard',
    ),
  },
  {
    id: 'phase-request-policy',
    label: 'Conductor intent and commit use 1024 and 512 token caps in one session',
    evidence: [
      ...evidence(
        'test/model-bakeoff-execution-policy.test.ts',
        'freezes the exact phase, model, contract, and evidence policy behind one hash',
      ),
      ...evidence(
        'test/model-bakeoff-dsh-transport.test.ts',
        'uses each phase cap on the persistent CaseConductor session',
      ),
    ],
  },
  {
    id: 'gemini-low-local-serialization',
    label: 'Gemini 3.7 LOW serializes through an intercepted in-process HTTP seam',
    evidence: evidence(
      'test/model-bakeoff-dsh-transport.test.ts',
      'serializes Gemini 3.7 LOW through an in-process HTTP intercept only',
    ),
  },
  {
    id: 'terminal-provider-error',
    label: 'Terminal HTTP 400 finish remains a non-retryable provider error',
    evidence: [
      ...evidence(
        'test/model-bakeoff-dsh-transport.test.ts',
        'classifies a terminal HTTP 400 finish as a non-retryable provider error',
      ),
      ...evidence(
        'test/model-bakeoff-runner.test.ts',
        'never retries a provider error',
      ),
    ],
  },
  {
    id: 'max-tokens-no-tool',
    label: 'Max-token finish without a tool is a stable content failure',
    evidence: evidence(
      'test/model-bakeoff-dsh-transport.test.ts',
      'classifies a max-token stop without a tool as content failure',
    ),
  },
  {
    id: 'hard-timeout',
    label: 'Local hard timeout is classified late and never retried',
    evidence: [
      ...evidence(
        'test/model-bakeoff-dsh-transport.test.ts',
        'classifies the local hard deadline as late without waiting for a provider finish',
      ),
      ...evidence(
        'test/model-bakeoff-runner.test.ts',
        'never retries a late result',
      ),
    ],
  },
  {
    id: 'first-tool-result-one-shot',
    label: 'First invalid expected tool result ends the attempt after one stream',
    evidence: evidence(
      'test/model-bakeoff-dsh-transport.test.ts',
      'stops after the first rejected expected tool result',
    ),
  },
  {
    id: 'reference-invalid-before-durability',
    label: 'Canonical-schema-valid but reference-invalid output fails before durability',
    evidence: evidence(
      'test/model-bakeoff-dsh-transport.test.ts',
      'does not technically accept schema-valid but unregistered Archivist references',
    ),
  },
  {
    id: 'pair-local-eligibility',
    label: 'Affected replacement pair fails without erasing an unrelated complete pair',
    evidence: evidence(
      'test/model-bakeoff-evidence.test.ts',
      'keeps a complete replacement-policy Witness pair eligible when an unrelated Guardian case fails',
    ),
  },
  {
    id: 'legacy-archive-identity',
    label: 'Committed Task 8 archive retains its legacy report and evidence hash',
    evidence: evidence(
      'test/model-bakeoff-evidence.test.ts',
      'reverifies the committed Task 8 archive without changing its legacy result or hash',
    ),
  },
  {
    id: 'synthetic-secret-scan',
    label: 'Synthetic archive and DSH evidence pass forbidden-content and exact-secret scans',
    evidence: [
      ...evidence(
        'test/model-bakeoff-dsh-transport.test.ts',
        'persists DSH JSONL without leaking configured paths or credential sentinels into evidence',
      ),
      ...evidence(
        'test/model-bakeoff-evidence.test.ts',
        'verifies every bound fact while preserving the Stage B timing ceiling',
      ),
    ],
  },
  {
    id: 'zero-external-side-effects',
    label: 'Provider, Keychain, network, preflight, and run counters are all zero',
    evidence: [],
  },
] as const satisfies readonly ModelBakeoffRepairCheckDefinition[]);

export const MODEL_BAKEOFF_REPAIR_TEST_FILES = Object.freeze([
  'test/council-submission-binding.test.ts',
  'test/council-reference-validation.test.ts',
  'test/model-bakeoff-execution-policy.test.ts',
  'test/model-bakeoff-dsh-transport.test.ts',
  'test/model-bakeoff-runner.test.ts',
  'test/model-bakeoff-evidence.test.ts',
] as const);

export interface ModelBakeoffRepairAssertionResult
  extends ModelBakeoffRepairAssertionSelector {
  readonly status: 'passed' | 'failed';
}

export interface ModelBakeoffRepairCounters {
  readonly providerRequestsMade: number;
  readonly keychainReads: number;
  readonly externalNetworkRequests: number;
  readonly preflightsCreated: number;
  readonly runsStarted: number;
}

export interface ModelBakeoffRepairGateReport extends ModelBakeoffRepairCounters {
  readonly schemaVersion: 'cp03-stage-b-replacement-repair-gate/0.1';
  readonly mode: 'local-scripted';
  readonly status: 'PASS' | 'FAIL';
  readonly banner: typeof MODEL_BAKEOFF_REPAIR_BANNER;
  readonly checks: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: 'PASS' | 'FAIL';
    readonly evidence: readonly ModelBakeoffRepairAssertionSelector[];
  }[];
  readonly providerCompatibilityProven: false;
  readonly repairGateSha256: string;
}

const canonicalHash = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

const assertionKey = (assertion: ModelBakeoffRepairAssertionSelector): string =>
  `${assertion.file}\u0000${assertion.title}`;

const countersValid = (counters: ModelBakeoffRepairCounters): boolean =>
  Object.values(counters).every((value) => Number.isInteger(value) && value >= 0);

export function createModelBakeoffRepairGateReport(input: {
  readonly mode: 'local-scripted';
  readonly assertions: readonly ModelBakeoffRepairAssertionResult[];
  readonly counters: ModelBakeoffRepairCounters;
}): ModelBakeoffRepairGateReport {
  if (input.mode !== 'local-scripted') {
    throw new Error('MODEL_BAKEOFF_REPAIR_GATE_MODE_INVALID');
  }
  if (!countersValid(input.counters)) {
    throw new Error('MODEL_BAKEOFF_REPAIR_GATE_COUNTER_INVALID');
  }
  const assertionStatuses = new Map<string, ('passed' | 'failed')[]>();
  for (const assertion of input.assertions) {
    const key = assertionKey(assertion);
    const statuses = assertionStatuses.get(key) ?? [];
    statuses.push(assertion.status);
    assertionStatuses.set(key, statuses);
  }
  const zeroCounters = Object.values(input.counters).every((value) => value === 0);
  const checks = MODEL_BAKEOFF_REPAIR_CHECKS.map((definition) => {
    const passed = definition.id === 'zero-external-side-effects'
      ? zeroCounters
      : definition.evidence.every((selector) => {
        const statuses = assertionStatuses.get(assertionKey(selector));
        return statuses !== undefined
          && statuses.length > 0
          && statuses.every((status) => status === 'passed');
      });
    return {
      id: definition.id,
      label: definition.label,
      status: passed ? 'PASS' as const : 'FAIL' as const,
      evidence: definition.evidence.map((selector) => ({ ...selector })),
    };
  });
  const unsigned = {
    schemaVersion: 'cp03-stage-b-replacement-repair-gate/0.1' as const,
    mode: input.mode,
    status: checks.every(({ status }) => status === 'PASS')
      ? 'PASS' as const
      : 'FAIL' as const,
    banner: MODEL_BAKEOFF_REPAIR_BANNER,
    checks,
    ...input.counters,
    providerCompatibilityProven: false as const,
  };
  return Object.freeze({
    ...unsigned,
    repairGateSha256: canonicalHash(unsigned),
  });
}
