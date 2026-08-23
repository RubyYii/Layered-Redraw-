import type { Session } from '@deepseek-ai/dsh-session';
import { describe, expect, it } from 'vitest';

import type { AgentActionDraft } from '../src/contract-types.js';
import { SubmissionRegistry } from '../src/submission-registry.js';

const draft = (turnId: string): AgentActionDraft => ({
  identity: {
    draftId: `draft_${turnId}`,
    schemaVersion: 'cp03-runtime/0.1',
    caseSessionId: 'case_submission_registry01',
    turnId,
    parentSceneHash: 'a'.repeat(64),
  },
  decision: {
    status: 'PROPOSED',
    actionSequence: ['Reframe'],
  },
  creative: {},
  materials: {},
  execution: {},
  agency: {},
});

const recordingSession = () => {
  const events: Array<{ readonly type: string; readonly data: unknown }> = [];
  return {
    session: {
      append(type: string, data: unknown) {
        events.push({ type, data });
      },
    } as unknown as Session,
    events,
  };
};

describe('SubmissionRegistry strict draft deadline admission', () => {
  it('uses the historical wall-clock epoch by default for an already-past deadline', async () => {
    const turnId = 'turn_submission_wall_clock01';
    const registry = new SubmissionRegistry();
    const recorded = recordingSession();
    registry.openTurn(turnId, Date.now() - 1);

    const receipt = await registry.acceptDraft(
      recorded.session,
      draft(turnId),
    );

    expect(receipt.accepted).toBe(false);
    expect(registry.currentDraft(turnId)).toBeUndefined();
    expect(recorded.events.map((event) => event.type)).toEqual(['pact/quarantine']);
  });

  it('rejects a draft that reaches exact deadline after a just-before runtime precheck', async () => {
    let now = 1_999;
    const deadlineAt = 2_000;
    const turnId = 'turn_submission_exact_deadline01';
    const registry = new SubmissionRegistry(() => now);
    const recorded = recordingSession();
    registry.openTurn(turnId, deadlineAt);

    expect(now < deadlineAt).toBe(true);
    now = deadlineAt;
    const receipt = await registry.acceptDraft(
      recorded.session,
      draft(turnId),
    );

    expect(receipt.accepted).toBe(false);
    expect(registry.currentDraft(turnId)).toBeUndefined();
    expect(recorded.events.map((event) => event.type)).toEqual(['pact/quarantine']);
  });

  it('returns the strict monotonic admission timestamp for a draft accepted before deadline', async () => {
    let now = 1_999;
    const deadlineAt = 2_000;
    const turnId = 'turn_submission_before_deadline01';
    const registry = new SubmissionRegistry(() => now);
    const recorded = recordingSession();
    registry.openTurn(turnId, deadlineAt);

    const receipt = await registry.acceptDraft(
      recorded.session,
      draft(turnId),
    );
    now = deadlineAt;

    expect(receipt).toMatchObject({
      accepted: true,
      acceptedAtMonotonicMs: 1_999,
    });
    expect(registry.currentDraft(turnId)).toBe(receipt.payloadHash);
  });
});
