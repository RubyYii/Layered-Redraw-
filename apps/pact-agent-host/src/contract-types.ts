export type ContractRole =
  | 'CaseConductor'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';

export interface AgentContribution {
  readonly schemaVersion: 'cp03-foundation-gate/0.1';
  readonly role: ContractRole;
  readonly childSessionId: string;
  readonly turnId: string;
  readonly publicTrace: string;
  readonly proposal: string;
  readonly uncertainties: readonly string[];
  readonly evidenceAnchors: readonly string[];
  readonly assetRequests: readonly string[];
  readonly dissent: readonly string[];
  readonly toolReceiptRefs: readonly string[];
}

export interface AgentActionDraft {
  readonly identity: {
    readonly draftId: string;
    readonly schemaVersion:
      | 'cp03-foundation-gate/0.1'
      | 'cp03-runtime/0.1';
    readonly caseSessionId: string;
    readonly turnId: string;
    readonly parentSceneHash: string;
  };
  readonly decision: {
    readonly status: 'DRAFT' | 'NEEDS_CLARIFICATION' | 'PROPOSED' | 'WITHHELD';
    readonly actionSequence: readonly string[];
  };
  readonly creative: Readonly<Record<string, unknown>>;
  readonly materials: Readonly<Record<string, unknown>>;
  readonly execution: Readonly<Record<string, unknown>>;
  readonly agency: Readonly<Record<string, unknown>>;
}

export interface ProviderToolCallReceipt {
  readonly toolCallId: string;
  readonly name: string;
  readonly argumentsHash: string;
  readonly status: 'observed' | 'accepted' | 'rejected';
}

export interface ProviderCallEnvelope {
  readonly schemaVersion: 'cp03-foundation-gate/0.1';
  readonly callId: string;
  readonly providerRoute: string;
  readonly modelId: string;
  readonly adapterPackage: string;
  readonly adapterVersion: string;
  readonly providerKind: 'real' | 'scripted';
  readonly inputClasses: readonly ('fictional_text' | 'synthetic_image')[];
  readonly startedAt: string;
  readonly firstChunkAt: string | null;
  readonly firstPublicTraceAt: string | null;
  readonly endedAt: string | null;
  readonly latencyMs: number | null;
  readonly usage: null | {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostUsd: number | null;
  };
  readonly finish: {
    readonly kind:
      | 'pending'
      | 'stop'
      | 'tool_calls'
      | 'length'
      | 'aborted'
      | 'error';
    readonly detailCode?: string;
  };
  readonly toolCalls: readonly ProviderToolCallReceipt[];
  readonly sessionEventRange: null | {
    readonly sessionId: string;
    readonly fromSequence: number;
    readonly toSequence: number;
  };
  readonly retryOf: string | null;
  readonly lateQuarantined: boolean;
  readonly nativeResponseSchema:
    'UNSUPPORTED_ON_DSH_ROOT_CONTINUABLE_RC6';
}
