declare module '@layered-redraw/pact-cp03-contracts' {
  export const CP03_FOUNDATION_SCHEMA_VERSION:
    'cp03-foundation-gate/0.1';
  export const CP03_RUNTIME_SCHEMA_VERSION: 'cp03-runtime/0.1';
  export const CP03_COUNCIL_SCHEMA_VERSION: 'cp03-council/0.2';

  export type ContractRole = import('./contract-types.js').ContractRole;
  export type CouncilRole = import('./contract-types.js').CouncilRole;
  export type CouncilShardKind = import('./contract-types.js').CouncilShardKind;
  export type CouncilShard = import('./contract-types.js').CouncilShard;
  export type CouncilShardBase = import('./contract-types.js').CouncilShardBase;
  export type ConductorIntentShard =
    import('./contract-types.js').ConductorIntentShard;
  export type WitnessShard = import('./contract-types.js').WitnessShard;
  export type ArchivistShard = import('./contract-types.js').ArchivistShard;
  export type RewriterShard = import('./contract-types.js').RewriterShard;
  export type GuardianShard = import('./contract-types.js').GuardianShard;
  export type ConductorDraftCommit =
    import('./contract-types.js').ConductorDraftCommit;
  export type ProviderRoutingManifest =
    import('./contract-types.js').ProviderRoutingManifest;
  export type AgentContribution =
    import('./contract-types.js').AgentContribution;
  export type AgentActionDraft =
    import('./contract-types.js').AgentActionDraft;
  export type ProviderCallEnvelope =
    import('./contract-types.js').ProviderCallEnvelope;

  export const agentContributionSchema: Readonly<Record<string, unknown>>;
  export const agentActionDraftSchema: Readonly<Record<string, unknown>>;
  export const councilShardSchema: Readonly<Record<string, unknown>>;
  export const conductorDraftCommitSchema: Readonly<Record<string, unknown>>;
  export const providerCallEnvelopeSchema: Readonly<Record<string, unknown>>;
  export const providerRoutingManifestSchema:
    Readonly<Record<string, unknown>>;

  export function canonicalJson(value: unknown): string;
  export function sha256Canonical(value: unknown): Promise<string>;
  export function validateAgentContribution(
    value: unknown,
  ): AgentContribution;
  export function validateAgentActionDraft(value: unknown): AgentActionDraft;
  export function validateCouncilShard(value: unknown): CouncilShard;
  export function validateConductorDraftCommit(
    value: unknown,
  ): ConductorDraftCommit;
  export function validateProviderCallEnvelope(
    value: unknown,
  ): ProviderCallEnvelope;
  export function validateProviderRoutingManifest(
    value: unknown,
  ): ProviderRoutingManifest;
}
