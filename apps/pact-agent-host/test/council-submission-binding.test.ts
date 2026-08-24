import { SessionId } from '@deepseek-ai/dsh-session';
import {
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';
import { describe, expect, it } from 'vitest';

import {
  bindConductorCommitSubmission,
  bindCouncilRoleSubmission,
  type ConductorCommitSubmission,
  type CouncilRoleSubmission,
} from '../src/council-submission-binding.js';
import {
  CouncilToolBindingRegistry,
} from '../src/council-tool-binding.js';
import { freezeCouncilTurn } from '../src/council-turn.js';
import type { CouncilShard } from '../src/contract-types.js';
import {
  createFullCouncilFixtures,
  fullCouncilTurnInput,
} from './council-fixtures.js';

const witnessSessionId = SessionId('550e8400-e29b-41d4-a716-446655440099');
const conductorSessionId = SessionId('550e8400-e29b-41d4-a716-446655440098');

const submissionFor = (shard: CouncilShard): CouncilRoleSubmission => ({
  publicTrace: shard.publicTrace,
  uncertainties: shard.uncertainties,
  evidenceAnchors: shard.evidenceAnchors,
  content: shard.content,
});

describe('council tool binding and deterministic submission binding', () => {
  it('leases one frozen session, role, phase, and turn binding fail-closed', async () => {
    const { turn } = await createFullCouncilFixtures();
    const bindings = new CouncilToolBindingRegistry();
    const release = bindings.bind({
      sessionId: witnessSessionId,
      role: 'Witness',
      phase: 'SHARD',
      turn,
    });

    const bound = bindings.require(witnessSessionId);
    expect(bound).toMatchObject({
      sessionId: witnessSessionId,
      role: 'Witness',
      phase: 'SHARD',
      turn,
    });
    expect(Object.isFrozen(bound)).toBe(true);
    expect(() => bindings.bind({
      sessionId: witnessSessionId,
      role: 'Guardian',
      phase: 'SHARD',
      turn,
    })).toThrow('PACT_COUNCIL_TOOL_BINDING_CONFLICT');
    expect(() => bindings.bind({
      sessionId: witnessSessionId,
      role: 'Witness',
      phase: 'CONDUCTOR_COMMIT',
      turn,
    })).toThrow('PACT_COUNCIL_TOOL_BINDING_CONFLICT');

    release();
    expect(() => bindings.require(witnessSessionId))
      .toThrow('PACT_COUNCIL_TOOL_BINDING_REQUIRED');
  });

  it('binds deterministic canonical shard identity without changing agent content', async () => {
    const fixtures = await createFullCouncilFixtures();
    const bindings = new CouncilToolBindingRegistry();
    bindings.bind({
      sessionId: witnessSessionId,
      role: 'Witness',
      phase: 'SHARD',
      turn: fixtures.turn,
    });
    const binding = bindings.require(witnessSessionId);
    const submission = submissionFor(fixtures.shards.Witness);

    const first = bindCouncilRoleSubmission({
      binding,
      turn: fixtures.turn,
      submission,
    });
    const second = bindCouncilRoleSubmission({
      binding,
      turn: fixtures.turn,
      submission,
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaVersion: 'cp03-council/0.2',
      role: 'Witness',
      kind: 'WITNESS',
      childSessionId: String(witnessSessionId),
      caseSessionId: fixtures.turn.snapshot.caseSessionId,
      turnId: fixtures.turn.snapshot.turnId,
      snapshotHash: fixtures.turn.snapshotHash,
      parentSceneHash: fixtures.turn.snapshot.parentSceneHash,
      registryVersion: fixtures.turn.snapshot.registryVersion,
      routingManifestVersion: fixtures.turn.snapshot.routingManifestVersion,
      deadlineId: fixtures.turn.snapshot.deadlineId,
    });
    expect(first.shardId).toMatch(/^shard_[a-f0-9]{64}$/);
    expect({
      publicTrace: first.publicTrace,
      uncertainties: first.uncertainties,
      evidenceAnchors: first.evidenceAnchors,
      content: first.content,
    }).toEqual(submission);
    expect(validateCouncilShard(first)).toBe(first);
  });

  it('rejects wrappers, model-authored runtime fields, role-content forgery, and stale turns', async () => {
    const fixtures = await createFullCouncilFixtures();
    const bindings = new CouncilToolBindingRegistry();
    bindings.bind({
      sessionId: witnessSessionId,
      role: 'Witness',
      phase: 'SHARD',
      turn: fixtures.turn,
    });
    const binding = bindings.require(witnessSessionId);
    const witness = submissionFor(fixtures.shards.Witness);

    expect(() => bindCouncilRoleSubmission({
      binding,
      turn: fixtures.turn,
      submission: { shard: witness },
    })).toThrow(/validation failed/);
    expect(() => bindCouncilRoleSubmission({
      binding,
      turn: fixtures.turn,
      submission: { ...witness, turnId: fixtures.turn.snapshot.turnId },
    })).toThrow(/additionalProperties/);
    expect(() => bindCouncilRoleSubmission({
      binding,
      turn: fixtures.turn,
      submission: submissionFor(fixtures.shards.Archivist),
    })).toThrow(/validation failed/);

    const otherTurn = await freezeCouncilTurn({
      ...fullCouncilTurnInput,
      turnId: 'turn_council02',
      deadlineId: 'deadline_council02',
      now: () => 1_000,
    });
    expect(() => bindCouncilRoleSubmission({
      binding,
      turn: otherTurn,
      submission: witness,
    })).toThrow('PACT_COUNCIL_TOOL_BINDING_STALE');
  });

  it('binds a minimal commit only for the persistent Conductor commit phase', async () => {
    const fixtures = await createFullCouncilFixtures();
    const submission: ConductorCommitSubmission = {
      actionSequence: ['Reframe', 'Continue'],
      selectedShardHashes: ['c'.repeat(64), 'd'.repeat(64)],
      selectedDissentIds: ['dissent_guardian01'],
      terminalIntent: 'Continue',
    };
    const bindings = new CouncilToolBindingRegistry();
    bindings.bind({
      sessionId: conductorSessionId,
      role: 'CaseConductor',
      phase: 'CONDUCTOR_COMMIT',
      turn: fixtures.turn,
    });

    const commit = bindConductorCommitSubmission({
      binding: bindings.require(conductorSessionId),
      turn: fixtures.turn,
      submission,
    });
    expect(commit).toEqual({
      schemaVersion: 'cp03-council/0.2',
      turnId: fixtures.turn.snapshot.turnId,
      status: 'PROPOSED',
      ...submission,
    });
    expect(validateConductorDraftCommit(commit)).toBe(commit);

    const wrongPhase = new CouncilToolBindingRegistry();
    wrongPhase.bind({
      sessionId: conductorSessionId,
      role: 'CaseConductor',
      phase: 'SHARD',
      turn: fixtures.turn,
    });
    expect(() => bindConductorCommitSubmission({
      binding: wrongPhase.require(conductorSessionId),
      turn: fixtures.turn,
      submission,
    })).toThrow('PACT_COUNCIL_TOOL_PHASE_MISMATCH');
  });
});
