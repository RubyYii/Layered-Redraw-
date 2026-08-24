import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

const require = createRequire(import.meta.url);
const DSH_ADAPTER_NAME = '@deepseek-ai/dsh-llm-pi-ai';
const PI_AI_CATALOG_NAME = '@earendil-works/pi-ai';
const GOOGLE_ROUTE = 'google';
const GEMINI_37_MODEL = 'gemini-3.7-flash';

export interface Gemini37CatalogSource {
  readonly dshAdapter: {
    readonly name: '@deepseek-ai/dsh-llm-pi-ai';
    readonly version: string;
  };
  readonly catalogPackage: {
    readonly name: '@earendil-works/pi-ai';
    readonly version: string;
  };
  readonly entries: readonly {
    readonly provider: string;
    readonly id: string;
    readonly name: string;
    readonly inputModalities: readonly string[];
    readonly contextWindow: number | null;
    readonly defaultMaxTokens: number | null;
  }[];
}

export interface Gemini37CatalogAudit {
  readonly schemaVersion: 'cp03-model-catalog-audit/0.1';
  readonly status: 'PASS' | 'FAIL';
  readonly route: 'google';
  readonly model: 'gemini-3.7-flash';
  readonly packages: Gemini37CatalogSource['dshAdapter'] & {
    readonly catalogName: '@earendil-works/pi-ai';
    readonly catalogVersion: string;
  };
  readonly capability: {
    readonly inputModalities: readonly string[];
    readonly contextWindow: number | null;
    readonly defaultMaxTokens: number | null;
  };
  readonly findings: readonly string[];
  readonly providerRequestsMade: 0;
  readonly auditSha256: string;
}

interface InstalledPackage {
  readonly name: string;
  readonly version: string;
  readonly root: string;
}

interface PiCatalogModel {
  readonly id: string;
  readonly contextWindow: number | null;
  readonly maxTokens: number | null;
}

const readInstalledPackage = (
  expectedName: string,
  resolvedEntry = require.resolve(expectedName),
): InstalledPackage => {
  const entry = resolvedEntry;
  let cursor = dirname(entry);

  while (true) {
    const candidate = join(cursor, 'package.json');
    if (existsSync(candidate)) {
      const parsed: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`PACKAGE_MANIFEST_INVALID: ${expectedName}`);
      }
      const manifest = parsed as Record<string, unknown>;
      if (manifest.name !== expectedName) {
        throw new Error(`PACKAGE_NAME_MISMATCH: ${expectedName}`);
      }
      if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
        throw new Error(`PACKAGE_VERSION_UNRESOLVED: ${expectedName}`);
      }
      return { name: expectedName, version: manifest.version, root: cursor };
    }

    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error(`PACKAGE_MANIFEST_UNRESOLVED: ${expectedName}`);
    }
    cursor = parent;
  }
};

const resolveDependencyEntry = (
  fromRoot: string,
  packageName: string,
  packageEntry: string,
): string => {
  let cursor = fromRoot;
  const packageSegments = packageName.split('/');

  while (true) {
    const candidate = join(cursor, 'node_modules', ...packageSegments, packageEntry);
    if (existsSync(candidate)) return require.resolve(candidate);

    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error(`PACKAGE_ENTRY_UNRESOLVED: ${packageName}`);
    }
    cursor = parent;
  }
};

const auditHash = (audit: Omit<Gemini37CatalogAudit, 'auditSha256'>): string =>
  createHash('sha256').update(canonicalJson(audit), 'utf8').digest('hex');

export function auditGemini37Catalog(
  source: Gemini37CatalogSource,
): Gemini37CatalogAudit {
  const exact = source.entries.filter((entry) =>
    entry.provider === GOOGLE_ROUTE && entry.id === GEMINI_37_MODEL
  );
  const capability = exact[0];
  const findings: string[] = [];

  if (exact.length === 0) findings.push('EXACT_GOOGLE_MODEL_MISSING');
  if (exact.length > 1) findings.push('EXACT_GOOGLE_MODEL_DUPLICATED');
  if (source.dshAdapter.version !== '0.1.0-rc.6') {
    findings.push('DSH_ADAPTER_VERSION_MISMATCH');
  }
  if (source.catalogPackage.version !== '0.84.2') {
    findings.push('PI_AI_CATALOG_VERSION_MISMATCH');
  }
  if (!capability?.inputModalities.includes('text')) {
    findings.push('TEXT_MODALITY_MISSING');
  }
  if (!capability?.inputModalities.includes('image')) {
    findings.push('IMAGE_MODALITY_MISSING');
  }
  if (!Number.isInteger(capability?.contextWindow) || capability!.contextWindow! <= 0) {
    findings.push('CONTEXT_WINDOW_INVALID');
  }
  if (
    !Number.isInteger(capability?.defaultMaxTokens)
    || capability!.defaultMaxTokens! <= 0
  ) {
    findings.push('DEFAULT_MAX_TOKENS_INVALID');
  }

  const pass = exact.length === 1
    && source.dshAdapter.version === '0.1.0-rc.6'
    && source.catalogPackage.version === '0.84.2'
    && exact[0]!.inputModalities.includes('text')
    && exact[0]!.inputModalities.includes('image')
    && Number.isInteger(exact[0]!.contextWindow)
    && exact[0]!.contextWindow! > 0
    && Number.isInteger(exact[0]!.defaultMaxTokens)
    && exact[0]!.defaultMaxTokens! > 0;

  const unsigned: Omit<Gemini37CatalogAudit, 'auditSha256'> = {
    schemaVersion: 'cp03-model-catalog-audit/0.1',
    status: pass ? 'PASS' : 'FAIL',
    route: GOOGLE_ROUTE,
    model: GEMINI_37_MODEL,
    packages: {
      name: source.dshAdapter.name,
      version: source.dshAdapter.version,
      catalogName: source.catalogPackage.name,
      catalogVersion: source.catalogPackage.version,
    },
    capability: {
      inputModalities: [...(capability?.inputModalities ?? [])],
      contextWindow: capability?.contextWindow ?? null,
      defaultMaxTokens: capability?.defaultMaxTokens ?? null,
    },
    findings,
    providerRequestsMade: 0,
  };

  return { ...unsigned, auditSha256: auditHash(unsigned) };
}

export function verifyGemini37CatalogAudit(
  audit: Gemini37CatalogAudit,
): { readonly status: 'PASS' | 'FAIL'; readonly findings: readonly string[] } {
  const findings: string[] = [];
  const requireFact = (condition: boolean, finding: string): void => {
    if (!condition) findings.push(finding);
  };

  requireFact(
    audit.schemaVersion === 'cp03-model-catalog-audit/0.1',
    'SCHEMA_VERSION_MISMATCH',
  );
  requireFact(audit.status === 'PASS', 'AUDIT_STATUS_NOT_PASS');
  requireFact(audit.route === GOOGLE_ROUTE, 'ROUTE_MISMATCH');
  requireFact(audit.model === GEMINI_37_MODEL, 'MODEL_MISMATCH');
  requireFact(audit.packages.name === DSH_ADAPTER_NAME, 'DSH_ADAPTER_NAME_MISMATCH');
  requireFact(audit.packages.version === '0.1.0-rc.6', 'DSH_ADAPTER_VERSION_MISMATCH');
  requireFact(
    audit.packages.catalogName === PI_AI_CATALOG_NAME,
    'PI_AI_CATALOG_NAME_MISMATCH',
  );
  requireFact(
    audit.packages.catalogVersion === '0.84.2',
    'PI_AI_CATALOG_VERSION_MISMATCH',
  );
  requireFact(audit.capability.inputModalities.includes('text'), 'TEXT_MODALITY_MISSING');
  requireFact(audit.capability.inputModalities.includes('image'), 'IMAGE_MODALITY_MISSING');
  requireFact(
    Number.isInteger(audit.capability.contextWindow)
      && audit.capability.contextWindow! > 0,
    'CONTEXT_WINDOW_INVALID',
  );
  requireFact(
    Number.isInteger(audit.capability.defaultMaxTokens)
      && audit.capability.defaultMaxTokens! > 0,
    'DEFAULT_MAX_TOKENS_INVALID',
  );
  requireFact(audit.findings.length === 0, 'AUDIT_FINDINGS_NOT_EMPTY');
  requireFact(audit.providerRequestsMade === 0, 'PROVIDER_REQUESTS_NONZERO');

  const { auditSha256, ...unsigned } = audit;
  requireFact(auditSha256 === auditHash(unsigned), 'AUDIT_SHA256_MISMATCH');

  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings,
  };
}

const readPiCatalogModels = (
  catalogPackage: InstalledPackage,
): readonly PiCatalogModel[] => {
  const catalogPath = join(
    catalogPackage.root,
    'dist',
    'providers',
    'data',
    'google.json',
  );
  const parsed: unknown = JSON.parse(readFileSync(catalogPath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('PI_AI_GOOGLE_CATALOG_INVALID');
  }

  return Object.values(parsed).flatMap((group): PiCatalogModel[] => {
    if (typeof group !== 'object' || group === null || Array.isArray(group)) return [];
    return Object.values(group).flatMap((value): PiCatalogModel[] => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
      const model = value as Record<string, unknown>;
      if (typeof model.id !== 'string') return [];
      return [{
        id: model.id,
        contextWindow: typeof model.contextWindow === 'number'
          ? model.contextWindow
          : null,
        maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : null,
      }];
    });
  });
};

export async function inspectInstalledGemini37Catalog(): Promise<Gemini37CatalogSource> {
  const dshAdapter = readInstalledPackage(DSH_ADAPTER_NAME);
  const piAiEntry = resolveDependencyEntry(
    dshAdapter.root,
    PI_AI_CATALOG_NAME,
    join('dist', 'index.js'),
  );
  const catalogPackage = readInstalledPackage(PI_AI_CATALOG_NAME, piAiEntry);
  const ctx = new Context();

  try {
    await ctx.plugin(LlmRuntime);
    const piAiLlm = await import(DSH_ADAPTER_NAME);
    await ctx.plugin(piAiLlm, { providers: { [GOOGLE_ROUTE]: {} } });

    const [listed, catalogModels] = await Promise.all([
      ctx.llm.listModels(GOOGLE_ROUTE),
      Promise.resolve(readPiCatalogModels(catalogPackage)),
    ]);
    const catalogById = new Map(catalogModels.map((model) => [model.id, model]));

    return {
      dshAdapter: {
        name: DSH_ADAPTER_NAME,
        version: dshAdapter.version,
      },
      catalogPackage: {
        name: PI_AI_CATALOG_NAME,
        version: catalogPackage.version,
      },
      entries: listed.map((entry) => {
        const catalog = catalogById.get(entry.id);
        return {
          provider: entry.provider,
          id: entry.id,
          name: entry.name,
          inputModalities: [...(entry.inputModalities ?? [])],
          contextWindow: catalog?.contextWindow ?? null,
          defaultMaxTokens: catalog?.maxTokens ?? null,
        };
      }),
    };
  } finally {
    await ctx.fiber.dispose();
  }
}
