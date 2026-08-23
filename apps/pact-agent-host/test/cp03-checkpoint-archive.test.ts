import { describe, expect, it } from 'vitest';

import {
  auditCp03CheckpointCandidate,
  checkpointSha256,
  createCp03CheckpointArchive,
  type Cp03CheckpointCandidate,
} from '../src/cp03-checkpoint-archive.js';

const sha = (character: string): string => character.repeat(64);
const commitSha = 'a'.repeat(40);

const completeCandidate = (): Cp03CheckpointCandidate => ({
  schemaVersion: 'pact-cp03-checkpoint-candidate/0.1',
  checkpointId: 'cp03-test-fixture',
  interaction: {
    viewerInputs: [{ kind: 'text', sha256: sha('1') }],
    roleTrace: [{ role: 'Witness', text: 'Trace bound to source.', sourceSha256: sha('2') }],
    proposalSha256: sha('3'),
    dissent: [{ role: 'Guardian', text: 'Constraint retained.', sourceSha256: sha('4') }],
    decisionSequence: [{ decision: 'APPROVE', draftSha256: sha('3') }],
  },
  visual: {
    beforeStills: ['visual/before.png'],
    afterStills: ['visual/after.png'],
    continuousCapture: 'visual/continuous.webm',
    sceneMutationReceiptSha256: sha('5'),
    rollbackCapture: 'visual/rollback.webm',
  },
  engineering: {
    localScriptedVerification: 'PASS',
    realProviderEvidence: { status: 'PASS', runId: 'live-run-approved', archiveSha256: sha('6') },
    dshLedgerSha256: sha('7'),
    timing: { firstTraceMs: 2_000, acceptedDraftMs: 7_900, hardDeadlineMs: 12_000, hardDeadlineMet: true },
    draftSha256: sha('8'),
    sceneBeforeSha256: sha('9'),
    sceneAfterSha256: sha('a'),
    capabilityGate: 'PASS',
    rubyExecution: 'PASS',
    rubyReceiptSha256: sha('b'),
    replay: 'PASS',
    rollback: 'PASS',
  },
  provenance: {
    providerModels: [{ provider: 'provider', route: 'route', model: 'model' }],
    promptVersion: 'prompt/1',
    schemaVersion: 'schema/1',
    registryVersion: 'registry/1',
    assets: [{ id: 'asset-1', source: 'source', licence: 'licence', sha256: sha('c') }],
  },
  discourse: {
    checkpointCopy: 'Checkpoint copy.',
    scriptCorrespondence: 'Script correspondence.',
    citedReferences: [{ citation: 'Reference', source: 'bibliography' }],
    disturbanceAccount: 'The reference changed the interaction form.',
  },
  decisions: {
    technicalReview: 'PASS',
    artisticReview: 'KEEP',
    archiveIntegrity: 'PASS',
    commitSha,
    collaborationBranch: 'codex/pact-cp03-agent-native',
    pushedCommitSha: commitSha,
    publicRelease: 'NOT_REQUESTED',
  },
});

describe('CP03 checkpoint archive gate', () => {
  it('fails closed when local engineering evidence is mistaken for real-provider proof', () => {
    const candidate = completeCandidate();
    const incomplete: Cp03CheckpointCandidate = {
      ...candidate,
      engineering: {
        ...candidate.engineering,
        realProviderEvidence: { ...candidate.engineering.realProviderEvidence, status: 'FAIL' },
      },
    };

    const audit = auditCp03CheckpointCandidate(incomplete);
    expect(audit.status).toBe('BLOCKED');
    expect(audit.missing).toContain('engineering.realProviderEvidence.status');
    expect(() => createCp03CheckpointArchive(incomplete)).toThrow(/evidence incomplete/);
  });

  it('reports every absent evidence class rather than manufacturing a checkpoint', () => {
    const candidate = completeCandidate();
    const incomplete = {
      ...candidate,
      interaction: { ...candidate.interaction, roleTrace: [] },
      visual: { ...candidate.visual, continuousCapture: '' },
      engineering: { ...candidate.engineering, rollback: 'FAIL' as const },
      provenance: { ...candidate.provenance, assets: [] },
      discourse: { ...candidate.discourse, citedReferences: [] },
    };

    const audit = auditCp03CheckpointCandidate(incomplete);
    expect(audit.status).toBe('BLOCKED');
    expect(audit.evidenceClasses).toEqual({
      interaction: 'FAIL', visual: 'FAIL', engineering: 'FAIL', provenance: 'FAIL', discourse: 'FAIL',
    });
  });

  it('builds a stable candidate archive only after all gates pass', () => {
    const candidate = completeCandidate();
    const archive = createCp03CheckpointArchive(candidate);
    const reordered = JSON.parse(JSON.stringify(candidate)) as Cp03CheckpointCandidate;

    expect(archive.status).toBe('CHECKPOINT_CANDIDATE_COMPLETE');
    expect(archive.candidateSha256).toBe(checkpointSha256(reordered));
    expect(archive.evidenceClasses).toEqual({
      interaction: 'PASS', visual: 'PASS', engineering: 'PASS', provenance: 'PASS', discourse: 'PASS',
    });
  });
});
