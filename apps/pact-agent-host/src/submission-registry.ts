import {
  isJsonValue,
  type JsonValue,
  type Session,
  type SessionId,
} from '@deepseek-ai/dsh-session';
import {
  sha256Canonical,
} from '@layered-redraw/pact-cp03-contracts';

import type {
  AgentActionDraft,
  AgentContribution,
} from './contract-types.js';
import { monotonicNowMs } from './council-turn.js';
import type { PactRole } from './events.js';

export interface SubmissionReceipt {
  readonly accepted: boolean;
  readonly payloadHash: string;
  readonly acceptedAtMonotonicMs?: number;
}

export interface RoleBinding {
  readonly sessionId: SessionId;
  readonly role: PactRole;
}

interface BindingLease extends RoleBinding {
  leases: number;
}

interface DeadlineState {
  readonly closed: boolean;
  readonly deadlineAt?: number;
}

const jsonValue = (value: unknown): JsonValue => {
  if (!isJsonValue(value)) {
    throw new TypeError('PACT payload is not lossless JSON');
  }
  return value as JsonValue;
};

export class SubmissionRegistry {
  private readonly bindings = new Map<string, BindingLease>();
  private readonly deadlines = new Map<string, DeadlineState>();
  private readonly acceptedByTurn = new Map<string, string[]>();
  private readonly quarantinedByTurn = new Map<string, string[]>();
  private readonly currentDraftByTurn = new Map<string, string>();
  private readonly draftPayloadByHash = new Map<string, AgentActionDraft>();

  constructor(private readonly now: () => number = monotonicNowMs) {}

  bind(sessionId: SessionId, role: PactRole): () => void {
    const key = String(sessionId);
    const existing = this.bindings.get(key);
    if (existing !== undefined) {
      if (existing.role !== role || existing.sessionId !== sessionId) {
        throw new Error('PACT_BINDING_CONFLICT');
      }
      existing.leases += 1;
    } else {
      this.bindings.set(key, { sessionId, role, leases: 1 });
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.bindings.get(key);
      if (current === undefined || current.role !== role) return;
      current.leases -= 1;
      if (current.leases === 0) this.bindings.delete(key);
    };
  }

  bindingFor(sessionId: SessionId): RoleBinding {
    const binding = this.bindings.get(String(sessionId));
    if (binding === undefined) throw new Error('PACT_ROLE_BINDING_REQUIRED');
    return { sessionId: binding.sessionId, role: binding.role };
  }

  openTurn(turnId: string, deadlineAt?: number): void {
    this.deadlines.set(turnId, {
      closed: false,
      ...(deadlineAt === undefined ? {} : { deadlineAt }),
    });
  }

  closeTurn(turnId: string): void {
    this.deadlines.set(turnId, { closed: true });
  }

  currentProposal(turnId: string): readonly string[] {
    return [...(this.acceptedByTurn.get(turnId) ?? [])];
  }

  currentDraft(turnId: string): string | undefined {
    return this.currentDraftByTurn.get(turnId);
  }

  draftPayload(payloadHash: string): AgentActionDraft | undefined {
    const payload = this.draftPayloadByHash.get(payloadHash);
    return payload === undefined ? undefined : structuredClone(payload);
  }

  quarantined(turnId: string): readonly string[] {
    return [...(this.quarantinedByTurn.get(turnId) ?? [])];
  }

  publishTrace(
    session: Session,
    input: { readonly turnId: string; readonly role: PactRole; readonly text: string },
  ): Promise<SubmissionReceipt> {
    return this.publishTraceAsync(session, input);
  }

  private async publishTraceAsync(
    session: Session,
    input: { readonly turnId: string; readonly role: PactRole; readonly text: string },
  ): Promise<SubmissionReceipt> {
    const payloadHash = await sha256Canonical(input);
    session.append('pact/public-trace', input);
    return { accepted: true, payloadHash };
  }

  async recordRoute(
    session: Session,
    input: Readonly<Record<string, unknown>>,
  ): Promise<SubmissionReceipt> {
    const payloadHash = await sha256Canonical(input);
    const turnId = typeof input.turnId === 'string' ? input.turnId : 'turn_invalid';
    const text = typeof input.publicTrace === 'string' ? input.publicTrace : '';
    session.append('pact/public-trace', {
      turnId,
      role: 'CaseConductor',
      text,
    });
    return { accepted: true, payloadHash };
  }

  acceptContribution(
    session: Session,
    contribution: AgentContribution,
  ): Promise<SubmissionReceipt> {
    return this.acceptContributionAsync(session, contribution);
  }

  private async acceptContributionAsync(
    session: Session,
    contribution: AgentContribution,
  ): Promise<SubmissionReceipt> {
    const payloadHash = await sha256Canonical(contribution);
    if (this.isLate(contribution.turnId)) {
      session.append('pact/quarantine', {
        turnId: contribution.turnId,
        reason: 'PACT_DEADLINE_CLOSED',
        payloadHash,
      });
      const quarantined = this.quarantinedByTurn.get(contribution.turnId) ?? [];
      quarantined.push(payloadHash);
      this.quarantinedByTurn.set(contribution.turnId, quarantined);
      return { accepted: false, payloadHash };
    }
    session.append('pact/contribution', {
      turnId: contribution.turnId,
      role: contribution.role,
      payload: jsonValue(contribution),
      payloadHash,
    });
    const accepted = this.acceptedByTurn.get(contribution.turnId) ?? [];
    accepted.push(payloadHash);
    this.acceptedByTurn.set(contribution.turnId, accepted);
    return { accepted: true, payloadHash };
  }

  async acceptDraft(
    session: Session,
    draft: AgentActionDraft,
  ): Promise<SubmissionReceipt> {
    const payloadHash = await sha256Canonical(draft);
    const acceptedAtMonotonicMs = this.now();
    if (this.isLate(draft.identity.turnId, acceptedAtMonotonicMs)) {
      session.append('pact/quarantine', {
        turnId: draft.identity.turnId,
        reason: 'PACT_DEADLINE_CLOSED',
        payloadHash,
      });
      return { accepted: false, payloadHash };
    }
    session.append('pact/draft', {
      turnId: draft.identity.turnId,
      payload: jsonValue(draft),
      payloadHash,
    });
    this.draftPayloadByHash.set(payloadHash, structuredClone(draft));
    this.currentDraftByTurn.set(draft.identity.turnId, payloadHash);
    return { accepted: true, payloadHash, acceptedAtMonotonicMs };
  }

  private isLate(turnId: string, observedAt = this.now()): boolean {
    const state = this.deadlines.get(turnId);
    if (state === undefined) return false;
    if (state.closed) return true;
    return state.deadlineAt !== undefined && observedAt >= state.deadlineAt;
  }
}
