import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import {
  type AdapterReadinessManifest,
  createAdapterReadinessManifest,
  verifyAdapterReadinessManifest,
} from '../src/adapter-readiness-evidence.js';
import {
  auditGemini37Catalog,
  type Gemini37CatalogAudit,
} from '../src/model-catalog-audit.js';

const CLAIM = 'zero-network adapter verification; no model-quality result';
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const sha256 = (value: Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

const validAudit = (): Gemini37CatalogAudit => auditGemini37Catalog({
  dshAdapter: {
    name: '@deepseek-ai/dsh-llm-pi-ai',
    version: '0.1.0-rc.6',
  },
  catalogPackage: {
    name: '@earendil-works/pi-ai',
    version: '0.84.2',
  },
  entries: [{
    provider: 'google',
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    inputModalities: ['text', 'image'],
    contextWindow: 1_048_576,
    defaultMaxTokens: 65_536,
  }],
});

const verificationIds = [
  'contracts-test',
  'host-test',
  'host-typecheck',
  'host-build',
  'scene-test',
  'scene-build',
] as const;

interface Fixture {
  readonly manifest: AdapterReadinessManifest;
  readonly files: Map<string, Uint8Array>;
}

const validFixture = (): Fixture => {
  const catalogAudit = validAudit();
  const files = new Map<string, Uint8Array>();
  const verification = verificationIds.map((id) => {
    const logPath = `logs/${id}.log`;
    const bytes = encode(`${id}: PASS\n`);
    files.set(logPath, bytes);
    return { id, status: 'PASS' as const, logPath, logSha256: sha256(bytes) };
  });
  const screenshot = encode('synthetic PNG bytes');
  const video = encode('synthetic WebM bytes');
  files.set('media/catalog-capability.png', screenshot);
  files.set('media/adapter-readiness.webm', video);
  files.set('README.md', encode(`${CLAIM}\n`));
  files.set('catalog-audit.json', encode(`${canonicalJson(catalogAudit)}\n`));

  const manifest = createAdapterReadinessManifest({
    runId: 'cp03-adapter-readiness-20260823T210000Z',
    runtimeCommit: 'a'.repeat(40),
    generatedAt: '2026-08-23T21:00:00.000Z',
    catalogAudit,
    verification,
    media: {
      screenshot: {
        path: 'media/catalog-capability.png',
        sha256: sha256(screenshot),
      },
      video: {
        path: 'media/adapter-readiness.webm',
        sha256: sha256(video),
      },
    },
    copyPath: 'README.md',
    nonLocalBrowserRequests: 0,
  });

  files.set('verification-results.json', encode(`${canonicalJson({
    schemaVersion: 'pact-cp03-adapter-readiness-verification/0.1',
    status: 'PASS',
    commands: manifest.verification,
  })}\n`));
  files.set('evidence-manifest.json', encode(`${canonicalJson(manifest)}\n`));
  return { manifest, files };
};

const invalidManifest = (
  manifest: AdapterReadinessManifest,
  change: Record<string, unknown>,
): AdapterReadinessManifest => ({
  ...manifest,
  ...change,
}) as unknown as AdapterReadinessManifest;

describe('Stage A adapter readiness evidence', () => {
  it('accepts a complete canonical archive', () => {
    const fixture = validFixture();

    expect(verifyAdapterReadinessManifest(fixture.manifest, fixture.files))
      .toEqual({ status: 'PASS', findings: [] });
  });

  it('rejects a missing required verification command', () => {
    const fixture = validFixture();
    const manifest = invalidManifest(fixture.manifest, {
      verification: fixture.manifest.verification.slice(1),
    });

    expect(verifyAdapterReadinessManifest(manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['VERIFICATION_COMMANDS_MISMATCH']),
    });
  });

  it('rejects a failed verification command', () => {
    const fixture = validFixture();
    const manifest = invalidManifest(fixture.manifest, {
      verification: fixture.manifest.verification.map((entry, index) =>
        index === 0 ? { ...entry, status: 'FAIL' } : entry
      ),
    });

    expect(verifyAdapterReadinessManifest(manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['VERIFICATION_COMMAND_NOT_PASS']),
    });
  });

  it('rejects an absolute or non-POSIX path', () => {
    const fixture = validFixture();
    const manifest = invalidManifest(fixture.manifest, {
      verification: fixture.manifest.verification.map((entry, index) =>
        index === 0 ? { ...entry, logPath: '/tmp/contracts-test.log' } : entry
      ),
    });

    expect(verifyAdapterReadinessManifest(manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['PATH_INVALID']),
    });
  });

  it('rejects substitution of one required evidence path for another', () => {
    const fixture = validFixture();
    const manifest = invalidManifest(fixture.manifest, {
      verification: fixture.manifest.verification.map((entry, index) =>
        index === 0 ? { ...entry, logPath: 'logs/host-test.log' } : entry
      ),
    });

    expect(verifyAdapterReadinessManifest(manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['EVIDENCE_PATH_MISMATCH']),
    });
  });

  it('rejects missing media', () => {
    const fixture = validFixture();
    fixture.files.delete(fixture.manifest.media.screenshot.path);

    expect(verifyAdapterReadinessManifest(fixture.manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['FILE_MISSING:media/catalog-capability.png']),
    });
  });

  it('rejects a tampered referenced file hash', () => {
    const fixture = validFixture();
    fixture.files.set('logs/host-test.log', encode('host-test: altered\n'));

    expect(verifyAdapterReadinessManifest(fixture.manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['FILE_SHA256_MISMATCH:logs/host-test.log']),
    });
  });

  it('rejects a provider request count greater than zero', () => {
    const fixture = validFixture();
    const manifest = invalidManifest(fixture.manifest, { providerRequestsMade: 1 });

    expect(verifyAdapterReadinessManifest(manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['PROVIDER_REQUESTS_NONZERO']),
    });
  });

  it('rejects a non-local browser request', () => {
    const fixture = validFixture();
    const manifest = invalidManifest(fixture.manifest, { nonLocalBrowserRequests: 1 });

    expect(verifyAdapterReadinessManifest(manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['NON_LOCAL_BROWSER_REQUESTS']),
    });
  });

  it('rejects wrong checkpoint copy', () => {
    const fixture = validFixture();
    fixture.files.set('README.md', encode('model quality verified\n'));

    expect(verifyAdapterReadinessManifest(fixture.manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['CLAIM_CEILING_COPY_MISMATCH']),
    });
  });

  it('rejects a manifest self-hash mismatch', () => {
    const fixture = validFixture();
    const manifest = invalidManifest(fixture.manifest, {
      manifestSha256: 'f'.repeat(64),
    });

    expect(verifyAdapterReadinessManifest(manifest, fixture.files)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['MANIFEST_SHA256_MISMATCH']),
    });
  });
});
