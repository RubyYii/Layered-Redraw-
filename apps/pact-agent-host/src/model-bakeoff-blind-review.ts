import {
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import type {
  ModelBakeoffEvidenceReport,
  ModelBakeoffPairEvidence,
  ModelBakeoffRoleDecision,
} from './model-bakeoff-evidence.js';

const sha256 = (value: string): string => createHash('sha256')
  .update(value, 'utf8')
  .digest('hex');
const canonicalSha256 = (value: unknown): string => sha256(canonicalJson(value));

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const MODEL_BAKEOFF_REVIEW_CRITERIA = deepFreeze([
  'visible-evidence fidelity',
  'spatial coherence',
  'useful uncertainty',
  'poetic/conceptual disturbance',
  'seam/dissent preservation',
  'provenance/rights discipline',
  'PACT visual-direction suitability',
] as const);

const ROLE_DECISIONS = [
  'ConductorContinuity',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
] as const satisfies readonly ModelBakeoffRoleDecision[];

export interface ModelBakeoffBlindOutput {
  readonly repetition: 1 | 2;
  readonly text: string;
  readonly outputSha256: string;
}

export interface ModelBakeoffBlindCandidate {
  readonly blindLabel: string;
  readonly outputs: readonly ModelBakeoffBlindOutput[];
}

export interface ModelBakeoffBlindRoleSection {
  readonly roleDecision: ModelBakeoffRoleDecision;
  readonly candidates: readonly ModelBakeoffBlindCandidate[];
  readonly decision: {
    readonly selectedBlindLabel: null;
    readonly authorNotes: '';
  };
}

export interface ModelBakeoffBlindPacket {
  readonly schemaVersion:
    | 'cp03-model-bakeoff-blind-review/0.1'
    | 'cp03-model-bakeoff-blind-review/0.2';
  readonly runId: string;
  readonly createdAt: string;
  readonly criteria: typeof MODEL_BAKEOFF_REVIEW_CRITERIA;
  readonly claimCeiling: string;
  readonly roles: readonly ModelBakeoffBlindRoleSection[];
  readonly packetSha256: string;
}

export interface ModelBakeoffBlindIdentityMapping {
  readonly roleDecision: ModelBakeoffRoleDecision;
  readonly blindLabel: string;
  readonly provider: ModelBakeoffPairEvidence['provider'];
  readonly route: ModelBakeoffPairEvidence['route'];
  readonly model: ModelBakeoffPairEvidence['model'];
}

export interface ModelBakeoffSealedMapping {
  readonly schemaVersion: 'cp03-model-bakeoff-sealed-mapping/0.1';
  readonly runId: string;
  readonly createdAt: string;
  readonly technicalEvidenceSha256: string;
  readonly packetSha256: string;
  readonly seedHex: string;
  readonly mappings: readonly ModelBakeoffBlindIdentityMapping[];
  readonly mappingSha256: string;
}

const unsignedEvidence = (evidence: ModelBakeoffEvidenceReport): unknown => {
  const { technicalEvidenceSha256: _hash, ...unsigned } = evidence;
  return unsigned;
};

const assertEvidenceIntegrity = (evidence: ModelBakeoffEvidenceReport): void => {
  if (
    ![
      'cp03-model-bakeoff-evidence/0.1',
      'cp03-model-bakeoff-evidence/0.2',
    ].includes(evidence.schemaVersion)
    || canonicalSha256(unsignedEvidence(evidence)) !== evidence.technicalEvidenceSha256
  ) {
    throw new Error('MODEL_BAKEOFF_TECHNICAL_EVIDENCE_HASH_INVALID');
  }
};

const candidateMessage = (pair: ModelBakeoffPairEvidence): string => [
  pair.roleDecision,
  pair.provider,
  pair.route,
  pair.model,
].join('\u0000');

const blindLabel = (
  seed: Uint8Array,
  pair: ModelBakeoffPairEvidence,
): string => `CAND_${createHmac('sha256', seed)
  .update(candidateMessage(pair), 'utf8')
  .digest('hex')
  .slice(0, 12)
  .toUpperCase()}`;

const normalizeSeed = (seed: Uint8Array | undefined): Uint8Array => {
  const value = seed === undefined ? randomBytes(32) : Uint8Array.from(seed);
  if (value.byteLength !== 32) throw new Error('MODEL_BAKEOFF_BLIND_SEED_MUST_BE_32_BYTES');
  return value;
};

export function createModelBakeoffBlindReview(input: {
  readonly evidence: ModelBakeoffEvidenceReport;
  readonly seed?: Uint8Array;
  readonly createdAt?: string;
}): {
  readonly packet: ModelBakeoffBlindPacket;
  readonly sealedMapping: ModelBakeoffSealedMapping;
} {
  assertEvidenceIntegrity(input.evidence);
  const seed = normalizeSeed(input.seed);
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error('MODEL_BAKEOFF_BLIND_CREATED_AT_INVALID');
  }

  const mappings: ModelBakeoffBlindIdentityMapping[] = [];
  const roles = ROLE_DECISIONS.map((roleDecision): ModelBakeoffBlindRoleSection => {
    const candidates = input.evidence.pairs
      .filter((pair) => pair.roleDecision === roleDecision && pair.technicallyEligible)
      .map((pair): ModelBakeoffBlindCandidate => {
        const label = blindLabel(seed, pair);
        mappings.push({
          roleDecision,
          blindLabel: label,
          provider: pair.provider,
          route: pair.route,
          model: pair.model,
        });
        return {
          blindLabel: label,
          outputs: pair.repetitions.map(({ repetition, outputText, outputSha256 }) => ({
            repetition,
            text: outputText,
            outputSha256,
          })),
        };
      })
      .sort((left, right) => left.blindLabel.localeCompare(right.blindLabel));
    return {
      roleDecision,
      candidates,
      decision: {
        selectedBlindLabel: null,
        authorNotes: '',
      },
    };
  });

  const labels = mappings.map(({ blindLabel: label }) => label);
  if (new Set(labels).size !== labels.length) {
    throw new Error('MODEL_BAKEOFF_BLIND_LABEL_COLLISION');
  }

  const replacementEvidence =
    input.evidence.schemaVersion === 'cp03-model-bakeoff-evidence/0.2';
  const partialTechnicalCoverage = replacementEvidence
    && input.evidence.pairs.some(({ technicallyEligible }) => !technicallyEligible);

  const unsignedPacket = {
    schemaVersion: replacementEvidence
      ? 'cp03-model-bakeoff-blind-review/0.2' as const
      : 'cp03-model-bakeoff-blind-review/0.1' as const,
    runId: input.evidence.runId,
    createdAt,
    criteria: MODEL_BAKEOFF_REVIEW_CRITERIA,
    claimCeiling: partialTechnicalCoverage
      ? 'anonymous two-repetition review material with partial technical coverage; author adjudication is required; no automatic selection or final routing'
      : 'anonymous two-repetition review material; author adjudication is required; no automatic selection',
    roles,
  };
  const visiblePacket = canonicalJson(unsignedPacket).toLowerCase();
  const identityTerms = [...new Set(input.evidence.pairs.flatMap((pair) => [
    pair.provider,
    pair.route,
    pair.model,
  ]).map((value) => value.toLowerCase()))];
  if (identityTerms.some((identity) => visiblePacket.includes(identity))) {
    throw new Error('MODEL_BAKEOFF_BLIND_PACKET_IDENTITY_LEAK');
  }
  const packet = deepFreeze({
    ...unsignedPacket,
    packetSha256: canonicalSha256(unsignedPacket),
  });
  const sortedMappings = mappings.sort((left, right) =>
    `${left.roleDecision}\u0000${left.blindLabel}`
      .localeCompare(`${right.roleDecision}\u0000${right.blindLabel}`)
  );
  const unsignedMapping = {
    schemaVersion: 'cp03-model-bakeoff-sealed-mapping/0.1' as const,
    runId: input.evidence.runId,
    createdAt,
    technicalEvidenceSha256: input.evidence.technicalEvidenceSha256,
    packetSha256: packet.packetSha256,
    seedHex: Buffer.from(seed).toString('hex'),
    mappings: sortedMappings,
  };
  const sealedMapping = deepFreeze({
    ...unsignedMapping,
    mappingSha256: canonicalSha256(unsignedMapping),
  });
  return deepFreeze({ packet, sealedMapping });
}
