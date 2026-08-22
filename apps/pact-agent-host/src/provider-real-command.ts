import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  COMPATIBILITY_CREDENTIAL_REFS,
  COMPATIBILITY_LIMITS,
  inspectCompatibilityConfig,
} from './compatibility-config.js';
import {
  runRealProviderCompatibility,
  type ProviderCompatibilityRuntimeResult,
  type RealProviderCompatibilityOptions,
} from './provider-real-runner.js';
import {
  executeAuthorizedProviderRun,
  type ProviderRealRunApproval,
  type ProviderRealRunPreflightFacts,
} from './provider-real-run-gate.js';
import {
  ProviderRunEvidenceError,
  verifyProviderRunEvidence,
  type ProviderRunArchive,
} from './provider-run-evidence.js';

export interface ExecuteProviderRealCommandOptions {
  readonly cwd: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly preflight: ProviderRealRunPreflightFacts;
  readonly approval: ProviderRealRunApproval;
  readonly executeReal?: (
    options: RealProviderCompatibilityOptions,
  ) => Promise<ProviderCompatibilityRuntimeResult>;
}

export const executeProviderRealCommand = async (
  options: ExecuteProviderRealCommandOptions,
) => {
  const executeReal = options.executeReal ?? runRealProviderCompatibility;
  return executeAuthorizedProviderRun({
    preflight: options.preflight,
    approval: options.approval,
    execute: async () => {
      const artifactParent = resolve(
        options.cwd,
        'artifacts/provider-compatibility',
      );
      const runRoot = resolve(artifactParent, options.approval.runId);
      await mkdir(artifactParent, { recursive: true });
      await mkdir(runRoot);
      const result = await executeReal({
        runId: options.approval.runId,
        config: inspectCompatibilityConfig(options.env),
        persistenceRoot: resolve(runRoot, 'sessions'),
        dshHome: resolve(runRoot, 'dsh'),
        cancellationDelayMs: COMPATIBILITY_LIMITS.deadlineMs - 250,
      });
      const rawPath = resolve(runRoot, 'raw-run.json');
      const pendingPath = resolve(runRoot, '.raw-run.json.pending');
      const archive: ProviderRunArchive = {
        schemaVersion: 'cp03-provider-raw-run/0.1',
        approval: options.approval,
        preflight: options.preflight,
        result,
      };
      const serialized = `${JSON.stringify(archive, null, 2)}\n`;
      const credentialValues = Object.values(COMPATIBILITY_CREDENTIAL_REFS)
        .flatMap((reference) => {
          const value = options.env[reference];
          return value === undefined ? [] : [value];
        });
      const evidence = verifyProviderRunEvidence(
        serialized,
        credentialValues,
      );
      const evidencePath = resolve(runRoot, 'evidence-report.json');
      const evidencePendingPath = resolve(
        runRoot,
        '.evidence-report.json.pending',
      );
      await writeFile(
        evidencePendingPath,
        `${JSON.stringify(evidence, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      if (evidence.checks.secretScan === 'FAIL') {
        await rename(evidencePendingPath, evidencePath);
        throw new ProviderRunEvidenceError(
          'PROVIDER_RUN_SECRET_LEAK_BLOCKED',
          evidence,
        );
      }
      await writeFile(pendingPath, serialized, { encoding: 'utf8', flag: 'wx' });
      await rename(pendingPath, rawPath);
      await rename(evidencePendingPath, evidencePath);
      if (evidence.status === 'FAIL') {
        throw new ProviderRunEvidenceError(
          'PROVIDER_RUN_EVIDENCE_INVALID',
          evidence,
        );
      }
      return { ...result, evidence };
    },
  });
};
