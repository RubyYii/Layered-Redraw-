import { describe, expect, it } from 'vitest';

import {
  auditProviderRoutingManifest,
  type CriticalPathDispatchRole,
  type ProviderRoutingAssignment,
  type ProviderRoutingManifest,
} from '../src/critical-path-routing.js';

const roles: readonly CriticalPathDispatchRole[] = [
  'ConductorIntent', 'Witness', 'Archivist', 'Rewriter', 'Guardian', 'ConductorCommit',
];

const assignment = (role: CriticalPathDispatchRole): ProviderRoutingAssignment => {
  const gemini = role === 'Witness' || role === 'Rewriter';
  return {
    role,
    provider: gemini ? 'gemini' : 'deepseek',
    route: gemini ? 'google' : 'deepseek-official',
    model: gemini ? 'approved-gemini-model' : 'approved-deepseek-model',
    adapterPackage: gemini ? '@deepseek-ai/dsh-llm-pi-ai' : '@deepseek-ai/dsh-llm-deepseek',
    adapterVersion: '0.1.0-rc.6',
    promptSha256: 'a'.repeat(64),
    supportedInputClasses: ['text', 'image', 'audio', 'scene'],
    maxInputTokens: 32_768,
    maxOutputTokens: 1_024,
    timeoutMs: 7_500,
    concurrencyCeiling: gemini ? 2 : 3,
    conductorContinuityKey: role === 'ConductorIntent' || role === 'ConductorCommit' ? 'case-conductor-session' : null,
  };
};

const manifest = (): ProviderRoutingManifest => ({
  schemaVersion: 'pact-cp03-provider-routing/0.1',
  manifestVersion: 'routing/approved-fixture-1',
  approvalId: 'approval-fixture-1',
  approvedAt: '2026-08-23T00:00:00.000Z',
  bakeoffEvidenceId: 'bakeoff-fixture-1',
  plannedDispatches: 6,
  maximumDispatches: 8,
  assignments: roles.map(assignment),
});

describe('critical-path provider routing manifest', () => {
  it('accepts a fixed dual-provider 6/8 route with sufficient parallel concurrency', () => {
    const audit = auditProviderRoutingManifest(manifest());
    expect(audit).toMatchObject({
      status: 'PASS',
      providerConcurrency: { deepseek: { required: 3, declared: 3 }, gemini: { required: 2, declared: 2 } },
    });
    expect(audit.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a silently switched Conductor commit model', () => {
    const candidate = manifest();
    const assignments = candidate.assignments.map((entry) => entry.role === 'ConductorCommit'
      ? { ...entry, model: 'different-model' }
      : entry);
    const audit = auditProviderRoutingManifest({ ...candidate, assignments });
    expect(audit.status).toBe('FAIL');
    expect(audit.findings).toContain('conductor.pinnedRoute');
  });

  it('rejects under-declared concurrency and missing multimodal support before any call', () => {
    const candidate = manifest();
    const assignments = candidate.assignments.map((entry) => entry.role === 'Witness'
      ? { ...entry, concurrencyCeiling: 1, supportedInputClasses: ['text'] as const }
      : entry);
    const audit = auditProviderRoutingManifest({ ...candidate, assignments });
    expect(audit.status).toBe('FAIL');
    expect(audit.findings).toContain('providers.gemini.concurrencyCeiling');
    expect(audit.findings.some((finding) => finding.startsWith('assignments.Witness.supportedInputClasses'))).toBe(true);
  });
});
