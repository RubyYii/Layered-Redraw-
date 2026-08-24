import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';

const sha256 = (value: string | Uint8Array): string => createHash('sha256')
  .update(value)
  .digest('hex');

describe('model bakeoff fixtures', () => {
  it('binds the synthetic image and frozen manifests to exact independent hashes', () => {
    const fixtures = createModelBakeoffFixtures();
    const { fixtureManifestSha256, ...unsignedManifest } = fixtures.manifest;

    expect(fixtures.manifest).toMatchObject({
      schemaVersion: 'cp03-model-bakeoff-fixtures/0.2',
      syntheticImage: {
        inputRefId: 'synthetic-spatial-image-01',
        mediaType: 'image/png',
        width: 384,
        height: 256,
        byteLength: 2_287,
        sha256: '138a8df995ff3d991c2b62b44673148d5286b8c2973ca08095225a9fcd3a6f27',
      },
      promptManifestSha256:
        '04a650d91227e3757881cd2e0bf72a9ce1069edd3e35dfee1c38681bdc136e65',
      schemaManifestSha256:
        '231bea0a134a514aa143e8d049ce1eb9e9935d0302820a5a53c98738cbb9138d',
      fixtureManifestSha256:
        '3dff87b785fe64b2adbe4a63ebad04b36fc6ebef289067b42802544bb4477c50',
    });
    expect(sha256(fixtures.syntheticImage)).toBe(fixtures.manifest.syntheticImage.sha256);
    expect(sha256(canonicalJson(fixtures.promptManifest))).toBe(
      fixtures.manifest.promptManifestSha256,
    );
    expect(sha256(canonicalJson(fixtures.schemaManifest))).toBe(
      fixtures.manifest.schemaManifestSha256,
    );
    expect(sha256(canonicalJson(unsignedManifest))).toBe(fixtureManifestSha256);
  });

  it('uses only explicit synthetic IDs and fictional uncertainty', () => {
    const { manifest } = createModelBakeoffFixtures();
    const scene = manifest.sceneSnapshot as {
      readonly objects: readonly { readonly id: string }[];
      readonly ambiguousOverlaps: readonly unknown[];
    };
    const registry = manifest.registry as {
      readonly entries: readonly {
        readonly id: string;
        readonly provenance: string;
        readonly productionAsset: boolean;
      }[];
    };

    expect(scene.objects).toHaveLength(8);
    expect(scene.objects.every(({ id }) => id.startsWith('synthetic-'))).toBe(true);
    expect(scene.ambiguousOverlaps).toHaveLength(2);
    expect(registry.entries.map(({ id }) => id)).toEqual(
      scene.objects.map(({ id }) => id),
    );
    expect(registry.entries.every((entry) =>
      entry.provenance === 'programmatic-test-fixture' && !entry.productionAsset
    )).toBe(true);
    expect(manifest.rights).toEqual([
      'rights_synthetic_fixture',
    ]);
    expect(manifest.rollbackCapabilities).toEqual([
      'restore-scene-snapshot',
      'release-object-claim',
    ]);
    expect(manifest.fictionalText).toMatch(/fictional/i);
    expect(manifest.fictionalText).toMatch(/ambiguous.*uncertainty/i);
    expect(manifest.fictionalText).toMatch(
      /no claim about a real memory, person, source image, asset, or licence/i,
    );
  });

  it('separates model-facing submissions from canonical accepted payloads', () => {
    const fixtures = createModelBakeoffFixtures();
    expect(fixtures.promptManifest.schemaVersion)
      .toBe('cp03-model-bakeoff-prompts/0.2');
    expect(fixtures.schemaManifest).toMatchObject({
      schemaVersion: 'cp03-model-bakeoff-schemas/0.2',
      phases: {
        Witness: {
          role: 'Witness',
          tool: 'pact_submit_council_shard',
          modelFacingContract: 'council-role-submission/0.1',
          acceptedCanonicalContract: 'cp03-council/0.2',
        },
        ConductorCommit: {
          role: 'CaseConductor',
          tool: 'pact_submit_conductor_commit',
          modelFacingContract: 'conductor-commit-submission/0.1',
          acceptedCanonicalContract: 'cp03-council/0.2',
        },
      },
    });
    expect(fixtures.promptManifest.templates.Witness).toMatch(/submission/i);
    expect(fixtures.promptManifest.templates.Witness).not.toMatch(
      /session|turnId|snapshotHash|schemaVersion/i,
    );
  });

  it('returns deeply frozen manifests without sharing mutable image bytes', () => {
    const first = createModelBakeoffFixtures();
    const second = createModelBakeoffFixtures();

    expect(Object.isFrozen(first.manifest)).toBe(true);
    expect(Object.isFrozen(first.manifest.sceneSnapshot)).toBe(true);
    expect(Object.isFrozen(first.promptManifest)).toBe(true);
    expect(Object.isFrozen(first.schemaManifest)).toBe(true);
    expect(first.syntheticImage).not.toBe(second.syntheticImage);
    expect(first.syntheticImage).toEqual(second.syntheticImage);
  });
});
