declare module '@layered-redraw/pact-cp03-contracts' {
  export const CP03_FOUNDATION_SCHEMA_VERSION:
    'cp03-foundation-gate/0.1';

  export type ContractRole = import('./contract-types.js').ContractRole;
  export type AgentContribution =
    import('./contract-types.js').AgentContribution;
  export type AgentActionDraft =
    import('./contract-types.js').AgentActionDraft;
  export type ProviderCallEnvelope =
    import('./contract-types.js').ProviderCallEnvelope;

  export const agentContributionSchema: Readonly<Record<string, unknown>>;
  export const agentActionDraftSchema: Readonly<Record<string, unknown>>;
  export const providerCallEnvelopeSchema: Readonly<Record<string, unknown>>;

  export function canonicalJson(value: unknown): string;
  export function sha256Canonical(value: unknown): Promise<string>;
  export function validateAgentContribution(
    value: unknown,
  ): AgentContribution;
  export function validateAgentActionDraft(value: unknown): AgentActionDraft;
  export function validateProviderCallEnvelope(
    value: unknown,
  ): ProviderCallEnvelope;
}
