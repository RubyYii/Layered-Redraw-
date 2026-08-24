import type { SessionId } from '@deepseek-ai/dsh-session';

import type { CouncilRole } from './contract-types.js';
import type { FrozenCouncilTurn } from './council-turn.js';

export type CouncilToolPhase = 'SHARD' | 'CONDUCTOR_COMMIT';

export interface CouncilToolBinding {
  readonly sessionId: SessionId;
  readonly role: CouncilRole;
  readonly phase: CouncilToolPhase;
  readonly turn: FrozenCouncilTurn;
}

interface BindingLease {
  readonly binding: CouncilToolBinding;
  leases: number;
}

const sameBinding = (
  left: CouncilToolBinding,
  right: CouncilToolBinding,
): boolean =>
  left.sessionId === right.sessionId &&
  left.role === right.role &&
  left.phase === right.phase &&
  left.turn === right.turn;

const frozenBinding = (
  binding: CouncilToolBinding,
): CouncilToolBinding => Object.freeze({
  sessionId: binding.sessionId,
  role: binding.role,
  phase: binding.phase,
  turn: binding.turn,
});

export class CouncilToolBindingRegistry {
  private readonly bindings = new Map<string, BindingLease>();

  bind(binding: CouncilToolBinding): () => void {
    const key = String(binding.sessionId);
    const existing = this.bindings.get(key);
    if (existing !== undefined) {
      if (!sameBinding(existing.binding, binding)) {
        throw new Error('PACT_COUNCIL_TOOL_BINDING_CONFLICT');
      }
      existing.leases += 1;
    } else {
      this.bindings.set(key, {
        binding: frozenBinding(binding),
        leases: 1,
      });
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.bindings.get(key);
      if (current === undefined || !sameBinding(current.binding, binding)) return;
      current.leases -= 1;
      if (current.leases === 0) this.bindings.delete(key);
    };
  }

  require(sessionId: SessionId): CouncilToolBinding {
    const lease = this.bindings.get(String(sessionId));
    if (lease === undefined) {
      throw new Error('PACT_COUNCIL_TOOL_BINDING_REQUIRED');
    }
    return lease.binding;
  }
}
