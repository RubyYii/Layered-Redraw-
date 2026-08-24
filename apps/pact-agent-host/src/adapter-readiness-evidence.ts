import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import {
  type Gemini37CatalogAudit,
  verifyGemini37CatalogAudit,
} from './model-catalog-audit.js';

export const ADAPTER_READINESS_CLAIM_CEILING =
  'zero-network adapter verification; no model-quality result' as const;

export const ADAPTER_READINESS_VERIFICATION_IDS = [
  'contracts-test',
  'host-test',
  'host-typecheck',
  'host-build',
  'scene-test',
  'scene-build',
] as const;

type AdapterReadinessVerificationId =
  typeof ADAPTER_READINESS_VERIFICATION_IDS[number];

export interface AdapterReadinessManifest {
  readonly schemaVersion: 'pact-cp03-adapter-readiness/0.1';
  readonly status: 'ENGINEERING_READY';
  readonly evidenceLevel: 'STAGE_A_ADAPTER_READINESS';
  readonly claimCeiling:
    'zero-network adapter verification; no model-quality result';
  readonly runId: string;
  readonly runtimeCommit: string;
  readonly generatedAt: string;
  readonly providerRequestsMade: 0;
  readonly nonLocalBrowserRequests: 0;
  readonly auditSha256: string;
  readonly verification: readonly {
    readonly id: AdapterReadinessVerificationId;
    readonly status: 'PASS';
    readonly logPath: string;
    readonly logSha256: string;
  }[];
  readonly media: {
    readonly screenshot: { readonly path: string; readonly sha256: string };
    readonly video: { readonly path: string; readonly sha256: string };
  };
  readonly copyPath: string;
  readonly manifestSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RUN_ID = /^cp03-adapter-readiness-\d{8}T\d{6}Z$/;

const sha256Bytes = (value: Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const manifestHash = (
  manifest: Omit<AdapterReadinessManifest, 'manifestSha256'>,
): string => createHash('sha256')
  .update(canonicalJson(manifest), 'utf8')
  .digest('hex');

const isRelativePosixPath = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.includes('\\') || value.includes('://')) return false;
  if (posix.isAbsolute(value) || win32.isAbsolute(value)) return false;
  if (posix.normalize(value) !== value) return false;
  return value !== '.' && !value.startsWith('../');
};

const decodeUtf8 = (value: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    return null;
  }
};

const parseCanonicalJson = (
  value: Uint8Array,
): { readonly parsed: unknown; readonly canonical: boolean } | null => {
  const text = decodeUtf8(value);
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return { parsed, canonical: text === `${canonicalJson(parsed)}\n` };
  } catch {
    return null;
  }
};

const hasExactVerificationCommands = (
  verification: AdapterReadinessManifest['verification'],
): boolean => verification.length === ADAPTER_READINESS_VERIFICATION_IDS.length
  && verification.every(
    (entry, index) => entry.id === ADAPTER_READINESS_VERIFICATION_IDS[index],
  );

const hasExactEvidencePaths = (input: {
  readonly verification: AdapterReadinessManifest['verification'];
  readonly media: AdapterReadinessManifest['media'];
  readonly copyPath: string;
}): boolean => input.verification.every(
  (entry) => entry.logPath === `logs/${entry.id}.log`,
) && input.media.screenshot.path === 'media/catalog-capability.png'
  && input.media.video.path === 'media/adapter-readiness.webm'
  && input.copyPath === 'README.md';

const assertManifestInput = (
  input: Parameters<typeof createAdapterReadinessManifest>[0],
): void => {
  if (!RUN_ID.test(input.runId)) throw new Error('ADAPTER_RUN_ID_INVALID');
  if (!COMMIT.test(input.runtimeCommit)) throw new Error('RUNTIME_COMMIT_INVALID');
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error('GENERATED_AT_INVALID');
  }
  if (verifyGemini37CatalogAudit(input.catalogAudit).status !== 'PASS') {
    throw new Error('CATALOG_AUDIT_INVALID');
  }
  if (input.nonLocalBrowserRequests !== 0) {
    throw new Error('NON_LOCAL_BROWSER_REQUESTS');
  }
  if (!hasExactVerificationCommands(input.verification)) {
    throw new Error('VERIFICATION_COMMANDS_MISMATCH');
  }
  if (!hasExactEvidencePaths(input)) throw new Error('EVIDENCE_PATH_MISMATCH');
  if (input.verification.some((entry) =>
    entry.status !== 'PASS'
    || !isRelativePosixPath(entry.logPath)
    || !SHA256.test(entry.logSha256)
  )) {
    throw new Error('VERIFICATION_ENTRY_INVALID');
  }
  if (
    !isRelativePosixPath(input.media.screenshot.path)
    || !SHA256.test(input.media.screenshot.sha256)
    || !isRelativePosixPath(input.media.video.path)
    || !SHA256.test(input.media.video.sha256)
    || !isRelativePosixPath(input.copyPath)
  ) {
    throw new Error('EVIDENCE_PATH_OR_HASH_INVALID');
  }
};

export function createAdapterReadinessManifest(input: {
  readonly runId: string;
  readonly runtimeCommit: string;
  readonly generatedAt: string;
  readonly catalogAudit: Gemini37CatalogAudit;
  readonly verification: AdapterReadinessManifest['verification'];
  readonly media: AdapterReadinessManifest['media'];
  readonly copyPath: string;
  readonly nonLocalBrowserRequests: number;
}): AdapterReadinessManifest {
  assertManifestInput(input);

  const unsigned: Omit<AdapterReadinessManifest, 'manifestSha256'> = {
    schemaVersion: 'pact-cp03-adapter-readiness/0.1',
    status: 'ENGINEERING_READY',
    evidenceLevel: 'STAGE_A_ADAPTER_READINESS',
    claimCeiling: ADAPTER_READINESS_CLAIM_CEILING,
    runId: input.runId,
    runtimeCommit: input.runtimeCommit,
    generatedAt: input.generatedAt,
    providerRequestsMade: 0,
    nonLocalBrowserRequests: 0,
    auditSha256: input.catalogAudit.auditSha256,
    verification: input.verification.map((entry) => ({ ...entry })),
    media: {
      screenshot: { ...input.media.screenshot },
      video: { ...input.media.video },
    },
    copyPath: input.copyPath,
  };

  return { ...unsigned, manifestSha256: manifestHash(unsigned) };
}

export function verifyAdapterReadinessManifest(
  manifest: AdapterReadinessManifest,
  files: ReadonlyMap<string, Uint8Array>,
): { readonly status: 'PASS' | 'FAIL'; readonly findings: readonly string[] } {
  const findings: string[] = [];
  const add = (finding: string): void => {
    if (!findings.includes(finding)) findings.push(finding);
  };
  const requireFact = (condition: boolean, finding: string): void => {
    if (!condition) add(finding);
  };

  requireFact(
    manifest.schemaVersion === 'pact-cp03-adapter-readiness/0.1',
    'SCHEMA_VERSION_MISMATCH',
  );
  requireFact(manifest.status === 'ENGINEERING_READY', 'STATUS_MISMATCH');
  requireFact(
    manifest.evidenceLevel === 'STAGE_A_ADAPTER_READINESS',
    'EVIDENCE_LEVEL_MISMATCH',
  );
  requireFact(
    manifest.claimCeiling === ADAPTER_READINESS_CLAIM_CEILING,
    'CLAIM_CEILING_MISMATCH',
  );
  requireFact(RUN_ID.test(manifest.runId), 'RUN_ID_INVALID');
  requireFact(COMMIT.test(manifest.runtimeCommit), 'RUNTIME_COMMIT_INVALID');
  requireFact(Number.isFinite(Date.parse(manifest.generatedAt)), 'GENERATED_AT_INVALID');
  requireFact(manifest.providerRequestsMade === 0, 'PROVIDER_REQUESTS_NONZERO');
  requireFact(manifest.nonLocalBrowserRequests === 0, 'NON_LOCAL_BROWSER_REQUESTS');
  requireFact(SHA256.test(manifest.auditSha256), 'AUDIT_SHA256_INVALID');
  requireFact(
    hasExactVerificationCommands(manifest.verification),
    'VERIFICATION_COMMANDS_MISMATCH',
  );
  requireFact(hasExactEvidencePaths(manifest), 'EVIDENCE_PATH_MISMATCH');
  requireFact(
    manifest.verification.every((entry) => entry.status === 'PASS'),
    'VERIFICATION_COMMAND_NOT_PASS',
  );

  const referencedPaths = [
    ...manifest.verification.map((entry) => entry.logPath),
    manifest.media.screenshot.path,
    manifest.media.video.path,
    manifest.copyPath,
  ];
  if (!referencedPaths.every(isRelativePosixPath)) add('PATH_INVALID');

  const verifyFileHash = (filePath: string, expected: string): void => {
    if (!isRelativePosixPath(filePath)) return;
    const bytes = files.get(filePath);
    if (bytes === undefined) {
      add(`FILE_MISSING:${filePath}`);
      return;
    }
    if (bytes.byteLength === 0) add(`FILE_EMPTY:${filePath}`);
    if (!SHA256.test(expected)) {
      add(`FILE_SHA256_INVALID:${filePath}`);
      return;
    }
    if (sha256Bytes(bytes) !== expected) add(`FILE_SHA256_MISMATCH:${filePath}`);
  };

  for (const entry of manifest.verification) {
    verifyFileHash(entry.logPath, entry.logSha256);
  }
  verifyFileHash(manifest.media.screenshot.path, manifest.media.screenshot.sha256);
  verifyFileHash(manifest.media.video.path, manifest.media.video.sha256);

  const copyBytes = isRelativePosixPath(manifest.copyPath)
    ? files.get(manifest.copyPath)
    : undefined;
  if (copyBytes === undefined && isRelativePosixPath(manifest.copyPath)) {
    add(`FILE_MISSING:${manifest.copyPath}`);
  } else if (
    copyBytes !== undefined
    && decodeUtf8(copyBytes) !== `${ADAPTER_READINESS_CLAIM_CEILING}\n`
  ) {
    add('CLAIM_CEILING_COPY_MISMATCH');
  }

  const auditBytes = files.get('catalog-audit.json');
  if (auditBytes === undefined) {
    add('FILE_MISSING:catalog-audit.json');
  } else {
    const parsed = parseCanonicalJson(auditBytes);
    if (parsed === null) {
      add('CATALOG_AUDIT_JSON_INVALID');
    } else {
      if (!parsed.canonical) add('CATALOG_AUDIT_NOT_CANONICAL');
      const audit = parsed.parsed as Gemini37CatalogAudit;
      if (verifyGemini37CatalogAudit(audit).status !== 'PASS') {
        add('CATALOG_AUDIT_INVALID');
      }
      if (audit.auditSha256 !== manifest.auditSha256) {
        add('CATALOG_AUDIT_SHA256_MISMATCH');
      }
    }
  }

  const verificationBytes = files.get('verification-results.json');
  if (verificationBytes === undefined) {
    add('FILE_MISSING:verification-results.json');
  } else {
    const parsed = parseCanonicalJson(verificationBytes);
    if (parsed === null) {
      add('VERIFICATION_RESULTS_JSON_INVALID');
    } else {
      if (!parsed.canonical) add('VERIFICATION_RESULTS_NOT_CANONICAL');
      const expected = {
        schemaVersion: 'pact-cp03-adapter-readiness-verification/0.1',
        status: 'PASS',
        commands: manifest.verification,
      };
      if (canonicalJson(parsed.parsed) !== canonicalJson(expected)) {
        add('VERIFICATION_RESULTS_MISMATCH');
      }
    }
  }

  const { manifestSha256, ...unsigned } = manifest;
  requireFact(
    SHA256.test(manifestSha256) && manifestSha256 === manifestHash(unsigned),
    'MANIFEST_SHA256_MISMATCH',
  );

  const manifestBytes = files.get('evidence-manifest.json');
  if (manifestBytes === undefined) {
    add('FILE_MISSING:evidence-manifest.json');
  } else if (decodeUtf8(manifestBytes) !== `${canonicalJson(manifest)}\n`) {
    add('EVIDENCE_MANIFEST_BYTES_MISMATCH');
  }

  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings,
  };
}
