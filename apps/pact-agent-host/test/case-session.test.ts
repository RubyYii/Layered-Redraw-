import { describe, expect, test } from 'vitest';

import {
  CaseSessionLedger,
  type ApprovedExecutionInput,
  type CaseAction,
  type CaseSessionInitialState,
  type LocalKeepOpaqueInput,
} from '../src/case-session.js';

const INITIAL_HASH = 'a'.repeat(64);

function createLedger(
  overrides: Partial<CaseSessionInitialState> = {},
): CaseSessionLedger {
  return new CaseSessionLedger({
    caseSessionId: 'case_default01',
    mode: 'checkpoint',
    rootDshSessionId: 'root_default01',
    initialSceneHash: INITIAL_HASH,
    ...overrides,
  });
}

function approvedTurn(
  overrides: Partial<ApprovedExecutionInput> = {},
): ApprovedExecutionInput {
  return {
    caseSessionId: 'case_default01',
    turnId: 'turn_default01',
    draftHash: 'b'.repeat(64),
    approvalId: 'approval_default01',
    receiptId: 'receipt_default01',
    parentSceneHash: INITIAL_HASH,
    resultSceneHash: 'c'.repeat(64),
    actionSequence: ['Translate'],
    settledAt: '2026-08-22T20:00:01.000Z',
    ...overrides,
  };
}

describe('CaseSessionLedger construction and accumulation', () => {
  test('starts open and preserves three cumulative approved actions', () => {
    const ledger = createLedger({
      caseSessionId: 'case_accumulation01',
      rootDshSessionId: 'case_accumulation01',
    });

    expect(ledger.snapshot()).toMatchObject({
      schemaVersion: 'cp03-case-session/0.1',
      status: 'OPEN',
      currentSceneHash: INITIAL_HASH,
      accumulatedActions: [],
      terminalAction: null,
      transitions: [],
    });

    ledger.recordApprovedExecution({
      caseSessionId: 'case_accumulation01',
      turnId: 'turn_translate01',
      draftHash: 'b'.repeat(64),
      approvalId: 'approval_translate01',
      receiptId: 'receipt_translate01',
      parentSceneHash: INITIAL_HASH,
      resultSceneHash: 'c'.repeat(64),
      actionSequence: ['Translate'],
      settledAt: '2026-08-22T20:00:01.000Z',
    });
    ledger.recordApprovedExecution({
      caseSessionId: 'case_accumulation01',
      turnId: 'turn_reframe01',
      draftHash: 'd'.repeat(64),
      approvalId: 'approval_reframe01',
      receiptId: 'receipt_reframe01',
      parentSceneHash: 'c'.repeat(64),
      resultSceneHash: 'e'.repeat(64),
      actionSequence: ['Reframe'],
      settledAt: '2026-08-22T20:00:02.000Z',
    });
    ledger.recordApprovedExecution({
      caseSessionId: 'case_accumulation01',
      turnId: 'turn_merge01',
      draftHash: 'f'.repeat(64),
      approvalId: 'approval_merge01',
      receiptId: 'receipt_merge01',
      parentSceneHash: 'e'.repeat(64),
      resultSceneHash: '1'.repeat(64),
      actionSequence: ['Merge'],
      settledAt: '2026-08-22T20:00:03.000Z',
    });

    const snapshot = ledger.snapshot();
    expect(snapshot).toMatchObject({
      status: 'OPEN',
      currentSceneHash: '1'.repeat(64),
      accumulatedActions: ['Translate', 'Reframe', 'Merge'],
      terminalAction: null,
    });
    expect(snapshot.transitions).toHaveLength(3);
    expect(snapshot.transitions.map((transition) => transition.turnId)).toEqual([
      'turn_translate01',
      'turn_reframe01',
      'turn_merge01',
    ]);
    expect(snapshot.transitions[0]).not.toHaveProperty('postState');
  });

  test('preserves repeated cumulative action labels across turns', () => {
    const ledger = createLedger();
    ledger.recordApprovedExecution(approvedTurn());
    ledger.recordApprovedExecution(
      approvedTurn({
        turnId: 'turn_default02',
        draftHash: 'd'.repeat(64),
        approvalId: 'approval_default02',
        receiptId: 'receipt_default02',
        parentSceneHash: 'c'.repeat(64),
        resultSceneHash: 'e'.repeat(64),
      }),
    );

    expect(ledger.snapshot().accumulatedActions).toEqual([
      'Translate',
      'Translate',
    ]);
  });
});

describe('CaseSessionLedger authority and input validation', () => {
  test('rejects identity mismatch, stale scene, invalid terminal order and duplicate turn', () => {
    const ledger = createLedger();
    const nextTurn = approvedTurn();

    expect(() =>
      ledger.recordApprovedExecution({
        ...nextTurn,
        caseSessionId: 'case_other01',
      }),
    ).toThrow(/CASE_SESSION_IDENTITY_MISMATCH/);
    expect(() =>
      ledger.recordApprovedExecution({
        ...nextTurn,
        parentSceneHash: '9'.repeat(64),
      }),
    ).toThrow(/CASE_SESSION_SCENE_PRECONDITION_STALE/);
    expect(() =>
      ledger.recordApprovedExecution({
        ...nextTurn,
        actionSequence: ['Continue', 'Reframe'],
      }),
    ).toThrow(/CASE_SESSION_ACTION_SEQUENCE_INVALID/);

    ledger.recordApprovedExecution(nextTurn);
    expect(() =>
      ledger.recordApprovedExecution({
        ...nextTurn,
        parentSceneHash: 'c'.repeat(64),
        resultSceneHash: 'd'.repeat(64),
      }),
    ).toThrow(/CASE_SESSION_TURN_DUPLICATE/);
  });

  test.each([
    ['blank caseSessionId', { caseSessionId: '' }],
    ['blank rootDshSessionId', { rootDshSessionId: '' }],
    ['invalid mode', { mode: 'archived' }],
    ['short initial hash', { initialSceneHash: 'a'.repeat(63) }],
    ['uppercase initial hash', { initialSceneHash: 'A'.repeat(64) }],
  ])('rejects invalid initial state: %s', (_label, overrides) => {
    expect(() =>
      createLedger(overrides as Partial<CaseSessionInitialState>),
    ).toThrow(/CASE_SESSION_INPUT_INVALID/);
  });

  test.each([
    ['blank caseSessionId', { caseSessionId: '' }],
    ['blank turnId', { turnId: '' }],
    ['blank approvalId', { approvalId: '' }],
    ['blank receiptId', { receiptId: '' }],
    ['short draft hash', { draftHash: 'b'.repeat(63) }],
    ['uppercase parent hash', { parentSceneHash: 'A'.repeat(64) }],
    ['non-UTC timestamp', { settledAt: '2026-08-22T20:00:01+01:00' }],
    ['invalid timestamp', { settledAt: 'not-a-time' }],
  ])('rejects invalid approved input: %s', (_label, overrides) => {
    expect(() =>
      createLedger().recordApprovedExecution(approvedTurn(overrides)),
    ).toThrow(/CASE_SESSION_INPUT_INVALID/);
  });

  test('rejects unknown, empty and over-budget action sequences', () => {
    const ledger = createLedger();

    expect(() =>
      ledger.recordApprovedExecution(
        approvedTurn({ actionSequence: [] }),
      ),
    ).toThrow(/CASE_SESSION_ACTION_SEQUENCE_INVALID/);
    expect(() =>
      ledger.recordApprovedExecution(
        approvedTurn({ actionSequence: ['Erase' as CaseAction] }),
      ),
    ).toThrow(/CASE_SESSION_ACTION_SEQUENCE_INVALID/);
    expect(() =>
      ledger.recordApprovedExecution(
        approvedTurn({
          actionSequence: [
            'Translate',
            'Reframe',
            'Merge',
            'Translate',
            'Reframe',
            'Merge',
          ],
        }),
      ),
    ).toThrow(/CASE_SESSION_ACTION_SEQUENCE_INVALID/);
  });

  test('returns detached, deeply frozen snapshots and transitions', () => {
    const ledger = createLedger();
    const transition = ledger.recordApprovedExecution(approvedTurn());
    const snapshot = ledger.snapshot();

    expect(Object.isFrozen(transition)).toBe(true);
    expect(Object.isFrozen(transition.actionSequence)).toBe(true);
    expect(Object.isFrozen(transition.postState)).toBe(true);
    expect(Object.isFrozen(transition.postState.accumulatedActions)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.transitions)).toBe(true);
    expect(Object.isFrozen(snapshot.transitions[0])).toBe(true);

    expect(() =>
      (transition.actionSequence as CaseAction[]).push('Merge'),
    ).toThrow(TypeError);
    expect(() =>
      (snapshot.accumulatedActions as CaseAction[]).push('Merge'),
    ).toThrow(TypeError);
    expect(() => {
      (snapshot.transitions[0] as { resultSceneHash: string }).resultSceneHash =
        '9'.repeat(64);
    }).toThrow(TypeError);

    expect(ledger.snapshot()).toMatchObject({
      currentSceneHash: 'c'.repeat(64),
      accumulatedActions: ['Translate'],
    });
  });
});

describe('CaseSessionLedger terminal, failure and reset mechanics', () => {
  test('makes an approved Continue terminal and rejects later mutation', () => {
    const ledger = createLedger();
    const terminal = ledger.recordApprovedExecution(
      approvedTurn({ actionSequence: ['Translate', 'Continue'] }),
    );

    expect(terminal.postState).toMatchObject({
      status: 'TERMINAL',
      accumulatedActions: ['Translate'],
      terminalAction: 'Continue',
    });
    expect(() =>
      ledger.recordApprovedExecution(
        approvedTurn({
          turnId: 'turn_later01',
          parentSceneHash: 'c'.repeat(64),
        }),
      ),
    ).toThrow(/CASE_SESSION_TERMINAL/);
  });

  test('makes an agent-approved KeepOpaque terminal', () => {
    const ledger = createLedger();
    const terminal = ledger.recordApprovedExecution(
      approvedTurn({ actionSequence: ['KeepOpaque'] }),
    );

    expect(terminal).toMatchObject({
      kind: 'APPROVED_EXECUTION',
      providerRequestsMade: null,
      actionSequence: ['KeepOpaque'],
      postState: {
        status: 'TERMINAL',
        terminalAction: 'KeepOpaque',
      },
    });
  });

  test('records explicit local KeepOpaque without provider work or scene mutation', () => {
    const ledger = createLedger({ caseSessionId: 'case_stop01' });
    const stopped = ledger.recordLocalKeepOpaque({
      caseSessionId: 'case_stop01',
      turnId: 'turn_stop01',
      decidedAt: '2026-08-22T20:01:00.000Z',
    });

    expect(stopped).toMatchObject({
      kind: 'LOCAL_KEEP_OPAQUE',
      turnId: 'turn_stop01',
      actionSequence: ['KeepOpaque'],
      draftHash: null,
      approvalId: null,
      receiptId: null,
      providerRequestsMade: 0,
      parentSceneHash: INITIAL_HASH,
      resultSceneHash: INITIAL_HASH,
      postState: {
        status: 'TERMINAL',
        terminalAction: 'KeepOpaque',
      },
    });
    expect(ledger.snapshot().currentSceneHash).toBe(INITIAL_HASH);
    expect(() =>
      ledger.recordLocalKeepOpaque({
        caseSessionId: 'case_stop01',
        turnId: 'turn_stop02',
        decidedAt: '2026-08-22T20:01:01.000Z',
      }),
    ).toThrow(/CASE_SESSION_TERMINAL/);
  });

  test('records failure without mutation and permits only a new-turn local stop', () => {
    const ledger = createLedger({ caseSessionId: 'case_failure01' });
    const failed = ledger.recordFailureNoMutation({
      caseSessionId: 'case_failure01',
      turnId: 'turn_failure01',
      observedSceneHash: INITIAL_HASH,
      reasonCode: 'CONDUCTOR_UNAVAILABLE',
      providerRequestsMade: 1,
      recordedAt: '2026-08-22T20:02:00.000Z',
    });

    expect(failed).toMatchObject({
      kind: 'FAILED_NO_MUTATION',
      parentSceneHash: INITIAL_HASH,
      resultSceneHash: INITIAL_HASH,
      providerRequestsMade: 1,
      reasonCode: 'CONDUCTOR_UNAVAILABLE',
      postState: { status: 'FAILED_NO_MUTATION' },
    });
    expect(() =>
      ledger.recordApprovedExecution(
        approvedTurn({
          caseSessionId: 'case_failure01',
          turnId: 'turn_later01',
        }),
      ),
    ).toThrow(/CASE_SESSION_FAILED_NO_MUTATION/);
    expect(() =>
      ledger.recordLocalKeepOpaque({
        caseSessionId: 'case_failure01',
        turnId: 'turn_failure01',
        decidedAt: '2026-08-22T20:02:01.000Z',
      }),
    ).toThrow(/CASE_SESSION_TURN_DUPLICATE/);

    const stopped = ledger.recordLocalKeepOpaque({
      caseSessionId: 'case_failure01',
      turnId: 'turn_failure_stop01',
      decidedAt: '2026-08-22T20:02:02.000Z',
    });
    expect(stopped.postState).toMatchObject({
      status: 'TERMINAL',
      terminalAction: 'KeepOpaque',
      currentSceneHash: INITIAL_HASH,
    });
  });

  test('rejects stale and malformed failure facts', () => {
    const ledger = createLedger();

    expect(() =>
      ledger.recordFailureNoMutation({
        caseSessionId: 'case_default01',
        turnId: 'turn_failure01',
        observedSceneHash: '9'.repeat(64),
        reasonCode: 'CONDUCTOR_UNAVAILABLE',
        providerRequestsMade: 1,
        recordedAt: '2026-08-22T20:02:00.000Z',
      }),
    ).toThrow(/CASE_SESSION_SCENE_PRECONDITION_STALE/);
    expect(() =>
      ledger.recordFailureNoMutation({
        caseSessionId: 'case_default01',
        turnId: 'turn_failure01',
        observedSceneHash: INITIAL_HASH,
        reasonCode: '',
        providerRequestsMade: -1,
        recordedAt: '2026-08-22T20:02:00.000Z',
      }),
    ).toThrow(/CASE_SESSION_INPUT_INVALID/);
  });

  test('allows checkpoint reset only after terminal and preserves termination', () => {
    const ledger = createLedger({ caseSessionId: 'case_terminal01' });

    expect(() =>
      ledger.recordCheckpointReset({
        caseSessionId: 'case_terminal01',
        resetId: 'reset_early01',
        restoredSceneHash: INITIAL_HASH,
        resetAt: '2026-08-22T20:03:00.000Z',
      }),
    ).toThrow(/CASE_SESSION_RESET_REQUIRES_TERMINAL/);

    ledger.recordApprovedExecution(
      approvedTurn({
        caseSessionId: 'case_terminal01',
        resultSceneHash: '8'.repeat(64),
        actionSequence: ['Continue'],
      }),
    );
    expect(() =>
      ledger.recordCheckpointReset({
        caseSessionId: 'case_terminal01',
        resetId: 'reset_wrong_hash01',
        restoredSceneHash: '7'.repeat(64),
        resetAt: '2026-08-22T20:03:00.000Z',
      }),
    ).toThrow(/CASE_SESSION_RESET_HASH_INVALID/);

    const reset = ledger.recordCheckpointReset({
      caseSessionId: 'case_terminal01',
      resetId: 'reset_terminal01',
      restoredSceneHash: INITIAL_HASH,
      resetAt: '2026-08-22T20:03:01.000Z',
    });
    expect(reset).toMatchObject({
      kind: 'CHECKPOINT_RESET',
      turnId: null,
      resetId: 'reset_terminal01',
      actionSequence: [],
      parentSceneHash: '8'.repeat(64),
      resultSceneHash: INITIAL_HASH,
      providerRequestsMade: 0,
      postState: {
        status: 'TERMINAL',
        terminalAction: 'Continue',
        currentSceneHash: INITIAL_HASH,
      },
    });
    expect(() =>
      ledger.recordCheckpointReset({
        caseSessionId: 'case_terminal01',
        resetId: 'reset_terminal01',
        restoredSceneHash: INITIAL_HASH,
        resetAt: '2026-08-22T20:03:02.000Z',
      }),
    ).toThrow(/CASE_SESSION_RESET_DUPLICATE/);
  });

  test('validates local-stop identity, turn and timestamp', () => {
    const invalidStops: LocalKeepOpaqueInput[] = [
      {
        caseSessionId: 'case_other01',
        turnId: 'turn_stop01',
        decidedAt: '2026-08-22T20:01:00.000Z',
      },
      {
        caseSessionId: 'case_default01',
        turnId: '',
        decidedAt: '2026-08-22T20:01:00.000Z',
      },
      {
        caseSessionId: 'case_default01',
        turnId: 'turn_stop01',
        decidedAt: '2026-08-22 20:01:00',
      },
    ];

    expect(() => createLedger().recordLocalKeepOpaque(invalidStops[0]!)).toThrow(
      /CASE_SESSION_IDENTITY_MISMATCH/,
    );
    expect(() => createLedger().recordLocalKeepOpaque(invalidStops[1]!)).toThrow(
      /CASE_SESSION_INPUT_INVALID/,
    );
    expect(() => createLedger().recordLocalKeepOpaque(invalidStops[2]!)).toThrow(
      /CASE_SESSION_INPUT_INVALID/,
    );
  });
});
