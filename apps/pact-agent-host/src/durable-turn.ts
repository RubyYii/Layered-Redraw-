import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';

export type DurabilityStatus = 'DURABLE' | 'NOT_DURABLE';

export class PactDurabilityError extends Error {
  readonly status = 'NOT_DURABLE' as const;

  constructor(
    readonly code:
      | 'PACT_DURABILITY_TURN_TIMEOUT'
      | 'PACT_DURABILITY_FLUSH_FAILED'
      | 'PACT_DURABILITY_INSPECT_FAILED'
      | 'PACT_DURABILITY_INCOMPLETE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PactDurabilityError';
  }
}

const hasTurnEnd = (session: Session, dshTurn: number): boolean =>
  session.events.some((event) =>
    event.type === 'turn/end' && event.data.turn === dshTurn
  );

export const waitForTurnEnd = async (
  ctx: Context,
  session: Session,
  dshTurn: number,
  timeoutMs = 5_000,
): Promise<void> => {
  if (hasTurnEnd(session, dshTurn)) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      off();
      if (error === undefined) resolve();
      else reject(error);
    };
    const off = ctx.on('session/event', (observed, event) => {
      if (
        observed === session &&
        event.type === 'turn/end' &&
        event.data.turn === dshTurn
      ) {
        finish();
      }
    });
    const timeout = setTimeout(() => {
      finish(new PactDurabilityError(
        'PACT_DURABILITY_TURN_TIMEOUT',
        `turn ${dshTurn} did not end before the durability timeout`,
      ));
    }, timeoutMs);
    if (hasTurnEnd(session, dshTurn)) finish();
  });
};

export const durableTurn = async (
  ctx: Context,
  session: Session,
  dshTurn: number,
  pactTurnId: string,
  submissionHash: string,
) => {
  await waitForTurnEnd(ctx, session, dshTurn);
  try {
    const participated = await ctx.sessions.flush(session);
    if (!participated) {
      throw new Error('no session persistence listener participated');
    }
  } catch (error) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_FLUSH_FAILED',
      `turn ${dshTurn} could not cross the flush barrier`,
      { cause: error },
    );
  }

  let inspected;
  try {
    inspected = await ctx.sessionPersistence.inspect(session.id);
  } catch (error) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INSPECT_FAILED',
      `turn ${dshTurn} could not be inspected after flush`,
      { cause: error },
    );
  }
  const hasEnd = inspected.events.some((event) =>
    event.type === 'turn/end' && event.data.turn === dshTurn
  );
  const hasSubmission = inspected.events.some((event) =>
    event.type === 'pact/contribution' &&
    event.data.turnId === pactTurnId &&
    event.data.payloadHash === submissionHash
  );
  const lastSeq = inspected.events.at(-1)?.seq;
  if (!hasEnd || !hasSubmission || lastSeq === undefined) {
    throw new PactDurabilityError(
      'PACT_DURABILITY_INCOMPLETE',
      `turn ${dshTurn} is missing its terminal event or accepted submission`,
    );
  }
  return {
    status: 'DURABLE' as const,
    sessionId: session.id,
    lastSeq,
    submissionHash,
  };
};
