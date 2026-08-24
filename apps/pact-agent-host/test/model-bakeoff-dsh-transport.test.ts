import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import {
  CallId,
  LlmAdapter,
  ReasoningEffortId,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import {
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createModelBakeoffDshTransport,
  type ModelBakeoffDshDiagnostic,
  type ModelBakeoffPromptContext,
} from '../src/model-bakeoff-dsh-transport.js';
import { coldInspect } from '../src/create-foundation-harness.js';
import { createModelBakeoffFixtures } from '../src/model-bakeoff-fixtures.js';
import {
  createModelBakeoffPlan,
  type ModelBakeoffCase,
} from '../src/model-bakeoff-plan.js';
import type { ModelBakeoffDispatchRequest } from '../src/model-bakeoff-runner.js';

const roots: string[] = [];
const SECRET_SENTINELS = ['deepseek-secret-must-not-leak', 'gemini-secret-must-not-leak'];

afterEach(() => {
  roots.splice(0);
});

const testRoot = (label: string): string => {
  const root = join(tmpdir(), `pact-bakeoff-${label}-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
};

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

const promptContext = (options: GenerateOptions): ModelBakeoffPromptContext => {
  const text = options.messages.flatMap(({ content }) => content)
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map(({ text: value }) => value)
    .join('\n');
  const marker = 'PACT_BAKEOFF_CONTEXT_JSON=';
  const line = text.split('\n').filter((candidate) => candidate.startsWith(marker)).at(-1);
  if (line === undefined) throw new Error('scripted adapter did not receive bakeoff context');
  return JSON.parse(line.slice(marker.length)) as ModelBakeoffPromptContext;
};

const promptJson = <T>(
  options: GenerateOptions,
  marker: string,
): T | undefined => {
  const line = options.messages.flatMap(({ content }) => content)
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .flatMap(({ text }) => text.split('\n'))
    .filter((candidate) => candidate.startsWith(marker))
    .at(-1);
  return line === undefined ? undefined : JSON.parse(line.slice(marker.length)) as T;
};

interface PromptToolRules {
  readonly argumentShape: string;
  readonly outputSchemaVersion: string;
  readonly outputKind: string;
  readonly outputRole: string;
  readonly semanticCapabilityId: string;
  readonly registeredRightsIds: readonly string[];
}

const toolRules = (options: GenerateOptions): PromptToolRules | undefined =>
  promptJson<PromptToolRules>(options, 'PACT_BAKEOFF_TOOL_ARGUMENT_RULES_JSON=');

const shardFor = (
  options: GenerateOptions,
  context: ModelBakeoffPromptContext,
): unknown => {
  if (options.sessionId === undefined) throw new Error('DSH session identity missing');
  const suffix = sha(context.caseId).slice(0, 16);
  const base = {
    schemaVersion: 'cp03-council/0.2',
    shardId: `shard_${suffix}`,
    kind: context.role === 'CaseConductor'
      ? 'CONDUCTOR_INTENT'
      : context.role.toUpperCase(),
    role: context.role,
    childSessionId: String(options.sessionId),
    caseSessionId: context.turn.caseSessionId,
    turnId: context.turn.turnId,
    snapshotHash: context.turn.snapshotHash,
    parentSceneHash: context.turn.parentSceneHash,
    registryVersion: context.turn.registryVersion,
    routingManifestVersion: context.turn.routingManifestVersion,
    deadlineId: context.turn.deadlineId,
    publicTrace: `Synthetic ${context.role} contribution preserves ambiguity.`,
    uncertainties: ['Synthetic overlap remains deliberately unresolved.'],
    evidenceAnchors: context.imageInputRefId === null
      ? ['synthetic-scene-01']
      : ['synthetic-scene-01', context.imageInputRefId],
  };
  const content = context.role === 'CaseConductor'
    ? {
      initialInterpretation: 'Treat the fictional room as bounded synthetic evidence.',
      candidateActionSequence: ['Reframe', 'Continue'],
      roleRelevance: {
        CaseConductor: 'Selects the bounded trajectory.',
        Witness: 'Checks visible synthetic relations.',
        Archivist: 'Checks synthetic provenance.',
        Rewriter: 'Proposes bounded scene language.',
        Guardian: 'Preserves dissent and limits.',
      },
      terminalIntent: 'Continue',
    }
    : context.role === 'Witness'
      ? {
        observations: [{
          observationId: `observation_${suffix}`,
          text: 'The synthetic image shows an unresolved source-plane overlap.',
          inputRefIds: ['synthetic-spatial-image-01'],
        }],
      }
      : context.role === 'Archivist'
        ? {
          requestedAssetIds: ['synthetic-cup-01'],
          requestedSpatialBridgeIds: ['synthetic-spatial-bridge-01'],
          provenanceAnchors: ['synthetic-scene-01'],
          rightsRequirements: ['rights_synthetic_fixture'],
          unavailableRefs: [],
        }
        : context.role === 'Rewriter'
          ? {
            interpretation: 'Keep the source-plane seam visible.',
            unresolvedAmbiguities: ['Depth order remains unresolved.'],
            spatialIntent: 'Reframe only through the registered synthetic bridge.',
            visualIntent: 'Preserve the synthetic overlap.',
            cameraIntent: 'Hold a lateral relation.',
            lightIntent: 'Keep one restrained edge light.',
            soundIntent: 'Use fictional room tone only.',
            publicPoeticText: 'The grid leans; the source stays open.',
            seamsAndContradictionsToPreserve: ['Near and not-near remain visible.'],
            semanticCapabilityCalls: [{
              capability: 'performRegisteredInteraction',
              arguments: {
                actorId: 'synthetic-actor-01',
                targetId: 'synthetic-cup-01',
                affordance: 'pickup',
              },
            }],
            expectedChanges: ['synthetic-actor-01', 'synthetic-cup-01'],
          }
          : {
            disposition: 'ALLOW',
            forbiddenCapabilityIds: ['rawTransform'],
            requiredSourceLockIds: ['synthetic-source-plane-01'],
            requiredRightsIds: ['rights_synthetic_fixture'],
            requiredRollbackCapabilityIds: ['restore-scene-snapshot'],
            contestedEvidenceIds: ['synthetic-spatial-image-01'],
            requiredDissentRecords: [{
              dissentId: `dissent_${suffix}`,
              text: 'Do not turn an ambiguous overlap into recovered fact.',
              evidenceIds: ['synthetic-scene-01'],
            }],
            guardianChallenge: 'Execute only within the synthetic registry.',
          };
  return { ...base, content };
};

const responseFor = (
  callId: string,
  name: string,
  args: unknown,
): readonly StreamChunk[] => {
  const id = CallId(callId);
  const rawArguments = JSON.stringify(args);
  return [
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 25 } },
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: rawArguments },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id, name, arguments: rawArguments },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
};

const terminalTextResponse = (
  reason: Extract<StreamChunk, { type: 'finish' }>['reason'],
): readonly StreamChunk[] => [
  { type: 'usage', usage: { inputTokens: 100, outputTokens: 25 } },
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'Synthetic response ended before a tool call.' },
  {
    type: 'block-end',
    index: 0,
    block: { type: 'text', text: 'Synthetic response ended before a tool call.' },
  },
  { type: 'finish', reason },
];

abstract class ReasoningAwareScriptedAdapter extends LlmAdapter {
  override async resolveModel(provider: string, model: string) {
    const resolved = await super.resolveModel(provider, model);
    if (model !== 'gemini-3.7-flash') return resolved;
    return {
      ...resolved,
      reasoning: {
        efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }],
      },
    };
  }
}

class BakeoffScriptedAdapter extends ReasoningAwareScriptedAdapter {
  readonly requests: GenerateOptions[] = [];

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const context = promptContext(options);
    if (context.phase === 'ConductorCommit') {
      const commit = validateConductorDraftCommit({
        schemaVersion: 'cp03-council/0.2',
        turnId: context.turn.turnId,
        status: 'PROPOSED',
        actionSequence: ['Reframe', 'Continue'],
        selectedShardHashes: context.priorAcceptedShardHashes,
        selectedDissentIds: [],
        terminalIntent: 'Continue',
      });
      yield* responseFor(
        `tool_commit_${sha(context.caseId).slice(0, 16)}`,
        'pact_submit_conductor_commit',
        commit,
      );
      return;
    }
    const shard = validateCouncilShard(shardFor(options, context));
    yield* responseFor(
      `tool_shard_${sha(context.caseId).slice(0, 16)}`,
      'pact_submit_council_shard',
      shard,
    );
  }
}

const requestFor = (
  entry: ModelBakeoffCase,
  sentOrdinal: number,
): ModelBakeoffDispatchRequest => ({
  runId: 'cp03-model-bakeoff-20000101T120000Z',
  approvalId: 'approval_cp03_model_bakeoff_20000101',
  case: entry,
  attemptId: `attempt_${String(sentOrdinal).padStart(6, '0')}_01`,
  attemptOrdinal: 1,
  sentOrdinal,
  retryOf: null,
});

const forbiddenTool = /search|ground|provider|file|shell|code|exec/i;
const roleCaps = {
  ConductorIntent: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Archivist: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Guardian: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  ConductorCommit: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Witness: { maxInputTokens: 1_000, maxOutputTokens: 100 },
  Rewriter: { maxInputTokens: 1_000, maxOutputTokens: 100 },
} as const;

describe('DSH model bakeoff transport', () => {
  it('uses actual DSH sessions/tools, keeps conductor continuity, and confines the image', async () => {
    const fixtures = createModelBakeoffFixtures();
    const plan = createModelBakeoffPlan(fixtures.manifest);
    const deepseek = new BakeoffScriptedAdapter();
    const gemini = new BakeoffScriptedAdapter();
    const persistenceRoot = testRoot('sessions');
    const dshHome = testRoot('attachments');
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot,
      dshHome,
      providerKind: 'scripted',
      roleCaps,
      forbiddenSubstrings: [
        process.cwd(),
        persistenceRoot,
        dshHome,
        ...SECRET_SENTINELS,
      ],
      mountAdapters(ctx: Context) {
        ctx.llm.registerAdapter(['deepseek-official'], deepseek);
        ctx.llm.registerAdapter(['google'], gemini);
      },
      estimateCostUsd: () => 0,
    });

    const selected = plan;
    const results = [];
    for (const [index, entry] of selected.entries()) {
      results.push(await transport.dispatch(requestFor(entry, index + 1)));
    }
    await transport.dispose();

    expect(results).toHaveLength(28);
    const diagnostics = transport.diagnostics();
    expect(results.map(({ kind, detailCode }, index) => ({
      caseId: selected[index]!.caseId,
      kind,
      detailCode,
      toolCallCount: diagnostics[index]?.toolCallCount,
      acceptedDomainEventCount: diagnostics[index]?.acceptedDomainEventCount,
      streamCount: diagnostics[index]?.streamCount,
      turnEndReason: diagnostics[index]?.turnEndReason,
    }))).toEqual(
      selected.map(({ caseId }, index) => ({
        caseId,
        kind: 'accepted',
        detailCode: null,
        toolCallCount: 1,
        acceptedDomainEventCount: 1,
        streamCount: 1,
        turnEndReason: 'aborted',
      })),
    );
    expect(results.every(({ kind, sideEffectAccepted }) =>
      kind === 'accepted' && sideEffectAccepted)).toBe(true);
    expect(results.every(({ providerRequestMade }) => providerRequestMade === false)).toBe(true);
    expect(results.every(({ usage }) =>
      usage.inputTokens === 100 && usage.outputTokens === 25 && usage.totalTokens === 125
    )).toBe(true);

    expect(deepseek.requests).toHaveLength(16);
    expect(gemini.requests).toHaveLength(12);
    const requestByCaseId = new Map(
      [...deepseek.requests, ...gemini.requests].map((request) => [
        promptContext(request).caseId,
        request,
      ]),
    );
    for (const entry of selected) {
      expect(requestByCaseId.get(entry.caseId)).toMatchObject({
        provider: entry.route,
        model: entry.model,
      });
    }

    const requests = [...deepseek.requests, ...gemini.requests];
    const requestsWithImages = requests.filter(({ messages }) =>
      messages.some(({ content }) => content.some(({ type }) => type === 'image'))
    );
    expect(requestsWithImages).toHaveLength(12);
    expect(requestsWithImages.map(promptContext).filter(({ role }) => role === 'Witness'))
      .toHaveLength(6);
    expect(requestsWithImages.map(promptContext).filter(({ role }) => role === 'Rewriter'))
      .toHaveLength(6);
    expect(requestsWithImages.every((request) =>
      JSON.stringify(request).includes('synthetic-spatial-image-01')
      && request.messages.flatMap(({ content }) => content)
        .filter(({ type }) => type === 'image').length === 1
    )).toBe(true);
    expect(deepseek.requests.every((request) =>
      !JSON.stringify(request).includes('"type":"image"'))).toBe(true);

    for (const request of requests) {
      expect(request.maxTokens).toBe(100);
      expect(request.tools?.map(({ name }) => name).some((name) => forbiddenTool.test(name)))
        .toBe(false);
    }

    expect(diagnostics).toHaveLength(28);
    const conductor = diagnostics.filter(({ role }) => role === 'CaseConductor');
    expect(conductor).toHaveLength(8);
    const conductorByContinuity = new Map<string | null, ModelBakeoffDshDiagnostic[]>();
    for (const diagnostic of conductor) {
      const group = conductorByContinuity.get(diagnostic.continuityKey) ?? [];
      group.push(diagnostic);
      conductorByContinuity.set(diagnostic.continuityKey, group);
    }
    expect(conductorByContinuity.size).toBe(4);
    for (const group of conductorByContinuity.values()) {
      expect(group).toHaveLength(2);
      expect(new Set(group.map(({ sessionId }) => sessionId))).toHaveProperty('size', 1);
      expect(group.map(({ phase }) => phase).sort()).toEqual([
        'ConductorCommit',
        'ConductorIntent',
      ]);
    }
    expect(diagnostics.every(({ toolCallCount, acceptedDomainEventCount }) =>
      toolCallCount === 1 && acceptedDomainEventCount === 1
    )).toBe(true);
    expect(diagnostics.every(({ streamCount, undeclaredStreamCount, turnEndReason }) =>
      streamCount === 1 && undeclaredStreamCount === 0 && turnEndReason === 'aborted'
    )).toBe(true);
    expect(diagnostics.every(({ sessionEventRange }) =>
      sessionEventRange.toSequence >= sessionEventRange.fromSequence
    )).toBe(true);

    const serialized = JSON.stringify({ requests, diagnostics, results });
    expect(serialized).not.toContain(persistenceRoot);
    expect(serialized).not.toContain(dshHome);
    expect(serialized).not.toContain(process.cwd());
    for (const secret of SECRET_SENTINELS) expect(serialized).not.toContain(secret);
  });

  it('uses each phase cap on the persistent CaseConductor session', async () => {
    class CapSensitiveAdapter extends BakeoffScriptedAdapter {
      override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        this.requests.push(options);
        const context = promptContext(options);
        if (context.phase === 'ConductorIntent' && options.maxTokens !== 1_024) {
          yield* terminalTextResponse({ kind: 'max-tokens' });
          return;
        }
        if (context.phase === 'ConductorCommit') {
          const commit = validateConductorDraftCommit({
            schemaVersion: 'cp03-council/0.2',
            turnId: context.turn.turnId,
            status: 'PROPOSED',
            actionSequence: ['Continue'],
            selectedShardHashes: context.priorAcceptedShardHashes,
            selectedDissentIds: [],
            terminalIntent: 'Continue',
          });
          yield* responseFor(
            `tool_commit_${sha(context.caseId).slice(0, 16)}`,
            'pact_submit_conductor_commit',
            commit,
          );
          return;
        }
        const shard = validateCouncilShard(shardFor(options, context));
        yield* responseFor(
          `tool_shard_${sha(context.caseId).slice(0, 16)}`,
          'pact_submit_council_shard',
          shard,
        );
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const plan = createModelBakeoffPlan(fixtures.manifest);
    const intent = plan.find(({ model, phase, repetition }) =>
      model === 'deepseek-v4-pro' && phase === 'ConductorIntent' && repetition === 1
    )!;
    const commit = plan.find(({ model, phase, repetition }) =>
      model === 'deepseek-v4-pro' && phase === 'ConductorCommit' && repetition === 1
    )!;
    const adapter = new CapSensitiveAdapter();
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('conductor-phase-caps'),
      dshHome: testRoot('conductor-phase-cap-attachments'),
      providerKind: 'scripted',
      roleCaps: {
        ...roleCaps,
        ConductorIntent: { maxInputTokens: 8_192, maxOutputTokens: 1_024 },
        ConductorCommit: { maxInputTokens: 8_192, maxOutputTokens: 512 },
      },
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], adapter);
      },
      estimateCostUsd: () => 0,
    });

    const intentResult = await transport.dispatch(requestFor(intent, 1));
    const commitResult = await transport.dispatch(requestFor(commit, 2));
    await transport.dispose();

    expect(intentResult.kind).toBe('accepted');
    expect(commitResult.kind).toBe('accepted');
    expect(adapter.requests.map(({ maxTokens }) => maxTokens)).toEqual([1_024, 512]);
    expect(new Set(adapter.requests.map(({ sessionId }) => String(sessionId))).size).toBe(1);
  });

  it('states the council output schema separately from prompt metadata', async () => {
    class SchemaCopyingAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        const context = promptContext(options);
        const rules = toolRules(options);
        const contextRecord = context as unknown as Record<string, unknown>;
        const shard = {
          ...(shardFor(options, context) as Record<string, unknown>),
          schemaVersion: rules?.outputSchemaVersion ?? contextRecord.schemaVersion,
        };
        yield* responseFor('tool_schema_copy_0001', 'pact_submit_council_shard', shard);
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'gemini-3.5-flash' && role === 'Witness',
    )!;
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('schema-copy'),
      dshHome: testRoot('schema-copy-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['google'], new SchemaCopyingAdapter());
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result.kind).toBe('accepted');
  });

  it('states that council tool arguments are a direct object', async () => {
    class WrapperProneAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        const context = promptContext(options);
        const shard = shardFor(options, context);
        const args = toolRules(options)?.argumentShape === 'direct-object'
          ? shard
          : { shard };
        yield* responseFor('tool_wrapper_prone_01', 'pact_submit_council_shard', args);
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'deepseek-v4-pro' && role === 'Archivist',
    )!;
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('wrapper-prompt'),
      dshHome: testRoot('wrapper-prompt-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], new WrapperProneAdapter());
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result.kind).toBe('accepted');
  });

  it('states the only registered semantic capability for Rewriter', async () => {
    class CapabilityCopyingAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        const context = promptContext(options);
        const shard = shardFor(options, context) as Record<string, unknown>;
        const content = shard.content as Record<string, unknown>;
        const calls = content.semanticCapabilityCalls as Array<Record<string, unknown>>;
        calls[0] = {
          ...calls[0],
          capability: toolRules(options)?.semanticCapabilityId ?? {},
        };
        yield* responseFor('tool_capability_copy_01', 'pact_submit_council_shard', shard);
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'gemini-3.6-flash' && role === 'Rewriter',
    )!;
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('capability-prompt'),
      dshHome: testRoot('capability-prompt-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['google'], new CapabilityCopyingAdapter());
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result.kind).toBe('accepted');
  });

  it('binds fixture rights to the exact registered rights IDs', async () => {
    class FixtureRightsAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        const context = promptContext(options);
        const fixture = promptJson<{ readonly rights: readonly string[] }>(
          options,
          'PACT_BAKEOFF_FIXTURE_JSON=',
        );
        if (fixture === undefined) throw new Error('fixture missing');
        const rules = toolRules(options);
        if (rules === undefined) throw new Error('tool rules missing');
        const shard = shardFor(options, context) as Record<string, unknown>;
        const content = shard.content as Record<string, unknown>;
        content.rightsRequirements = [...fixture.rights];
        expect(rules.registeredRightsIds).toEqual(fixture.rights);
        yield* responseFor('tool_fixture_rights_01', 'pact_submit_council_shard', shard);
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'deepseek-v4-pro' && role === 'Archivist',
    )!;
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('fixture-rights'),
      dshHome: testRoot('fixture-rights-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], new FixtureRightsAdapter());
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result.kind).toBe('accepted');
  });

  it('requests a supported low thinking level from Gemini 3.7', async () => {
    class Gemini37Adapter extends ReasoningAwareScriptedAdapter {
      readonly requests: GenerateOptions[] = [];

      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        this.requests.push(options);
        if (String(options.reasoningEffort) !== 'low') {
          yield* terminalTextResponse({
            kind: 'error',
            failure: {
              code: 'INVALID_REQUEST',
              status: 400,
              message: 'Thinking level MINIMAL is not supported for this model.',
            },
          });
          return;
        }
        const context = promptContext(options);
        const shard = validateCouncilShard(shardFor(options, context));
        yield* responseFor('tool_gemini_37_low_01', 'pact_submit_council_shard', shard);
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'gemini-3.7-flash' && role === 'Witness',
    )!;
    const adapter = new Gemini37Adapter();
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('gemini-37-reasoning'),
      dshHome: testRoot('gemini-37-reasoning-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['google'], adapter);
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result.kind).toBe('accepted');
    expect(adapter.requests.map(({ reasoningEffort }) => String(reasoningEffort)))
      .toEqual(['low']);
  });

  it('classifies a terminal provider error as transport failure', async () => {
    class ProviderErrorAdapter extends LlmAdapter {
      async *stream(): AsyncIterable<StreamChunk> {
        yield* terminalTextResponse({
          kind: 'error',
          failure: {
            code: 'INVALID_REQUEST',
            status: 400,
            message: 'Synthetic provider request rejected.',
          },
        });
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'gemini-3.5-flash' && role === 'Witness',
    )!;
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('provider-error'),
      dshHome: testRoot('provider-error-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['google'], new ProviderErrorAdapter());
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result).toMatchObject({
      kind: 'transport_failure',
      detailCode: 'MODEL_BAKEOFF_PROVIDER_INVALID_REQUEST',
      preSideEffect: true,
      sideEffectAccepted: false,
    });
  });

  it('classifies a max-token stop without a tool as content failure', async () => {
    class MaxTokenAdapter extends LlmAdapter {
      async *stream(): AsyncIterable<StreamChunk> {
        yield* terminalTextResponse({ kind: 'max-tokens' });
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'deepseek-v4-flash' && role === 'Guardian',
    )!;
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('max-token'),
      dshHome: testRoot('max-token-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], new MaxTokenAdapter());
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result).toMatchObject({
      kind: 'content_failure',
      detailCode: 'MODEL_BAKEOFF_OUTPUT_MAX_TOKENS',
      preSideEffect: true,
      sideEffectAccepted: false,
    });
  });

  it('stops after the first rejected expected tool result', async () => {
    class AlwaysWrappedAdapter extends LlmAdapter {
      readonly requests: GenerateOptions[] = [];

      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        this.requests.push(options);
        const context = promptContext(options);
        yield* responseFor(
          'tool_always_wrapped_01',
          'pact_submit_council_shard',
          { shard: shardFor(options, context) },
        );
      }
    }

    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ model, role }) => model === 'deepseek-v4-pro' && role === 'Archivist',
    )!;
    const adapter = new AlwaysWrappedAdapter();
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('rejected-one-shot'),
      dshHome: testRoot('rejected-one-shot-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], adapter);
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    const [diagnostic] = transport.diagnostics();
    await transport.dispose();

    expect(result.kind).toBe('schema_failure');
    expect(adapter.requests).toHaveLength(1);
    expect(diagnostic).toMatchObject({
      streamCount: 1,
      undeclaredStreamCount: 0,
      toolCallCount: 1,
      acceptedDomainEventCount: 0,
      turnEndReason: 'aborted',
    });
  });

  it('fails closed when the adapter calls the wrong council tool', async () => {
    class WrongToolAdapter extends LlmAdapter {
      async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
        const context = promptContext(options);
        yield* responseFor(
          'tool_wrong_00000001',
          'pact_submit_conductor_commit',
          {
            schemaVersion: 'cp03-council/0.2',
            turnId: context.turn.turnId,
            status: 'PROPOSED',
            actionSequence: ['Continue'],
            selectedShardHashes: [],
            selectedDissentIds: [],
            terminalIntent: 'Continue',
          },
        );
      }
    }
    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest)[0]!;
    const adapter = new WrongToolAdapter();
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('wrong-sessions'),
      dshHome: testRoot('wrong-attachments'),
      providerKind: 'scripted',
      roleCaps,
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['deepseek-official'], adapter);
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(result.kind).not.toBe('accepted');
    expect(result.sideEffectAccepted).toBe(false);
    expect(result.toolResult).toMatchObject({
      name: 'pact_submit_council_shard',
      accepted: false,
    });
  });

  it('does not certify an accepted tool payload whose provider usage exceeds the approval-bound cap', async () => {
    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ role }) => role === 'Witness',
    )!;
    const adapter = new BakeoffScriptedAdapter();
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot: testRoot('cap-sessions'),
      dshHome: testRoot('cap-attachments'),
      providerKind: 'scripted',
      roleCaps: {
        ...roleCaps,
        Witness: { maxInputTokens: 1_000, maxOutputTokens: 20 },
      },
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['google'], adapter);
      },
      estimateCostUsd: () => 0,
    });

    const result = await transport.dispatch(requestFor(entry, 1));
    await transport.dispose();

    expect(adapter.requests[0]?.maxTokens).toBe(20);
    expect(result).toMatchObject({
      kind: 'content_failure',
      detailCode: 'MODEL_BAKEOFF_TOKEN_CAP_EXCEEDED',
      preSideEffect: false,
      sideEffectAccepted: true,
      toolResult: { accepted: false },
    });
  });

  it('persists DSH JSONL without leaking configured paths or credential sentinels into evidence', async () => {
    const fixtures = createModelBakeoffFixtures();
    const entry = createModelBakeoffPlan(fixtures.manifest).find(
      ({ role }) => role === 'Witness',
    )!;
    const adapter = new BakeoffScriptedAdapter();
    const persistenceRoot = testRoot('jsonl');
    const dshHome = testRoot('jsonl-attachments');
    const transport = await createModelBakeoffDshTransport({
      fixtures,
      persistenceRoot,
      dshHome,
      providerKind: 'scripted',
      roleCaps,
      forbiddenSubstrings: [
        process.cwd(),
        persistenceRoot,
        dshHome,
        ...SECRET_SENTINELS,
      ],
      mountAdapters(ctx) {
        ctx.llm.registerAdapter(['google'], adapter);
      },
      estimateCostUsd: () => 0,
    });
    const result = await transport.dispatch(requestFor(entry, 1));
    const [diagnostic] = transport.diagnostics();
    await transport.dispose();

    expect(result.kind).toBe('accepted');
    const inspection = await coldInspect(
      persistenceRoot,
      SessionId(diagnostic!.sessionId),
    );
    const persisted = JSON.stringify(inspection.events);
    expect(persisted).toContain('pact/council-shard');
    expect(persisted).toContain('synthetic-spatial-image-01');
    expect(persisted).not.toContain(persistenceRoot);
    expect(persisted).not.toContain(dshHome);
    expect(persisted).not.toContain(process.cwd());
    for (const secret of SECRET_SENTINELS) expect(persisted).not.toContain(secret);
  });
});
