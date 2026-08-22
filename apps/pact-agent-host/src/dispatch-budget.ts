import type { ProbeExpectedOutcome } from './probe-plan.js';
import {
  createProviderAttemptRecord,
  finalizeProviderAttemptRecord,
  type ProviderAttemptRecord,
  type ProviderDispatchRequest,
} from './provider-envelope.js';
import type { CompatibilityProvider } from './compatibility-config.js';

export type ProviderAttemptResult =
  | {
      readonly kind: 'success';
      readonly outcome: ProbeExpectedOutcome | 'plain-json';
      readonly sideEffectAccepted: boolean;
    }
  | {
      readonly kind: 'failure';
      readonly code: string;
      readonly message: string;
      readonly preSideEffect: boolean;
      readonly sideEffectAccepted: boolean;
    };

export type ProviderTransport = (
  record: ProviderAttemptRecord,
) => Promise<ProviderAttemptResult>;

export class CompatibilityDispatchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CompatibilityDispatchError';
  }
}
export interface ProviderDispatcherOptions {
  readonly deadlineAt: number;
  readonly maximumDispatches: number;
  readonly transport: ProviderTransport;
  readonly now?: () => number;
}

export class ProviderDispatcher {
  private sent = 0;
  private readonly retriedProviders = new Set<CompatibilityProvider>();
  private readonly sideEffectProbes = new Set<string>();
  private readonly completedAttempts: ProviderAttemptRecord[] = [];
  private readonly now: () => number;

  constructor(private readonly options: ProviderDispatcherOptions) {
    this.now = options.now ?? Date.now;
  }

  get sentDispatches(): number {
    return this.sent;
  }

  retriesUsed(): readonly CompatibilityProvider[] {
    return [...this.retriedProviders];
  }

  attemptRecords(): readonly ProviderAttemptRecord[] {
    return [...this.completedAttempts];
  }

  async dispatch(
    request: ProviderDispatchRequest,
    runId: string,
  ): Promise<ProviderAttemptResult & { readonly kind: 'success' }> {
    let attempt = 1;
    let retryOf: string | null = null;
    while (true) {
      if (this.now() >= this.options.deadlineAt) {
        throw new CompatibilityDispatchError(
          'COMPATIBILITY_DEADLINE_EXCEEDED',
          `deadline reached before ${request.probeId}`,
        );
      }
      if (this.sent >= this.options.maximumDispatches) {
        throw new CompatibilityDispatchError(
          'DISPATCH_BUDGET_EXHAUSTED',
          `refused dispatch ${this.sent + 1}; hard maximum is ${this.options.maximumDispatches}`,
        );
      }

      const startedAt = new Date(this.now()).toISOString();
      const nextSentOrdinal = this.sent + 1;
      const record = createProviderAttemptRecord(
        request,
        runId,
        attempt,
        nextSentOrdinal,
        this.options.deadlineAt,
        startedAt,
        retryOf,
      );
      this.sent = nextSentOrdinal; // Count after validation, before transport.
      const result = await this.options.transport(record);
      const completed = finalizeProviderAttemptRecord(record, result.kind === 'success'
        ? result
        : {
            outcome: request.expectedOutcome,
            sideEffectAccepted: result.sideEffectAccepted,
            failureCode: result.code,
          }, new Date(this.now()).toISOString());
      this.completedAttempts.push(completed);
      if (result.kind === 'success') {
        if (result.sideEffectAccepted) {
          this.sideEffectProbes.add(request.probeId);
        }
        return result;
      }

      if (
        result.sideEffectAccepted ||
        this.sideEffectProbes.has(request.probeId)
      ) {
        throw new CompatibilityDispatchError(
          'RETRY_AFTER_SIDE_EFFECT_REFUSED',
          `${request.probeId} failed after an accepted provider side effect`,
        );
      }
      if (!result.preSideEffect) {
        throw new CompatibilityDispatchError(result.code, result.message);
      }
      if (this.retriedProviders.has(request.provider)) {
        throw new CompatibilityDispatchError(
          'PROVIDER_RETRY_EXHAUSTED',
          `${request.provider} already used its only pre-side-effect retry`,
        );
      }
      if (this.now() >= this.options.deadlineAt) {
        throw new CompatibilityDispatchError(
          'COMPATIBILITY_DEADLINE_EXCEEDED',
          `deadline reached before retrying ${request.probeId}`,
        );
      }
      this.retriedProviders.add(request.provider);
      retryOf = record.contract.callId;
      attempt += 1;
    }
  }
}
