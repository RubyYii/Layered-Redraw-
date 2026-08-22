import {
  KNOWN_SESSION_EVENT_TYPES,
  type JsonValue,
} from '@deepseek-ai/dsh-session';

export type PactRole =
  | 'CaseConductor'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';

export const PACT_SESSION_EVENT_TYPES = [
  'pact/public-trace',
  'pact/contribution',
  'pact/draft',
  'pact/quarantine',
] as const;

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'pact/public-trace': {
      turnId: string;
      role: PactRole;
      text: string;
    };
    'pact/contribution': {
      turnId: string;
      role: PactRole;
      payload: JsonValue;
      payloadHash: string;
    };
    'pact/draft': {
      turnId: string;
      payload: JsonValue;
      payloadHash: string;
    };
    'pact/quarantine': {
      turnId: string;
      reason: string;
      payloadHash?: string;
    };
  }
}

let registrations = 0;
const insertedByHost = new Set<string>();
const runtimeEventTypes = KNOWN_SESSION_EVENT_TYPES as Set<string>;

/**
 * Register the application-owned, non-ignorable event vocabulary with the
 * rc.6 cold reader. Declaration merging alone is compile-time only; without
 * this bounded registration JSONL inspection must reject the unknown events.
 */
export const registerPactSessionEventTypes = (): (() => void) => {
  if (registrations === 0) {
    for (const type of PACT_SESSION_EVENT_TYPES) {
      if (!runtimeEventTypes.has(type)) {
        runtimeEventTypes.add(type);
        insertedByHost.add(type);
      }
    }
  }
  registrations += 1;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    registrations -= 1;
    if (registrations !== 0) return;
    for (const type of insertedByHost) runtimeEventTypes.delete(type);
    insertedByHost.clear();
  };
};
