import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly overrides?: Readonly<Record<string, string>>;
}

interface PackageLock {
  readonly packages: Readonly<Record<string, { readonly version?: string }>>;
}

const readJson = <T>(relativePath: string): T => JSON.parse(
  readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
) as T;

describe('dependency lock', () => {
  it('pins the DSH adapter family and only overrides the transitive pi-ai catalog', () => {
    const pkg = readJson<PackageManifest>('../package.json');
    const lock = readJson<PackageLock>('../package-lock.json');
    const directDsh = Object.entries(pkg.dependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'));

    expect(directDsh.length).toBeGreaterThan(0);
    expect(new Set(directDsh.map(([, version]) => version)))
      .toEqual(new Set(['0.1.0-rc.6']));
    expect(pkg.overrides).toEqual({
      '@earendil-works/pi-ai': '0.84.2',
    });
    expect(lock.packages['node_modules/@deepseek-ai/dsh-llm-pi-ai']?.version)
      .toBe('0.1.0-rc.6');
    expect(lock.packages['node_modules/@earendil-works/pi-ai']?.version)
      .toBe('0.84.2');

    const directPackages = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    });
    const directGeminiSdks = directPackages.filter((name) =>
      name === '@earendil-works/pi-ai'
      || name === '@google/generative-ai'
      || name.toLowerCase().includes('gemini')
      || name.toLowerCase().includes('generative-ai')
    );

    expect(directGeminiSdks).toEqual([]);
  });
});
