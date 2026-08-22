export type CaseAction =
  | 'Translate'
  | 'Reframe'
  | 'Merge'
  | 'Continue'
  | 'KeepOpaque';

export type CaseSessionMode =
  | 'checkpoint'
  | 'public_ephemeral'
  | 'consented_archive';

export type CaseSessionStatus =
  | 'OPEN'
  | 'TERMINAL'
  | 'FAILED_NO_MUTATION';

export interface CaseSessionInitialState {
  readonly caseSessionId: string;
  readonly mode: CaseSessionMode;
  readonly rootDshSessionId: string;
  readonly initialSceneHash: string;
}

export interface CaseSessionStateSummary {
  readonly status: CaseSessionStatus;
  readonly currentSceneHash: string;
  readonly accumulatedActions: readonly ('Translate' | 'Reframe' | 'Merge')[];
  readonly terminalAction: 'Continue' | 'KeepOpaque' | null;
}

export interface CaseSessionTransitionRecord {
  readonly kind:
    | 'APPROVED_EXECUTION'
    | 'FAILED_NO_MUTATION'
    | 'LOCAL_KEEP_OPAQUE'
    | 'CHECKPOINT_RESET';
  readonly caseSessionId: string;
  readonly rootDshSessionId: string;
  readonly turnId: string | null;
  readonly resetId: string | null;
  readonly actionSequence: readonly CaseAction[];
  readonly draftHash: string | null;
  readonly approvalId: string | null;
  readonly receiptId: string | null;
  readonly parentSceneHash: string;
  readonly resultSceneHash: string;
  readonly providerRequestsMade: number | null;
  readonly reasonCode: string | null;
  readonly recordedAt: string;
}

export interface CaseSessionTransition extends CaseSessionTransitionRecord {
  readonly postState: CaseSessionStateSummary;
}

export interface CaseSessionSnapshot extends CaseSessionStateSummary {
  readonly schemaVersion: 'cp03-case-session/0.1';
  readonly caseSessionId: string;
  readonly mode: CaseSessionMode;
  readonly rootDshSessionId: string;
  readonly initialSceneHash: string;
  readonly transitions: readonly CaseSessionTransitionRecord[];
}

export interface ApprovedExecutionInput {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly draftHash: string;
  readonly approvalId: string;
  readonly receiptId: string;
  readonly parentSceneHash: string;
  readonly resultSceneHash: string;
  readonly actionSequence: readonly CaseAction[];
  readonly settledAt: string;
}

export interface FailureNoMutationInput {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly observedSceneHash: string;
  readonly reasonCode: string;
  readonly providerRequestsMade: number;
  readonly recordedAt: string;
}

export interface LocalKeepOpaqueInput {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly decidedAt: string;
}

export interface CheckpointResetInput {
  readonly caseSessionId: string;
  readonly resetId: string;
  readonly restoredSceneHash: string;
  readonly resetAt: string;
}

type CumulativeAction = 'Translate' | 'Reframe' | 'Merge';
type TerminalAction = 'Continue' | 'KeepOpaque';

interface MutableCaseSessionState {
  schemaVersion: 'cp03-case-session/0.1';
  caseSessionId: string;
  mode: CaseSessionMode;
  rootDshSessionId: string;
  initialSceneHash: string;
  status: CaseSessionStatus;
  currentSceneHash: string;
  accumulatedActions: CumulativeAction[];
  terminalAction: TerminalAction | null;
  transitions: CaseSessionTransitionRecord[];
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UTC_ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const CASE_ACTIONS = new Set<CaseAction>([
  'Translate',
  'Reframe',
  'Merge',
  'Continue',
  'KeepOpaque',
]);
const CASE_SESSION_MODES = new Set<CaseSessionMode>([
  'checkpoint',
  'public_ephemeral',
  'consented_archive',
]);
const CUMULATIVE_ACTIONS = new Set<CumulativeAction>([
  'Translate',
  'Reframe',
  'Merge',
]);
const TERMINAL_ACTIONS = new Set<TerminalAction>([
  'Continue',
  'KeepOpaque',
]);

function fail(code: string, field?: string): never {
  throw new Error(field === undefined ? code : `${code}: ${field}`);
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail('CASE_SESSION_INPUT_INVALID', field);
  }
}

function assertHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail('CASE_SESSION_INPUT_INVALID', field);
  }
}

function assertUtcTimestamp(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !UTC_ISO_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail('CASE_SESSION_INPUT_INVALID', field);
  }
}

function assertProviderRequestCount(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    fail('CASE_SESSION_INPUT_INVALID', 'providerRequestsMade');
  }
}

function validateActionSequence(
  value: unknown,
): asserts value is readonly CaseAction[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5) {
    fail('CASE_SESSION_ACTION_SEQUENCE_INVALID');
  }

  for (const action of value) {
    if (typeof action !== 'string' || !CASE_ACTIONS.has(action as CaseAction)) {
      fail('CASE_SESSION_ACTION_SEQUENCE_INVALID');
    }
  }

  for (let index = 0; index < value.length - 1; index += 1) {
    if (TERMINAL_ACTIONS.has(value[index] as TerminalAction)) {
      fail('CASE_SESSION_ACTION_SEQUENCE_INVALID');
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function frozenClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export class CaseSessionLedger {
  readonly #state: MutableCaseSessionState;
  readonly #turnIds = new Set<string>();
  readonly #resetIds = new Set<string>();

  constructor(initial: CaseSessionInitialState) {
    assertIdentifier(initial.caseSessionId, 'caseSessionId');
    assertIdentifier(initial.rootDshSessionId, 'rootDshSessionId');
    assertHash(initial.initialSceneHash, 'initialSceneHash');
    if (!CASE_SESSION_MODES.has(initial.mode)) {
      fail('CASE_SESSION_INPUT_INVALID', 'mode');
    }

    this.#state = {
      schemaVersion: 'cp03-case-session/0.1',
      caseSessionId: initial.caseSessionId,
      mode: initial.mode,
      rootDshSessionId: initial.rootDshSessionId,
      initialSceneHash: initial.initialSceneHash,
      status: 'OPEN',
      currentSceneHash: initial.initialSceneHash,
      accumulatedActions: [],
      terminalAction: null,
      transitions: [],
    };
  }

  snapshot(): CaseSessionSnapshot {
    return frozenClone(this.#state);
  }

  recordApprovedExecution(
    input: ApprovedExecutionInput,
  ): CaseSessionTransition {
    this.#assertIdentity(input.caseSessionId);
    this.#assertExecutable();
    assertIdentifier(input.turnId, 'turnId');
    assertHash(input.draftHash, 'draftHash');
    assertIdentifier(input.approvalId, 'approvalId');
    assertIdentifier(input.receiptId, 'receiptId');
    assertHash(input.parentSceneHash, 'parentSceneHash');
    assertHash(input.resultSceneHash, 'resultSceneHash');
    assertUtcTimestamp(input.settledAt, 'settledAt');
    validateActionSequence(input.actionSequence);
    this.#assertUniqueTurn(input.turnId);
    this.#assertCurrentScene(input.parentSceneHash);

    const actionSequence = [...input.actionSequence];
    const record: CaseSessionTransitionRecord = {
      kind: 'APPROVED_EXECUTION',
      caseSessionId: this.#state.caseSessionId,
      rootDshSessionId: this.#state.rootDshSessionId,
      turnId: input.turnId,
      resetId: null,
      actionSequence,
      draftHash: input.draftHash,
      approvalId: input.approvalId,
      receiptId: input.receiptId,
      parentSceneHash: input.parentSceneHash,
      resultSceneHash: input.resultSceneHash,
      providerRequestsMade: null,
      reasonCode: null,
      recordedAt: input.settledAt,
    };

    this.#state.currentSceneHash = input.resultSceneHash;
    for (const action of actionSequence) {
      if (CUMULATIVE_ACTIONS.has(action as CumulativeAction)) {
        this.#state.accumulatedActions.push(action as CumulativeAction);
      }
    }
    const lastAction = actionSequence.at(-1);
    if (TERMINAL_ACTIONS.has(lastAction as TerminalAction)) {
      this.#state.status = 'TERMINAL';
      this.#state.terminalAction = lastAction as TerminalAction;
    }

    return this.#commitTurn(record, input.turnId);
  }

  recordFailureNoMutation(
    input: FailureNoMutationInput,
  ): CaseSessionTransition {
    this.#assertIdentity(input.caseSessionId);
    this.#assertExecutable();
    assertIdentifier(input.turnId, 'turnId');
    assertHash(input.observedSceneHash, 'observedSceneHash');
    assertIdentifier(input.reasonCode, 'reasonCode');
    assertProviderRequestCount(input.providerRequestsMade);
    assertUtcTimestamp(input.recordedAt, 'recordedAt');
    this.#assertUniqueTurn(input.turnId);
    this.#assertCurrentScene(input.observedSceneHash);

    const record: CaseSessionTransitionRecord = {
      kind: 'FAILED_NO_MUTATION',
      caseSessionId: this.#state.caseSessionId,
      rootDshSessionId: this.#state.rootDshSessionId,
      turnId: input.turnId,
      resetId: null,
      actionSequence: [],
      draftHash: null,
      approvalId: null,
      receiptId: null,
      parentSceneHash: this.#state.currentSceneHash,
      resultSceneHash: this.#state.currentSceneHash,
      providerRequestsMade: input.providerRequestsMade,
      reasonCode: input.reasonCode,
      recordedAt: input.recordedAt,
    };

    this.#state.status = 'FAILED_NO_MUTATION';
    return this.#commitTurn(record, input.turnId);
  }

  recordLocalKeepOpaque(
    input: LocalKeepOpaqueInput,
  ): CaseSessionTransition {
    this.#assertIdentity(input.caseSessionId);
    if (this.#state.status === 'TERMINAL') {
      fail('CASE_SESSION_TERMINAL');
    }
    assertIdentifier(input.turnId, 'turnId');
    assertUtcTimestamp(input.decidedAt, 'decidedAt');
    this.#assertUniqueTurn(input.turnId);

    const currentSceneHash = this.#state.currentSceneHash;
    const record: CaseSessionTransitionRecord = {
      kind: 'LOCAL_KEEP_OPAQUE',
      caseSessionId: this.#state.caseSessionId,
      rootDshSessionId: this.#state.rootDshSessionId,
      turnId: input.turnId,
      resetId: null,
      actionSequence: ['KeepOpaque'],
      draftHash: null,
      approvalId: null,
      receiptId: null,
      parentSceneHash: currentSceneHash,
      resultSceneHash: currentSceneHash,
      providerRequestsMade: 0,
      reasonCode: null,
      recordedAt: input.decidedAt,
    };

    this.#state.status = 'TERMINAL';
    this.#state.terminalAction = 'KeepOpaque';
    return this.#commitTurn(record, input.turnId);
  }

  recordCheckpointReset(input: CheckpointResetInput): CaseSessionTransition {
    this.#assertIdentity(input.caseSessionId);
    assertIdentifier(input.resetId, 'resetId');
    assertHash(input.restoredSceneHash, 'restoredSceneHash');
    assertUtcTimestamp(input.resetAt, 'resetAt');
    if (this.#resetIds.has(input.resetId)) {
      fail('CASE_SESSION_RESET_DUPLICATE');
    }
    if (this.#state.status !== 'TERMINAL') {
      fail('CASE_SESSION_RESET_REQUIRES_TERMINAL');
    }
    if (input.restoredSceneHash !== this.#state.initialSceneHash) {
      fail('CASE_SESSION_RESET_HASH_INVALID');
    }

    const record: CaseSessionTransitionRecord = {
      kind: 'CHECKPOINT_RESET',
      caseSessionId: this.#state.caseSessionId,
      rootDshSessionId: this.#state.rootDshSessionId,
      turnId: null,
      resetId: input.resetId,
      actionSequence: [],
      draftHash: null,
      approvalId: null,
      receiptId: null,
      parentSceneHash: this.#state.currentSceneHash,
      resultSceneHash: input.restoredSceneHash,
      providerRequestsMade: 0,
      reasonCode: null,
      recordedAt: input.resetAt,
    };

    this.#state.currentSceneHash = input.restoredSceneHash;
    this.#resetIds.add(input.resetId);
    return this.#commit(record);
  }

  #assertIdentity(caseSessionId: string): void {
    assertIdentifier(caseSessionId, 'caseSessionId');
    if (caseSessionId !== this.#state.caseSessionId) {
      fail('CASE_SESSION_IDENTITY_MISMATCH');
    }
  }

  #assertExecutable(): void {
    if (this.#state.status === 'TERMINAL') {
      fail('CASE_SESSION_TERMINAL');
    }
    if (this.#state.status === 'FAILED_NO_MUTATION') {
      fail('CASE_SESSION_FAILED_NO_MUTATION');
    }
  }

  #assertUniqueTurn(turnId: string): void {
    if (this.#turnIds.has(turnId)) {
      fail('CASE_SESSION_TURN_DUPLICATE');
    }
  }

  #assertCurrentScene(observedSceneHash: string): void {
    if (observedSceneHash !== this.#state.currentSceneHash) {
      fail('CASE_SESSION_SCENE_PRECONDITION_STALE');
    }
  }

  #commitTurn(
    record: CaseSessionTransitionRecord,
    turnId: string,
  ): CaseSessionTransition {
    this.#turnIds.add(turnId);
    return this.#commit(record);
  }

  #commit(record: CaseSessionTransitionRecord): CaseSessionTransition {
    this.#state.transitions.push(record);
    return frozenClone({
      ...record,
      postState: this.#stateSummary(),
    });
  }

  #stateSummary(): CaseSessionStateSummary {
    return {
      status: this.#state.status,
      currentSceneHash: this.#state.currentSceneHash,
      accumulatedActions: [...this.#state.accumulatedActions],
      terminalAction: this.#state.terminalAction,
    };
  }
}
