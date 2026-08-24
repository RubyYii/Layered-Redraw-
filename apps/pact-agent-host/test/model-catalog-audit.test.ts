import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  auditGemini37Catalog,
  type Gemini37CatalogAudit,
  type Gemini37CatalogSource,
  inspectInstalledGemini37Catalog,
  verifyGemini37CatalogAudit,
} from '../src/model-catalog-audit.js';

const validSource = (): Gemini37CatalogSource => ({
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

const sourceWithEntry = (
  entry: Partial<Gemini37CatalogSource['entries'][number]>,
): Gemini37CatalogSource => {
  const source = validSource();
  return {
    ...source,
    entries: [{ ...source.entries[0]!, ...entry }],
  };
};

const expectedHash = (audit: Gemini37CatalogAudit): string => {
  const { auditSha256: _auditSha256, ...unsigned } = audit;
  return createHash('sha256').update(canonicalJson(unsigned), 'utf8').digest('hex');
};

describe('Gemini 3.7 catalog audit', () => {
  it('accepts one exact Google text-and-image entry with the locked packages', () => {
    const audit = auditGemini37Catalog(validSource());

    expect(audit).toMatchObject({
      schemaVersion: 'cp03-model-catalog-audit/0.1',
      status: 'PASS',
      route: 'google',
      model: 'gemini-3.7-flash',
      packages: {
        name: '@deepseek-ai/dsh-llm-pi-ai',
        version: '0.1.0-rc.6',
        catalogName: '@earendil-works/pi-ai',
        catalogVersion: '0.84.2',
      },
      capability: {
        inputModalities: ['text', 'image'],
        contextWindow: 1_048_576,
        defaultMaxTokens: 65_536,
      },
      findings: [],
      providerRequestsMade: 0,
    });
    expect(audit.auditSha256).toBe(expectedHash(audit));
    expect(verifyGemini37CatalogAudit(audit)).toEqual({
      status: 'PASS',
      findings: [],
    });
  });

  it('inspects the installed catalog without a provider fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('provider fetch forbidden by catalog audit test'),
    );

    try {
      const source = await inspectInstalledGemini37Catalog();
      const audit = auditGemini37Catalog(source);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(audit).toMatchObject({
        status: 'PASS',
        route: 'google',
        model: 'gemini-3.7-flash',
        providerRequestsMade: 0,
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('rejects a missing exact model', () => {
    expect(auditGemini37Catalog({ ...validSource(), entries: [] }).status)
      .toBe('FAIL');
  });

  it('rejects a duplicate exact model', () => {
    const source = validSource();
    expect(auditGemini37Catalog({
      ...source,
      entries: [source.entries[0]!, source.entries[0]!],
    }).status).toBe('FAIL');
  });

  it('rejects a latest alias instead of the exact model id', () => {
    expect(auditGemini37Catalog(sourceWithEntry({
      id: 'gemini-3.7-flash-latest',
    })).status).toBe('FAIL');
  });

  it('rejects the exact id on a route other than Google', () => {
    expect(auditGemini37Catalog(sourceWithEntry({
      provider: 'opencode',
    })).status).toBe('FAIL');
  });

  it.each([
    ['missing text', ['image']],
    ['missing image', ['text']],
  ])('rejects %s modality', (_label, inputModalities) => {
    expect(auditGemini37Catalog(sourceWithEntry({ inputModalities })).status)
      .toBe('FAIL');
  });

  it.each([
    ['zero context', { contextWindow: 0 }],
    ['absent context', { contextWindow: null }],
    ['zero output limit', { defaultMaxTokens: 0 }],
    ['absent output limit', { defaultMaxTokens: null }],
  ])('rejects %s', (_label, entry) => {
    expect(auditGemini37Catalog(sourceWithEntry(entry)).status).toBe('FAIL');
  });

  it('rejects an unexpected DSH adapter version', () => {
    const source = validSource();
    expect(auditGemini37Catalog({
      ...source,
      dshAdapter: { ...source.dshAdapter, version: '0.1.1-rc.2' },
    }).status).toBe('FAIL');
  });

  it('rejects an unexpected pi-ai catalog version', () => {
    const source = validSource();
    expect(auditGemini37Catalog({
      ...source,
      catalogPackage: { ...source.catalogPackage, version: '0.84.3' },
    }).status).toBe('FAIL');
  });

  it('detects a tampered canonical audit', () => {
    const audit = auditGemini37Catalog(validSource());
    const tampered = {
      ...audit,
      capability: { ...audit.capability, contextWindow: 32 },
    };

    expect(verifyGemini37CatalogAudit(tampered)).toMatchObject({
      status: 'FAIL',
      findings: expect.arrayContaining(['AUDIT_SHA256_MISMATCH']),
    });
  });

  it('prints and explicitly writes byte-identical canonical installed-catalog evidence', () => {
    const output = join(tmpdir(), `pact-gemini37-audit-${randomUUID()}.json`);
    const script = fileURLToPath(new URL('../scripts/audit-gemini-37.mts', import.meta.url));
    const packageRoot = fileURLToPath(new URL('..', import.meta.url));

    try {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx/esm', script, '--output', output],
        { cwd: packageRoot, encoding: 'utf8', env: {} },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(readFileSync(output, 'utf8')).toBe(result.stdout);
      expect(result.stdout).not.toContain('/Users/');
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'PASS',
        route: 'google',
        model: 'gemini-3.7-flash',
        providerRequestsMade: 0,
      });
    } finally {
      rmSync(output, { force: true });
    }
  });

  it('fails closed on unsupported CLI arguments without leaking a path', () => {
    const script = fileURLToPath(new URL('../scripts/audit-gemini-37.mts', import.meta.url));
    const packageRoot = fileURLToPath(new URL('..', import.meta.url));
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx/esm', script, '--unknown'],
      { cwd: packageRoot, encoding: 'utf8', env: {} },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Gemini 3.7 catalog audit could not complete safely.\n',
    );
    expect(result.stderr).not.toContain('/Users/');
  });
});
