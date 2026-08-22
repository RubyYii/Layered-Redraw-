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
    readonly schemaVersion: 'cp03-foundation-gate/0.1';
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
