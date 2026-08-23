import { createHash } from 'node:crypto';

export const CP03_EVIDENCE_CLASSES = [
  'interaction',
  'visual',
  'engineering',
  'provenance',
  'discourse',
] as const;

export type Cp03EvidenceClass = typeof CP03_EVIDENCE_CLASSES[number];

export interface Cp03CheckpointCandidate {
  readonly schemaVersion: 'pact-cp03-checkpoint-candidate/0.1';
  readonly checkpointId: string;
  readonly interaction: {
    readonly viewerInputs: readonly { readonly kind: 'text' | 'image' | 'audio'; readonly sha256: string }[];
    readonly roleTrace: readonly { readonly role: string; readonly text: string; readonly sourceSha256: string }[];
    readonly proposalSha256: string;
    readonly dissent: readonly { readonly role: string; readonly text: string; readonly sourceSha256: string }[];
    readonly decisionSequence: readonly { readonly decision: 'APPROVE' | 'REJECT'; readonly draftSha256: string }[];
  };
  readonly visual: {
    readonly beforeStills: readonly string[];
    readonly afterStills: readonly string[];
    readonly continuousCapture: string;
    readonly sceneMutationReceiptSha256: string;
    readonly rollbackCapture: string;
  };
  readonly engineering: {
    readonly localScriptedVerification: 'PASS' | 'FAIL';
    readonly realProviderEvidence: { readonly status: 'PASS' | 'FAIL'; readonly runId: string; readonly archiveSha256: string };
    readonly dshLedgerSha256: string;
    readonly timing: {
      readonly firstTraceMs: number;
      readonly acceptedDraftMs: number;
      readonly hardDeadlineMs: number;
      readonly hardDeadlineMet: boolean;
    };
    readonly draftSha256: string;
    readonly sceneBeforeSha256: string;
    readonly sceneAfterSha256: string;
    readonly capabilityGate: 'PASS' | 'FAIL';
    readonly rubyExecution: 'PASS' | 'FAIL';
    readonly rubyReceiptSha256: string;
    readonly replay: 'PASS' | 'FAIL';
    readonly rollback: 'PASS' | 'FAIL';
  };
  readonly provenance: {
    readonly providerModels: readonly { readonly provider: string; readonly route: string; readonly model: string }[];
    readonly promptVersion: string;
    readonly schemaVersion: string;
    readonly registryVersion: string;
    readonly assets: readonly {
      readonly id: string;
      readonly source: string;
      readonly licence: string;
      readonly sha256: string;
    }[];
  };
  readonly discourse: {
    readonly checkpointCopy: string;
    readonly scriptCorrespondence: string;
    readonly citedReferences: readonly { readonly citation: string; readonly source: string }[];
    readonly disturbanceAccount: string;
  };
  readonly decisions: {
    readonly technicalReview: 'PASS' | 'FAIL';
    readonly artisticReview: 'KEEP' | 'REVISE' | 'REJECT';
    readonly archiveIntegrity: 'PASS' | 'FAIL';
    readonly commitSha: string;
    readonly collaborationBranch: string;
    readonly pushedCommitSha: string;
    readonly publicRelease: 'APPROVED' | 'NOT_REQUESTED' | 'REJECTED';
  };
}

export interface Cp03CheckpointAudit {
  readonly schemaVersion: 'pact-cp03-checkpoint-audit/0.1';
  readonly status: 'READY' | 'BLOCKED';
  readonly evidenceClasses: Readonly<Record<Cp03EvidenceClass, 'PASS' | 'FAIL'>>;
  readonly missing: readonly string[];
}

export interface Cp03CheckpointArchive {
  readonly schemaVersion: 'pact-cp03-checkpoint-archive/0.1';
  readonly status: 'CHECKPOINT_CANDIDATE_COMPLETE';
  readonly checkpointId: string;
  readonly candidateSha256: string;
  readonly evidenceClasses: Readonly<Record<Cp03EvidenceClass, 'PASS'>>;
  readonly candidate: Cp03CheckpointCandidate;
}

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const hasSha = (value: unknown): value is string => typeof value === 'string' && SHA256.test(value);
const hasValues = (value: unknown): value is readonly unknown[] => Array.isArray(value) && value.length > 0;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
};

export const canonicalCheckpointJson = (value: unknown): string => `${JSON.stringify(canonicalize(value), null, 2)}\n`;
export const checkpointSha256 = (value: unknown): string => createHash('sha256')
  .update(canonicalCheckpointJson(value), 'utf8')
  .digest('hex');

export function auditCp03CheckpointCandidate(candidate: Cp03CheckpointCandidate): Cp03CheckpointAudit {
  const missing: string[] = [];
  const require = (condition: boolean, path: string): void => {
    if (!condition) missing.push(path);
  };

  require(candidate?.schemaVersion === 'pact-cp03-checkpoint-candidate/0.1', 'schemaVersion');
  require(hasText(candidate?.checkpointId), 'checkpointId');

  const interaction = candidate?.interaction;
  require(hasValues(interaction?.viewerInputs), 'interaction.viewerInputs');
  for (const [index, input] of (interaction?.viewerInputs ?? []).entries()) {
    require(['text', 'image', 'audio'].includes(input.kind), `interaction.viewerInputs[${index}].kind`);
    require(hasSha(input.sha256), `interaction.viewerInputs[${index}].sha256`);
  }
  require(hasValues(interaction?.roleTrace), 'interaction.roleTrace');
  for (const [index, trace] of (interaction?.roleTrace ?? []).entries()) {
    require(hasText(trace.role) && hasText(trace.text) && hasSha(trace.sourceSha256), `interaction.roleTrace[${index}]`);
  }
  require(hasSha(interaction?.proposalSha256), 'interaction.proposalSha256');
  require(hasValues(interaction?.dissent), 'interaction.dissent');
  for (const [index, dissent] of (interaction?.dissent ?? []).entries()) {
    require(hasText(dissent.role) && hasText(dissent.text) && hasSha(dissent.sourceSha256), `interaction.dissent[${index}]`);
  }
  require(hasValues(interaction?.decisionSequence), 'interaction.decisionSequence');
  require((interaction?.decisionSequence ?? []).every((entry) => (
    ['APPROVE', 'REJECT'].includes(entry.decision) && hasSha(entry.draftSha256)
  )), 'interaction.decisionSequence.entries');

  const visual = candidate?.visual;
  require(hasValues(visual?.beforeStills) && visual.beforeStills.every(hasText), 'visual.beforeStills');
  require(hasValues(visual?.afterStills) && visual.afterStills.every(hasText), 'visual.afterStills');
  require(hasText(visual?.continuousCapture), 'visual.continuousCapture');
  require(hasSha(visual?.sceneMutationReceiptSha256), 'visual.sceneMutationReceiptSha256');
  require(hasText(visual?.rollbackCapture), 'visual.rollbackCapture');

  const engineering = candidate?.engineering;
  require(engineering?.localScriptedVerification === 'PASS', 'engineering.localScriptedVerification');
  require(engineering?.realProviderEvidence?.status === 'PASS', 'engineering.realProviderEvidence.status');
  require(hasText(engineering?.realProviderEvidence?.runId), 'engineering.realProviderEvidence.runId');
  require(hasSha(engineering?.realProviderEvidence?.archiveSha256), 'engineering.realProviderEvidence.archiveSha256');
  require(hasSha(engineering?.dshLedgerSha256), 'engineering.dshLedgerSha256');
  require(Number.isFinite(engineering?.timing?.firstTraceMs) && engineering.timing.firstTraceMs >= 0, 'engineering.timing.firstTraceMs');
  require(Number.isFinite(engineering?.timing?.acceptedDraftMs) && engineering.timing.acceptedDraftMs >= 0, 'engineering.timing.acceptedDraftMs');
  require(engineering?.timing?.hardDeadlineMs === 12_000 && engineering.timing.hardDeadlineMet === true, 'engineering.timing.hardDeadline');
  for (const key of ['draftSha256', 'sceneBeforeSha256', 'sceneAfterSha256', 'rubyReceiptSha256'] as const) {
    require(hasSha(engineering?.[key]), `engineering.${key}`);
  }
  require(engineering?.capabilityGate === 'PASS', 'engineering.capabilityGate');
  require(engineering?.rubyExecution === 'PASS', 'engineering.rubyExecution');
  require(engineering?.replay === 'PASS', 'engineering.replay');
  require(engineering?.rollback === 'PASS', 'engineering.rollback');

  const provenance = candidate?.provenance;
  require(hasValues(provenance?.providerModels), 'provenance.providerModels');
  require((provenance?.providerModels ?? []).every((entry) => hasText(entry.provider) && hasText(entry.route) && hasText(entry.model)), 'provenance.providerModels.entries');
  require(hasText(provenance?.promptVersion), 'provenance.promptVersion');
  require(hasText(provenance?.schemaVersion), 'provenance.schemaVersion');
  require(hasText(provenance?.registryVersion), 'provenance.registryVersion');
  require(hasValues(provenance?.assets), 'provenance.assets');
  require((provenance?.assets ?? []).every((asset) => (
    hasText(asset.id) && hasText(asset.source) && hasText(asset.licence) && hasSha(asset.sha256)
  )), 'provenance.assets.entries');

  const discourse = candidate?.discourse;
  require(hasText(discourse?.checkpointCopy), 'discourse.checkpointCopy');
  require(hasText(discourse?.scriptCorrespondence), 'discourse.scriptCorrespondence');
  require(hasValues(discourse?.citedReferences), 'discourse.citedReferences');
  require((discourse?.citedReferences ?? []).every((entry) => hasText(entry.citation) && hasText(entry.source)), 'discourse.citedReferences.entries');
  require(hasText(discourse?.disturbanceAccount), 'discourse.disturbanceAccount');

  const decisions = candidate?.decisions;
  require(decisions?.technicalReview === 'PASS', 'decisions.technicalReview');
  require(decisions?.artisticReview === 'KEEP', 'decisions.artisticReview');
  require(decisions?.archiveIntegrity === 'PASS', 'decisions.archiveIntegrity');
  require(typeof decisions?.commitSha === 'string' && COMMIT_SHA.test(decisions.commitSha), 'decisions.commitSha');
  require(hasText(decisions?.collaborationBranch), 'decisions.collaborationBranch');
  require(decisions?.pushedCommitSha === decisions?.commitSha, 'decisions.pushedCommitSha');
  require(['APPROVED', 'NOT_REQUESTED'].includes(decisions?.publicRelease ?? ''), 'decisions.publicRelease');

  const evidenceClasses: Record<Cp03EvidenceClass, 'PASS' | 'FAIL'> = {
    interaction: missing.some((path) => path.startsWith('interaction.')) ? 'FAIL' : 'PASS',
    visual: missing.some((path) => path.startsWith('visual.')) ? 'FAIL' : 'PASS',
    engineering: missing.some((path) => path.startsWith('engineering.')) ? 'FAIL' : 'PASS',
    provenance: missing.some((path) => path.startsWith('provenance.')) ? 'FAIL' : 'PASS',
    discourse: missing.some((path) => path.startsWith('discourse.')) ? 'FAIL' : 'PASS',
  };
  return {
    schemaVersion: 'pact-cp03-checkpoint-audit/0.1',
    status: missing.length === 0 ? 'READY' : 'BLOCKED',
    evidenceClasses,
    missing,
  };
}

export function createCp03CheckpointArchive(candidate: Cp03CheckpointCandidate): Cp03CheckpointArchive {
  const audit = auditCp03CheckpointCandidate(candidate);
  if (audit.status !== 'READY') {
    throw new Error(`CP03 checkpoint evidence incomplete: ${audit.missing.join(', ')}`);
  }
  return {
    schemaVersion: 'pact-cp03-checkpoint-archive/0.1',
    status: 'CHECKPOINT_CANDIDATE_COMPLETE',
    checkpointId: candidate.checkpointId,
    candidateSha256: checkpointSha256(candidate),
    evidenceClasses: {
      interaction: 'PASS',
      visual: 'PASS',
      engineering: 'PASS',
      provenance: 'PASS',
      discourse: 'PASS',
    },
    candidate,
  };
}
