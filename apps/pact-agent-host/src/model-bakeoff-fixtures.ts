import { createHash } from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import { createSyntheticSpatialImage } from './synthetic-spatial-image.js';

export interface ModelBakeoffFixtureManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-fixtures/0.2';
  readonly fictionalText: string;
  readonly syntheticImage: {
    readonly inputRefId: 'synthetic-spatial-image-01';
    readonly mediaType: 'image/png';
    readonly width: 384;
    readonly height: 256;
    readonly byteLength: number;
    readonly sha256: string;
  };
  readonly sceneSnapshot: Readonly<Record<string, unknown>>;
  readonly registry: Readonly<Record<string, unknown>>;
  readonly rights: readonly string[];
  readonly rollbackCapabilities: readonly string[];
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly fixtureManifestSha256: string;
}

export interface ModelBakeoffPromptManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-prompts/0.2';
  readonly templates: Readonly<Record<string, string>>;
}

export interface ModelBakeoffSchemaManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-schemas/0.2';
  readonly phases: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface ModelBakeoffFixtures {
  readonly manifest: ModelBakeoffFixtureManifest;
  readonly syntheticImage: Uint8Array;
  readonly promptManifest: ModelBakeoffPromptManifest;
  readonly schemaManifest: ModelBakeoffSchemaManifest;
}

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      deepFreeze(entry);
    }
    Object.freeze(value);
  }
  return value;
};

const sha256Bytes = (bytes: Uint8Array): string => createHash('sha256')
  .update(bytes)
  .digest('hex');

const sha256Canonical = (value: unknown): string => createHash('sha256')
  .update(canonicalJson(value), 'utf8')
  .digest('hex');

const promptManifest = deepFreeze<ModelBakeoffPromptManifest>({
  schemaVersion: 'cp03-model-bakeoff-prompts/0.2',
  templates: {
    ConductorIntent:
      'Submit exactly one CaseConductor role submission from the fictional fixture. Preserve uncertainty and use no unregistered source, asset, licence, permission, URL, path, or code.',
    Archivist:
      'Submit exactly one Archivist role submission from the fictional fixture. Bind every provenance or rights reference to the supplied synthetic registry facts and invent nothing.',
    Guardian:
      'Submit exactly one Guardian role submission from the fictional fixture. Preserve dissent, identify unsupported authority, and withhold any action that exceeds registered synthetic capabilities.',
    ConductorCommit:
      'Submit exactly one minimal CaseConductor commit submission selecting only the durable shard hashes supplied for this fictional fixture; add no new evidence or creative content.',
    Witness:
      'Submit exactly one Witness role submission grounded in inputRefId synthetic-spatial-image-01. Describe visible spatial relations and explicit uncertainty without claiming a real person, memory, source image, asset, or licence.',
    Rewriter:
      'Submit exactly one Rewriter role submission grounded in inputRefId synthetic-spatial-image-01 and the immutable synthetic scene. Propose typed poetic and spatial intent while preserving seams and ambiguity.',
  },
});

const schemaManifest = deepFreeze<ModelBakeoffSchemaManifest>({
  schemaVersion: 'cp03-model-bakeoff-schemas/0.2',
  phases: {
    ConductorIntent: {
      role: 'CaseConductor',
      tool: 'pact_submit_council_shard',
      modelFacingContract: 'council-role-submission/0.1',
      acceptedCanonicalContract: 'cp03-council/0.2',
    },
    Archivist: {
      role: 'Archivist',
      tool: 'pact_submit_council_shard',
      modelFacingContract: 'council-role-submission/0.1',
      acceptedCanonicalContract: 'cp03-council/0.2',
    },
    Guardian: {
      role: 'Guardian',
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
    Witness: {
      role: 'Witness',
      tool: 'pact_submit_council_shard',
      modelFacingContract: 'council-role-submission/0.1',
      acceptedCanonicalContract: 'cp03-council/0.2',
    },
    Rewriter: {
      role: 'Rewriter',
      tool: 'pact_submit_council_shard',
      modelFacingContract: 'council-role-submission/0.1',
      acceptedCanonicalContract: 'cp03-council/0.2',
    },
  },
});

const sceneSnapshot = deepFreeze({
  schemaVersion: 'cp03-synthetic-scene/0.1',
  sceneId: 'synthetic-scene-01',
  revision: 1,
  objects: [
    { id: 'synthetic-window-01', kind: 'window', relation: 'rear-wall' },
    { id: 'synthetic-bed-01', kind: 'bed', relation: 'left-floor' },
    { id: 'synthetic-table-01', kind: 'table', relation: 'centre-right-floor' },
    { id: 'synthetic-chair-01', kind: 'chair', relation: 'right-of-table' },
    { id: 'synthetic-cup-01', kind: 'cup', relation: 'on-table' },
    {
      id: 'synthetic-thermos-01',
      kind: 'thermos',
      relation: 'between-window-and-table',
    },
    {
      id: 'synthetic-source-plane-01',
      kind: 'source-plane',
      relation: 'behind-bed-ambiguous',
    },
    { id: 'synthetic-floor-grid-01', kind: 'floor-grid', relation: 'under-all' },
  ],
  ambiguousOverlaps: [
    {
      between: ['synthetic-source-plane-01', 'synthetic-bed-01'],
      uncertainty: 'depth-order-underdetermined',
    },
    {
      between: ['synthetic-thermos-01', 'synthetic-window-01'],
      uncertainty: 'boundary-ownership-underdetermined',
    },
  ],
});

const registry = deepFreeze({
  schemaVersion: 'cp03-synthetic-registry/0.1',
  entries: sceneSnapshot.objects.map((object) => ({
    id: object.id,
    kind: object.kind,
    provenance: 'programmatic-test-fixture',
    productionAsset: false,
    mutable: object.kind !== 'window' && object.kind !== 'floor-grid',
  })),
});

export function createModelBakeoffFixtures(): ModelBakeoffFixtures {
  const syntheticImage = createSyntheticSpatialImage();
  const unsignedManifest = {
    schemaVersion: 'cp03-model-bakeoff-fixtures/0.2' as const,
    fictionalText:
      'A fictional room contains a rear window, bed, table, chair, cup, thermos, source plane, and floor grid. Two overlaps are deliberately ambiguous; describe uncertainty rather than resolving either relation. This is synthetic test material and makes no claim about a real memory, person, source image, asset, or licence.',
    syntheticImage: {
      inputRefId: 'synthetic-spatial-image-01' as const,
      mediaType: 'image/png' as const,
      width: 384 as const,
      height: 256 as const,
      byteLength: syntheticImage.byteLength,
      sha256: sha256Bytes(syntheticImage),
    },
    sceneSnapshot,
    registry,
    rights: ['rights_synthetic_fixture'] as const,
    rollbackCapabilities: [
      'restore-scene-snapshot',
      'release-object-claim',
    ] as const,
    promptManifestSha256: sha256Canonical(promptManifest),
    schemaManifestSha256: sha256Canonical(schemaManifest),
  };
  const manifest = deepFreeze<ModelBakeoffFixtureManifest>({
    ...unsignedManifest,
    fixtureManifestSha256: sha256Canonical(unsignedManifest),
  });

  return {
    manifest,
    syntheticImage,
    promptManifest,
    schemaManifest,
  };
}
