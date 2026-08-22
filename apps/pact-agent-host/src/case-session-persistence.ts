import type { Context } from '@deepseek-ai/cordis';
import {
  isJsonValue,
  type JsonValue,
  type Session,
  type SessionId,
} from '@deepseek-ai/dsh-session';
import { sha256Canonical } from '@layered-redraw/pact-cp03-contracts';

import type { CaseSessionTransition } from './case-session.js';

export interface CaseSessionTransitionDurabilityReceipt {
  readonly status: 'DURABLE';
  readonly sessionId: SessionId;
  readonly transitionHash: string;
  readonly lastSeq: number;
}

function transitionPayload(transition: CaseSessionTransition): JsonValue {
  if (!isJsonValue(transition)) {
    throw new TypeError('CASE_TRANSITION_PAYLOAD_NOT_LOSSLESS_JSON');
  }
  return transition as unknown as JsonValue;
}

export async function persistCaseSessionTransition(input: {
  readonly ctx: Context;
  readonly session: Session;
  readonly transition: CaseSessionTransition;
}): Promise<CaseSessionTransitionDurabilityReceipt> {
  const { ctx, session, transition } = input;
  if (String(session.id) !== transition.rootDshSessionId) {
    throw new Error('CASE_TRANSITION_ROOT_SESSION_MISMATCH');
  }

  const transitionHash = await sha256Canonical(transition);
  const appended = session.append('pact/case-transition', {
    caseSessionId: transition.caseSessionId,
    turnId: transition.turnId,
    kind: transition.kind,
    payload: transitionPayload(transition),
    transitionHash,
  });

  try {
    const participated = await ctx.sessions.flush(session);
    if (!participated) {
      throw new Error('no session persistence listener participated');
    }
  } catch {
    throw new Error('CASE_TRANSITION_FLUSH_FAILED');
  }

  let inspected;
  try {
    inspected = await ctx.sessionPersistence.inspect(session.id);
  } catch {
    throw new Error('CASE_TRANSITION_DURABILITY_INCOMPLETE');
  }

  const persisted = inspected.events.find(
    (event) =>
      event.seq === appended.seq &&
      event.type === 'pact/case-transition' &&
      event.data.transitionHash === transitionHash,
  );
  if (persisted === undefined) {
    throw new Error('CASE_TRANSITION_DURABILITY_INCOMPLETE');
  }

  return Object.freeze({
    status: 'DURABLE' as const,
    sessionId: session.id,
    transitionHash,
    lastSeq: persisted.seq,
  });
}
