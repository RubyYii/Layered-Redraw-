import { createHash, randomUUID } from 'node:crypto';

import type { Context } from '@deepseek-ai/cordis';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent';
import {
  createUserMessage,
  ReasoningEffortId,
  type ContentBlock,
  type GenerateOptions,
  type StreamChunk,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm';
import type {
  Session,
  SessionEvent,
} from '@deepseek-ai/dsh-session';
import { SessionId } from '@deepseek-ai/dsh-session';
import {
  canonicalJson,
  validateConductorDraftCommit,
  validateCouncilShard,
} from '@layered-redraw/pact-cp03-contracts';

import {
  createFoundationHarness,
  type FoundationHarness,
} from './create-foundation-harness.js';
import {
  allowedCouncilReferences,
  CouncilReferenceValidationError,
  validateCouncilShardReferences,
  type AllowedCouncilReferences,
} from './council-reference-validation.js';
import {
  freezeCouncilTurn,
  type FrozenCouncilTurn,
} from './council-turn.js';
import type {
  CouncilShard,
  CouncilRole,
  ProviderRoutingManifest,
} from './contract-types.js';
import {
  durableConductorCommit,
  durableCouncilShard,
} from './council-durability.js';
import { waitForTurnEnd } from './durable-turn.js';
import type { ModelBakeoffFixtures } from './model-bakeoff-fixtures.js';
import type {
  ModelBakeoffCase,
  ModelBakeoffPhase,
  ModelBakeoffRole,
} from './model-bakeoff-plan.js';
import type {
  ModelBakeoffDispatchRequest,
  ModelBakeoffProviderFacts,
  ModelBakeoffSessionEventRange,
  ModelBakeoffToolResult,
  ModelBakeoffTransport,
  ModelBakeoffTransportResult,
} from './model-bakeoff-runner.js';

const HARD_ATTEMPT_TIMEOUT_MS = 12_000;
const SYNTHETIC_IMAGE_REF = 'synthetic-spatial-image-01' as const;
const SYNTHETIC_SCENE_REF = 'synthetic-scene-01' as const;

const sha256 = (value: string | Uint8Array): string => createHash('sha256')
  .update(value)
  .digest('hex');

const canonicalSha256 = (value: unknown): string => sha256(canonicalJson(value));

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const detailCode = (value: unknown, forbidden: readonly string[] = []): string => {
  let raw = value instanceof Error ? value.message : String(value);
  for (const candidate of forbidden) {
    if (candidate.length > 0) raw = raw.replaceAll(candidate, 'REDACTED');
  }
  const normalized = raw.toUpperCase().replaceAll(/[^A-Z0-9_]/g, '_')
    .replaceAll(/_+/g, '_').slice(0, 96);
  return normalized || 'MODEL_BAKEOFF_DSH_FAILURE';
};

const providerFacts = (entry: ModelBakeoffCase): ModelBakeoffProviderFacts =>
  entry.provider === 'deepseek'
    ? {
      adapterPackage: '@deepseek-ai/dsh-llm-deepseek',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: null,
      catalogVersion: null,
    }
    : {
      adapterPackage: '@deepseek-ai/dsh-llm-pi-ai',
      adapterVersion: '0.1.0-rc.6',
      catalogPackage: '@earendil-works/pi-ai',
      catalogVersion: '0.84.2',
    };

const expectedTool = (phase: ModelBakeoffPhase): ModelBakeoffToolResult =>
  phase === 'ConductorCommit'
    ? {
      name: 'pact_submit_conductor_commit',
      contract: 'conductor-draft-commit/0.1',
      accepted: false,
      payloadSha256: canonicalSha256(null),
    }
    : {
      name: 'pact_submit_council_shard',
      contract: 'council-shard/0.1',
      accepted: false,
      payloadSha256: canonicalSha256(null),
    };

const roleLabel = (
  role: Exclude<ModelBakeoffRole, 'CaseConductor'>,
): string => `PACT ${role}`;

const scopeKeyOf = (entry: ModelBakeoffCase): string =>
  `${entry.provider}\u0000${entry.route}\u0000${entry.model}\u0000${entry.repetition}`;

const routingManifestFor = (entry: ModelBakeoffCase): ProviderRoutingManifest => {
  const assignment = (role: CouncilRole) => ({
    provider: entry.provider,
    route: entry.route,
    model: entry.model,
    adapterPackage: providerFacts(entry).adapterPackage,
    adapterVersion: providerFacts(entry).adapterVersion,
    promptHash: sha256(`cp03-model-bakeoff:${entry.model}:${role}`),
    toolProfile: 'council-v2' as const,
    maximumConcurrency: 1,
    inputClasses: entry.provider === 'gemini'
      ? ['text', 'image'] as const
      : ['text'] as const,
    inputLimitTokens: 32_768,
    outputLimitTokens: 2_048,
    timeoutMs: HARD_ATTEMPT_TIMEOUT_MS,
  });
  return deepFreeze({
    schemaVersion: 'cp03-council-routing/0.1',
    manifestVersion: `cp03-model-bakeoff/${entry.model}/r${entry.repetition}`,
    plannedDispatches: 6,
    maximumDispatches: 8,
    assignments: {
      CaseConductor: assignment('CaseConductor'),
      Witness: assignment('Witness'),
      Archivist: assignment('Archivist'),
      Rewriter: assignment('Rewriter'),
      Guardian: assignment('Guardian'),
    },
  });
};

const turnFor = async (
  entry: ModelBakeoffCase,
  now: () => number,
  discriminator: string,
): Promise<FrozenCouncilTurn> => {
  const scopeSuffix = sha256(scopeKeyOf(entry)).slice(0, 16);
  const turnSuffix = sha256(`${scopeKeyOf(entry)}\u0000${discriminator}`).slice(0, 16);
  const routingManifest = routingManifestFor(entry);
  return freezeCouncilTurn({
    caseSessionId: `case_bakeoff_${scopeSuffix}`,
    turnId: `turn_bakeoff_${turnSuffix}`,
    parentSceneHash: sha256('cp03-synthetic-scene-parent'),
    sourceLockIds: ['synthetic-source-plane-01'],
    inputRefs: [
      { refId: SYNTHETIC_SCENE_REF, inputClass: 'text' },
      { refId: SYNTHETIC_IMAGE_REF, inputClass: 'image' },
    ],
    registryVersion: 'cp03-synthetic-registry/0.1',
    registeredAssetIds: [
      'synthetic-window-01',
      'synthetic-bed-01',
      'synthetic-table-01',
      'synthetic-chair-01',
      'synthetic-cup-01',
      'synthetic-thermos-01',
      'synthetic-source-plane-01',
      'synthetic-floor-grid-01',
    ],
    registeredSpatialBridgeIds: ['synthetic-spatial-bridge-01'],
    registeredSceneObjectIds: [
      'synthetic-window-01',
      'synthetic-bed-01',
      'synthetic-table-01',
      'synthetic-chair-01',
      'synthetic-cup-01',
      'synthetic-thermos-01',
      'synthetic-source-plane-01',
      'synthetic-floor-grid-01',
      'synthetic-actor-01',
    ],
    registeredAffordanceIds: ['pickup', 'place'],
    registeredRightsIds: ['rights_synthetic_fixture'],
    supportedRollbackCapabilityIds: [
      'restore-scene-snapshot',
      'release-object-claim',
    ],
    allowedSemanticCapabilityIds: ['performRegisteredInteraction'],
    caseActionState: {
      status: 'OPEN',
      currentSceneHash: sha256('cp03-synthetic-scene-parent'),
      accumulatedActions: [],
      terminalAction: null,
    },
    turnScope: {
      usesImageOrAudioClaims: true,
      usesSceneObservationClaims: true,
      allowsSceneMutation: true,
      allowsAssetOrSpatialChange: true,
      requiresProvenanceOrRights: true,
    },
    routingManifest,
    deadlineId: `deadline_bakeoff_${turnSuffix}`,
    now,
  });
};

export interface ModelBakeoffPromptContext {
  readonly contextVersion: 'cp03-model-bakeoff-prompt-context/0.3';
  readonly runId: string;
  readonly approvalId: string;
  readonly caseId: string;
  readonly phase: ModelBakeoffPhase;
  readonly role: ModelBakeoffRole;
  readonly repetition: 1 | 2;
  readonly continuityKey: string | null;
  readonly allowedReferences: AllowedCouncilReferences;
  readonly imageInputRefId: typeof SYNTHETIC_IMAGE_REF | null;
  readonly priorAcceptedShardHashes: readonly string[];
}

export interface ModelBakeoffDshDiagnostic {
  readonly attemptId: string;
  readonly sentOrdinal: number;
  readonly caseId: string;
  readonly provider: ModelBakeoffCase['provider'];
  readonly route: ModelBakeoffCase['route'];
  readonly model: ModelBakeoffCase['model'];
  readonly phase: ModelBakeoffPhase;
  readonly role: ModelBakeoffRole;
  readonly continuityKey: string | null;
  readonly sessionId: string;
  readonly streamCount: number;
  readonly undeclaredStreamCount: number;
  readonly toolCallCount: number;
  readonly acceptedDomainEventCount: number;
  readonly availableTools: readonly string[];
  readonly imageBlockCount: number;
  readonly redactedOutputText: string | null;
  readonly turnEndReason: string | null;
  readonly sessionEventRange: ModelBakeoffSessionEventRange;
}

export interface ModelBakeoffDshTransport extends ModelBakeoffTransport {
  diagnostics(): readonly ModelBakeoffDshDiagnostic[];
}

export interface ModelBakeoffDshTransportOptions {
  readonly fixtures: ModelBakeoffFixtures;
  readonly persistenceRoot: string;
  readonly dshHome: string;
  readonly providerKind: 'scripted' | 'real';
  readonly mountAdapters: (ctx: Context) => void | Promise<void>;
  readonly estimateCostUsd: (
    entry: ModelBakeoffCase,
    usage: { readonly inputTokens: number; readonly outputTokens: number },
  ) => number;
  readonly roleCaps: Readonly<Record<
    ModelBakeoffPhase,
    { readonly maxInputTokens: number; readonly maxOutputTokens: number }
  >>;
  readonly forbiddenSubstrings?: readonly string[];
  readonly now?: () => number;
}

interface StreamCapture {
  sessionId: string | null;
  readonly expectedRoute: string;
  readonly expectedModel: string;
  readonly expectedToolName: ModelBakeoffToolResult['name'];
  readonly maxOutputTokens: number;
  streamCount: number;
  undeclaredStreamCount: number;
  firstChunkAtMs: number | null;
  usage: TokenUsage | null;
  thrown: unknown;
  availableTools: readonly string[];
}

interface DispatchObservation {
  readonly capture: StreamCapture;
  session: Session | null;
  agent: Agent | null;
  toolCallCount: number;
  firstToolResultErrorCode: string | null;
  acceptedEvents: SessionEvent[];
  quarantineCount: number;
  firstPublicTraceAtMs: number | null;
  releaseToolBinding: (() => void) | null;
}

interface CandidateScope {
  readonly key: string;
  readonly entry: ModelBakeoffCase;
  readonly harness: FoundationHarness;
  readonly acceptedShardHashes: string[];
  readonly settlementParents: AgentHandle[];
  readonly conductor: AgentHandle | null;
  readonly imageBlock: ContentBlock | null;
  activeTurn: FrozenCouncilTurn | null;
  active: DispatchObservation | null;
  pendingChild: DispatchObservation | null;
  pendingChildRole: Exclude<ModelBakeoffRole, 'CaseConductor'> | null;
  disposed: boolean;
}

const appendObserved = (
  observation: DispatchObservation,
  session: Session,
  event: SessionEvent,
): void => {
  if (observation.capture.sessionId !== String(session.id)) return;
  if (event.type === 'tool/call') observation.toolCallCount += 1;
  if (event.type === 'tool/result' && observation.toolCallCount > 0) {
    if (observation.firstToolResultErrorCode === null) {
      const block = event.data.message.content[0];
      if (
        block?.type === 'tool-result' &&
        (block.isError === true || event.data.error !== undefined)
      ) {
        const bounded = JSON.stringify(block).slice(0, 8_192);
        observation.firstToolResultErrorCode =
          bounded.includes('PACT_COUNCIL_REFERENCE_') ||
          bounded.includes('PACT_COUNCIL_EXPECTED_CHANGES_MISMATCH')
            ? 'MODEL_BAKEOFF_REFERENCE_NOT_REGISTERED'
            : 'MODEL_BAKEOFF_SCHEMA_REJECTED';
      }
    }
    observation.agent?.cancel({ kind: 'user' });
  }
  if (event.type === 'pact/quarantine') observation.quarantineCount += 1;
  if (
    event.type === 'pact/council-shard'
    || event.type === 'pact/conductor-commit'
  ) {
    observation.acceptedEvents.push(event);
  }
  if (
    event.type === 'pact/public-trace'
    && observation.firstPublicTraceAtMs === null
  ) {
    observation.firstPublicTraceAtMs = event.time;
  }
};

const observeStream = async function* (
  capture: StreamCapture,
  stream: AsyncIterable<StreamChunk>,
  now: () => number,
): AsyncIterable<StreamChunk> {
  try {
    for await (const chunk of stream) {
      if (capture.firstChunkAtMs === null) capture.firstChunkAtMs = now();
      if (chunk.type === 'usage') capture.usage = chunk.usage;
      yield chunk;
    }
  } catch (error) {
    capture.thrown = error;
    throw error;
  }
};

const latestTurnRange = (session: Session): {
  readonly range: ModelBakeoffSessionEventRange;
  readonly reason: string | null;
  readonly providerFailureCode: string | null;
} => {
  const starts = session.events.filter((event) => event.type === 'turn/start');
  const start = starts.at(-1);
  if (start === undefined) {
    const sequence = session.events.at(-1)?.seq ?? 0;
    return {
      range: {
        sessionId: String(session.id),
        fromSequence: sequence,
        toSequence: sequence,
      },
      reason: null,
      providerFailureCode: null,
    };
  }
  const end = session.events.find((event) =>
    event.type === 'turn/end'
    && event.data.turn === start.data.turn
    && event.seq >= start.seq
  );
  return {
    range: {
      sessionId: String(session.id),
      fromSequence: start.seq,
      toSequence: end?.seq ?? session.events.at(-1)?.seq ?? start.seq,
    },
    reason: end?.type === 'turn/end' ? end.data.reason.kind : null,
    providerFailureCode:
      end?.type === 'turn/end' && end.data.reason.kind === 'error'
        ? end.data.reason.error.code
        : null,
  };
};

const eventPayload = (event: SessionEvent): unknown =>
  event.type === 'pact/council-shard' || event.type === 'pact/conductor-commit'
    ? event.data.payload
    : null;

const redactedReviewText = (
  phase: ModelBakeoffPhase,
  payload: unknown,
): string | null => {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (phase === 'ConductorCommit') {
    const actions = Array.isArray(record.actionSequence)
      ? record.actionSequence.filter((value): value is string => typeof value === 'string')
      : [];
    return `Status ${String(record.status ?? 'unknown')}. Actions: ${actions.join(' → ')}.`;
  }
  const content = record.content;
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return null;
  const value = content as Record<string, unknown>;
  let text: string;
  switch (phase) {
    case 'ConductorIntent':
      text = String(value.initialInterpretation ?? '');
      break;
    case 'Witness':
      text = Array.isArray(value.observations)
        ? value.observations.map((observation) =>
          observation !== null && typeof observation === 'object' && !Array.isArray(observation)
            ? String((observation as Record<string, unknown>).text ?? '')
            : ''
        ).filter(Boolean).join(' ')
        : '';
      break;
    case 'Archivist':
      text = [
        `Provenance: ${Array.isArray(value.provenanceAnchors) ? value.provenanceAnchors.join(', ') : ''}.`,
        `Rights: ${Array.isArray(value.rightsRequirements) ? value.rightsRequirements.join(', ') : ''}.`,
        `Unavailable: ${Array.isArray(value.unavailableRefs) ? value.unavailableRefs.join(', ') : 'none'}.`,
      ].join(' ');
      break;
    case 'Rewriter':
      text = [value.interpretation, value.publicPoeticText]
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        .join(' ');
      break;
    case 'Guardian':
      text = [
        `Disposition ${String(value.disposition ?? 'unknown')}.`,
        String(value.guardianChallenge ?? ''),
      ].join(' ');
      break;
    default:
      return null;
  }
  const normalized = text.replaceAll(/\s+/g, ' ').trim();
  return normalized.length === 0 ? null : normalized.slice(0, 4_000);
};

const scanForForbidden = (
  value: unknown,
  forbidden: readonly string[],
): boolean => {
  const serialized = JSON.stringify(value);
  return forbidden.some((candidate) => candidate.length > 0 && serialized.includes(candidate));
};

class DshModelBakeoffTransport implements ModelBakeoffDshTransport {
  private readonly now: () => number;
  private readonly diagnosticsLog: ModelBakeoffDshDiagnostic[] = [];
  private scope: CandidateScope | null = null;
  private disposed = false;

  constructor(private readonly options: ModelBakeoffDshTransportOptions) {
    this.now = options.now ?? Date.now;
    for (const phase of [
      'ConductorIntent',
      'Archivist',
      'Guardian',
      'ConductorCommit',
      'Witness',
      'Rewriter',
    ] as const) {
      const cap = options.roleCaps[phase];
      if (
        !Number.isInteger(cap?.maxInputTokens)
        || cap.maxInputTokens < 1
        || cap.maxInputTokens > 32_768
        || !Number.isInteger(cap.maxOutputTokens)
        || cap.maxOutputTokens < 1
        || cap.maxOutputTokens > 2_048
      ) throw new Error('MODEL_BAKEOFF_ROLE_CAP_INVALID');
    }
  }

  diagnostics(): readonly ModelBakeoffDshDiagnostic[] {
    return deepFreeze(this.diagnosticsLog.map((entry) => ({
      ...entry,
      availableTools: [...entry.availableTools],
      sessionEventRange: { ...entry.sessionEventRange },
    })));
  }

  async dispatch(request: ModelBakeoffDispatchRequest): Promise<ModelBakeoffTransportResult> {
    if (this.disposed) throw new Error('MODEL_BAKEOFF_TRANSPORT_DISPOSED');
    const startedAtMs = this.now();
    let scope: CandidateScope | null = null;
    let observation: DispatchObservation | null = null;
    let session: Session | null = null;
    let turn: FrozenCouncilTurn | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let promptImageBlockCount = 0;
    const expected = expectedTool(request.case.phase);
    try {
      scope = await this.requireScope(request.case);
      observation = {
        capture: {
          sessionId: null,
          expectedRoute: request.case.route,
          expectedModel: request.case.model,
          expectedToolName: expected.name,
          maxOutputTokens: this.options.roleCaps[request.case.phase].maxOutputTokens,
          streamCount: 0,
          undeclaredStreamCount: 0,
          firstChunkAtMs: null,
          usage: null,
          thrown: undefined,
          availableTools: [],
        },
        session: null,
        agent: null,
        toolCallCount: 0,
        firstToolResultErrorCode: null,
        acceptedEvents: [],
        quarantineCount: 0,
        firstPublicTraceAtMs: null,
        releaseToolBinding: null,
      };
      scope.active = observation;

      turn = await turnFor(request.case, this.now, request.attemptId);
      scope.activeTurn = turn;
      scope.harness.councilRegistry?.openTurn(turn);
      const toolBindings = scope.harness.councilToolBindings;
      if (toolBindings === undefined) {
        throw new Error('MODEL_BAKEOFF_COUNCIL_TOOL_BINDINGS_MISSING');
      }
      const prompt = this.promptFor(request, scope, turn);
      promptImageBlockCount = prompt.filter(({ type }) => type === 'image').length;
      const remainingBeforeDrive = HARD_ATTEMPT_TIMEOUT_MS - (this.now() - startedAtMs);
      if (remainingBeforeDrive <= 0) {
        timedOut = true;
        throw new Error('MODEL_BAKEOFF_ATTEMPT_TIMEOUT');
      }
      timer = setTimeout(() => {
        timedOut = true;
        observation?.agent?.cancel({ kind: 'user' });
      }, remainingBeforeDrive);
      let turnNumber: number;
      let parent: AgentHandle | null = null;
      if (request.case.role === 'CaseConductor') {
        if (scope.conductor === null) throw new Error('MODEL_BAKEOFF_CONDUCTOR_MISSING');
        observation.session = scope.conductor.agent.session;
        observation.agent = scope.conductor.agent;
        observation.capture.sessionId = String(scope.conductor.agent.id);
        observation.releaseToolBinding = toolBindings.bind({
          sessionId: scope.conductor.agent.id,
          role: 'CaseConductor',
          phase: request.case.phase === 'ConductorCommit'
            ? 'CONDUCTOR_COMMIT'
            : 'SHARD',
          turn,
        });
        session = scope.conductor.agent.session;
        turnNumber = session.events.filter((event) => event.type === 'turn/start').length + 1;
        if (timedOut) scope.conductor.agent.cancel({ kind: 'user' });
        scope.conductor.agent.followup(createUserMessage({
          content: prompt,
          source: { kind: 'user' },
        }));
      } else {
        parent = await scope.harness.createConductor(SessionId(randomUUID()));
        scope.settlementParents.push(parent);
        scope.pendingChild = observation;
        const role = request.case.role as Exclude<ModelBakeoffRole, 'CaseConductor'>;
        scope.pendingChildRole = role;
        const childAbort = new AbortController();
        const started = await scope.harness.ctx.subagents.startContinuable({
          provider: 'spawn',
          label: roleLabel(role),
          request: {
            parent: parent.agent,
            prompt,
            agentOptions: {
              provider: request.case.route,
              model: request.case.model,
              maxTokens: observation.capture.maxOutputTokens,
            },
            persona:
              `You are the bounded synthetic PACT ${role} bakeoff role. ` +
              'Use exactly the declared council shard tool once.',
            toolFilter: { allow: ['pact_submit_council_shard'] },
          },
          signal: childAbort.signal,
        });
        scope.pendingChild = null;
        scope.pendingChildRole = null;
        const child = scope.harness.ctx.agents.get(started.childId);
        if (child === undefined) throw new Error('MODEL_BAKEOFF_CHILD_MISSING');
        observation.agent = child;
        observation.session = scope.harness.sessionFor(started.childId);
        observation.capture.sessionId = String(started.childId);
        session = observation.session;
        turnNumber = 1;
        if (timedOut) child.cancel({ kind: 'user' });
      }
      await waitForTurnEnd(
        scope.harness.ctx,
        session,
        turnNumber,
        HARD_ATTEMPT_TIMEOUT_MS + 250,
      );
      await observation.agent?.whenIdle();
      await parent?.agent.whenIdle();
      await scope.harness.ctx.sessions.flush(session);
      if (timer !== undefined) clearTimeout(timer);

      const accepted = observation.acceptedEvents;
      const acceptedEvent = accepted.length === 1 ? accepted[0]! : null;
      const actualToolName = acceptedEvent?.type === 'pact/conductor-commit'
        ? 'pact_submit_conductor_commit'
        : acceptedEvent?.type === 'pact/council-shard'
          ? 'pact_submit_council_shard'
          : null;
      const payload = acceptedEvent === null ? null : eventPayload(acceptedEvent);
      let schemaValid = false;
      let schemaFailureCode = 'MODEL_BAKEOFF_SCHEMA_REJECTED';
      let referencesValid = false;
      let referenceFailureCode = 'MODEL_BAKEOFF_REFERENCE_NOT_REGISTERED';
      if (payload !== null) {
        try {
          if (request.case.phase === 'ConductorCommit') {
            validateConductorDraftCommit(payload);
            referencesValid = true;
          } else {
            const shard = validateCouncilShard(payload) as CouncilShard;
            if (shard.role !== request.case.role) {
              throw new Error('MODEL_BAKEOFF_ROLE_MISMATCH');
            }
            if (
              (request.case.role === 'Witness' || request.case.role === 'Rewriter')
              && !shard.evidenceAnchors.includes(SYNTHETIC_IMAGE_REF)
            ) {
              throw new Error('MODEL_BAKEOFF_IMAGE_GROUNDING_MISSING');
            }
            validateCouncilShardReferences(turn, shard);
            referencesValid = true;
          }
          schemaValid = true;
        } catch (error) {
          const code = detailCode(error, this.options.forbiddenSubstrings);
          if (error instanceof CouncilReferenceValidationError) {
            schemaValid = true;
            referencesValid = false;
            referenceFailureCode = 'MODEL_BAKEOFF_REFERENCE_NOT_REGISTERED';
          } else {
            schemaValid = false;
            schemaFailureCode = code;
          }
        }
      } else if (
        observation.firstToolResultErrorCode ===
          'MODEL_BAKEOFF_REFERENCE_NOT_REGISTERED'
      ) {
        schemaValid = true;
        referencesValid = false;
        referenceFailureCode = 'MODEL_BAKEOFF_REFERENCE_NOT_REGISTERED';
      } else if (observation.firstToolResultErrorCode !== null) {
        schemaFailureCode = observation.firstToolResultErrorCode;
      } else if (acceptedEvent !== null) {
        schemaFailureCode = `MODEL_BAKEOFF_ACCEPTED_PAYLOAD_MISSING_${detailCode(acceptedEvent.type)}`;
      }
      const payloadSha256 = acceptedEvent?.type === 'pact/council-shard'
        || acceptedEvent?.type === 'pact/conductor-commit'
        ? acceptedEvent.data.payloadHash
        : canonicalSha256(null);
      const imageRole = request.case.role === 'Witness' || request.case.role === 'Rewriter';
      const usage = observation.capture.usage ?? { inputTokens: 0, outputTokens: 0 };
      const normalizedUsage = {
        inputTokens: usage.inputTokens
          + (usage.cacheReadTokens ?? 0)
          + (usage.cacheWriteTokens ?? 0),
        outputTokens: usage.outputTokens,
      };
      const tokenCapValid =
        normalizedUsage.inputTokens <= this.options.roleCaps[request.case.phase].maxInputTokens
        && normalizedUsage.outputTokens <=
          this.options.roleCaps[request.case.phase].maxOutputTokens;
      const reviewText = schemaValid
        ? redactedReviewText(request.case.phase, payload)
        : null;
      const success = !timedOut
        && observation.capture.thrown === undefined
        && observation.capture.streamCount === 1
        && observation.capture.undeclaredStreamCount === 0
        && observation.toolCallCount === 1
        && observation.quarantineCount === 0
        && accepted.length === 1
        && actualToolName === expected.name
        && schemaValid
        && referencesValid
        && reviewText !== null
        && tokenCapValid;
      if (success && acceptedEvent?.type === 'pact/council-shard') {
        const acceptedContext = scope.harness.councilRegistry
          ?.acceptedCouncilShardContexts(turn.snapshot.turnId)
          .find(({ receipt }) => receipt.payloadHash === acceptedEvent.data.payloadHash);
        if (acceptedContext === undefined) {
          throw new Error('MODEL_BAKEOFF_ACCEPTED_SHARD_CONTEXT_MISSING');
        }
        const durable = await durableCouncilShard({
          ctx: scope.harness.ctx,
          registry: scope.harness.councilRegistry!,
          session,
          receipt: acceptedContext.receipt,
        });
        scope.acceptedShardHashes.push(durable.payloadHash);
      } else if (success && acceptedEvent?.type === 'pact/conductor-commit') {
        await durableConductorCommit({
          ctx: scope.harness.ctx,
          registry: scope.harness.councilRegistry!,
          session,
          receipt: {
            accepted: true,
            turnId: acceptedEvent.data.turnId,
            payloadHash: acceptedEvent.data.payloadHash,
            commitEventSeq: acceptedEvent.seq,
          },
        });
      }

      const { range, reason, providerFailureCode } = latestTurnRange(session);
      const providerTerminalFailure = providerFailureCode !== null;
      const maxTokenTerminal = reason === 'max-tokens';
      let resultKind: ModelBakeoffTransportResult['kind'];
      let resultDetailCode: string | null;
      if (success) {
        resultKind = 'accepted';
        resultDetailCode = null;
      } else if (timedOut) {
        resultKind = 'late';
        resultDetailCode = 'MODEL_BAKEOFF_ATTEMPT_TIMEOUT';
      } else if (observation.capture.thrown !== undefined) {
        resultKind = 'transport_failure';
        resultDetailCode = detailCode(
          observation.capture.thrown,
          this.options.forbiddenSubstrings,
        );
      } else if (providerTerminalFailure) {
        resultKind = 'transport_failure';
        resultDetailCode = `MODEL_BAKEOFF_PROVIDER_${detailCode(providerFailureCode)}`;
      } else if (maxTokenTerminal) {
        resultKind = 'content_failure';
        resultDetailCode = 'MODEL_BAKEOFF_OUTPUT_MAX_TOKENS';
      } else if (!tokenCapValid) {
        resultKind = 'content_failure';
        resultDetailCode = 'MODEL_BAKEOFF_TOKEN_CAP_EXCEEDED';
      } else if (observation.toolCallCount === 0) {
        resultKind = 'content_failure';
        resultDetailCode = 'MODEL_BAKEOFF_EXACT_TOOL_REQUIRED';
      } else if (!schemaValid) {
        resultKind = 'schema_failure';
        resultDetailCode = schemaFailureCode;
      } else if (!referencesValid) {
        resultKind = 'grounding_failure';
        resultDetailCode = referenceFailureCode;
      } else {
        resultKind = 'content_failure';
        resultDetailCode = 'MODEL_BAKEOFF_EXACT_TOOL_REQUIRED';
      }
      const result: ModelBakeoffTransportResult = deepFreeze({
        kind: resultKind,
        detailCode: resultDetailCode,
        preSideEffect: accepted.length === 0,
        sideEffectAccepted: accepted.length > 0,
        providerRequestMade:
          this.options.providerKind === 'real' && observation.capture.streamCount > 0,
        firstChunkDelayMs: observation.capture.firstChunkAtMs === null
          ? null
          : Math.max(0, observation.capture.firstChunkAtMs - startedAtMs),
        firstPublicTraceDelayMs: observation.firstPublicTraceAtMs === null
          ? null
          : Math.max(0, observation.firstPublicTraceAtMs - startedAtMs),
        usage: {
          ...normalizedUsage,
          totalTokens: normalizedUsage.inputTokens + normalizedUsage.outputTokens,
          estimatedCostUsd: this.options.estimateCostUsd(request.case, normalizedUsage),
        },
        providerFacts: providerFacts(request.case),
        toolResult: {
          ...expected,
          accepted: success,
          payloadSha256,
        },
        groundedInputRefs: imageRole
          ? [SYNTHETIC_IMAGE_REF, SYNTHETIC_SCENE_REF]
          : [SYNTHETIC_SCENE_REF],
        redactedOutputSha256: success
          ? sha256(reviewText)
          : canonicalSha256({
            caseId: request.case.caseId,
            payloadSha256,
            accepted: false,
          }),
        sessionEventRange: range,
      });

      const diagnostic: ModelBakeoffDshDiagnostic = deepFreeze({
        attemptId: request.attemptId,
        sentOrdinal: request.sentOrdinal,
        caseId: request.case.caseId,
        provider: request.case.provider,
        route: request.case.route,
        model: request.case.model,
        phase: request.case.phase,
        role: request.case.role,
        continuityKey: request.case.continuityKey,
        sessionId: String(session.id),
        streamCount: observation.capture.streamCount,
        undeclaredStreamCount: observation.capture.undeclaredStreamCount,
        toolCallCount: observation.toolCallCount,
        acceptedDomainEventCount: observation.acceptedEvents.length,
        availableTools: [...observation.capture.availableTools],
        imageBlockCount: prompt.filter(({ type }) => type === 'image').length,
        redactedOutputText: success ? reviewText : null,
        turnEndReason: reason,
        sessionEventRange: range,
      });
      const forbidden = this.options.forbiddenSubstrings ?? [];
      if (scanForForbidden({
        prompt,
        events: session.events,
        result,
        diagnostic,
      }, forbidden)) {
        throw new Error('MODEL_BAKEOFF_FORBIDDEN_CONTENT_DETECTED');
      }
      scope.harness.councilRegistry?.closeTurn(turn.snapshot.turnId);
      scope.activeTurn = null;
      this.diagnosticsLog.push(diagnostic);
      return result;
    } catch (error) {
      if (timer !== undefined) clearTimeout(timer);
      observation?.agent?.cancel({ kind: 'user' });
      try {
        await observation?.agent?.whenIdle();
      } catch {
        // The evidence result below records this as a failed attempt.
      }
      const fallbackSessionId = session === null ? randomUUID() : String(session.id);
      const range = session === null
        ? { sessionId: fallbackSessionId, fromSequence: 0, toSequence: 0 }
        : latestTurnRange(session).range;
      const result: ModelBakeoffTransportResult = deepFreeze({
        kind: timedOut ? 'late' as const : 'transport_failure' as const,
        detailCode: timedOut
          ? 'MODEL_BAKEOFF_ATTEMPT_TIMEOUT'
          : detailCode(error, this.options.forbiddenSubstrings),
        preSideEffect: (observation?.acceptedEvents.length ?? 0) === 0,
        sideEffectAccepted: (observation?.acceptedEvents.length ?? 0) > 0,
        providerRequestMade:
          this.options.providerKind === 'real'
          && (observation?.capture.streamCount ?? 0) > 0,
        firstChunkDelayMs: observation?.capture.firstChunkAtMs === null
          || observation?.capture.firstChunkAtMs === undefined
          ? null
          : Math.max(0, observation.capture.firstChunkAtMs - startedAtMs),
        firstPublicTraceDelayMs: null,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        },
        providerFacts: providerFacts(request.case),
        toolResult: expected,
        groundedInputRefs:
          request.case.role === 'Witness' || request.case.role === 'Rewriter'
            ? [SYNTHETIC_IMAGE_REF, SYNTHETIC_SCENE_REF]
            : [SYNTHETIC_SCENE_REF],
        redactedOutputSha256: canonicalSha256({
          code: detailCode(error, this.options.forbiddenSubstrings),
        }),
        sessionEventRange: range,
      });
      const reason = session === null ? null : latestTurnRange(session).reason;
      const diagnostic: ModelBakeoffDshDiagnostic = deepFreeze({
        attemptId: request.attemptId,
        sentOrdinal: request.sentOrdinal,
        caseId: request.case.caseId,
        provider: request.case.provider,
        route: request.case.route,
        model: request.case.model,
        phase: request.case.phase,
        role: request.case.role,
        continuityKey: request.case.continuityKey,
        sessionId: range.sessionId,
        streamCount: observation?.capture.streamCount ?? 0,
        undeclaredStreamCount: observation?.capture.undeclaredStreamCount ?? 0,
        toolCallCount: observation?.toolCallCount ?? 0,
        acceptedDomainEventCount: observation?.acceptedEvents.length ?? 0,
        availableTools: [...(observation?.capture.availableTools ?? [])],
        imageBlockCount: promptImageBlockCount,
        redactedOutputText: null,
        turnEndReason: reason,
        sessionEventRange: range,
      });
      const forbidden = this.options.forbiddenSubstrings ?? [];
      const containsForbidden = scanForForbidden({
        events: session?.events ?? [],
        result,
        diagnostic,
      }, forbidden);
      if (!containsForbidden) this.diagnosticsLog.push(diagnostic);
      return result;
    } finally {
      if (scope !== null) {
        observation?.releaseToolBinding?.();
        if (scope.activeTurn !== null) {
          try {
            scope.harness.councilRegistry?.closeTurn(scope.activeTurn.snapshot.turnId);
          } catch {
            // The attempt remains failed and its partial evidence is retained.
          }
          scope.activeTurn = null;
        }
        scope.active = null;
        scope.pendingChild = null;
        scope.pendingChildRole = null;
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.disposeScope();
  }

  private async requireScope(entry: ModelBakeoffCase): Promise<CandidateScope> {
    const key = scopeKeyOf(entry);
    if (this.scope?.key === key) return this.scope;
    await this.disposeScope();

    let scope: CandidateScope | null = null;
    const harness = await createFoundationHarness({
      persistenceRoot: this.options.persistenceRoot,
      now: this.now,
      toolProfile: 'council-v2',
      conductorSelection: {
        provider: entry.route,
        model: entry.model,
        maxTokens: this.options.roleCaps.ConductorIntent.maxOutputTokens,
      },
      mountAdapters: async (ctx) => {
        await ctx.plugin(LocalAttachmentStore, {
          dshHome: this.options.dshHome,
          maxImageBytes: Math.max(this.options.fixtures.syntheticImage.byteLength, 2_500_000),
          maxImagesPerMessage: 1,
          maxMessageImageBytes: Math.max(
            this.options.fixtures.syntheticImage.byteLength,
            2_500_000,
          ),
          maxImagePixels: 384 * 256,
        });
        await this.options.mountAdapters(ctx);
      },
    });
    try {
      const imageBlock = entry.provider === 'gemini'
        ? {
          type: 'image' as const,
          attachment: await harness.ctx.attachments.saveImage({
            data: this.options.fixtures.syntheticImage,
            mediaType: 'image/png',
            name: 'synthetic-spatial-image-01.png',
          }),
        }
        : null;
      const conductor = entry.provider === 'deepseek'
        ? await harness.createConductor(SessionId(randomUUID()), { parked: false })
        : null;
      scope = {
        key,
        entry,
        harness,
        acceptedShardHashes: [],
        settlementParents: [],
        conductor,
        imageBlock,
        activeTurn: null,
        active: null,
        pendingChild: null,
        pendingChildRole: null,
        disposed: false,
      };
      harness.ctx.subagents.registerContinuableSetup((childCtx) => {
        if (scope?.pendingChild === null || scope?.pendingChild === undefined) {
          throw new Error('MODEL_BAKEOFF_CHILD_ASSIGNMENT_MISSING');
        }
        const child = childCtx.agent;
        if (child === undefined) throw new Error('MODEL_BAKEOFF_CHILD_MISSING');
        if (scope.pendingChildRole === null || scope.activeTurn === null) {
          throw new Error('MODEL_BAKEOFF_CHILD_BINDING_MISSING');
        }
        scope.pendingChild.session = child.session;
        scope.pendingChild.agent = child;
        scope.pendingChild.capture.sessionId = String(child.id);
        const release = scope.harness.councilToolBindings?.bind({
          sessionId: child.id,
          role: scope.pendingChildRole,
          phase: 'SHARD',
          turn: scope.activeTurn,
        });
        if (release === undefined) {
          throw new Error('MODEL_BAKEOFF_COUNCIL_TOOL_BINDINGS_MISSING');
        }
        scope.pendingChild.releaseToolBinding = release;
        return release;
      });
      harness.ctx.on('tools/pre-execute', async (exec, next) => {
        const active = scope?.active;
        if (
          active !== null
          && active !== undefined
          && active.capture.sessionId === String(exec.agent?.id)
          && exec.name !== active.capture.expectedToolName
        ) {
          return {
            kind: 'deny' as const,
            reason: 'MODEL_BAKEOFF_EXACT_TOOL_REQUIRED',
          };
        }
        return next();
      });
      harness.ctx.on('session/event', (session, event) => {
        const active = scope?.active;
        if (active !== null && active !== undefined) appendObserved(active, session, event);
      });
      harness.ctx.on('agent/request', async ({ agent }, next) => {
        const config = await next();
        const active = scope?.active;
        if (
          active === null
          || active === undefined
          || active.capture.sessionId !== String(agent.id)
        ) return config;
        return {
          ...config,
          maxTokens: active.capture.maxOutputTokens,
          ...(active.capture.expectedModel === 'gemini-3.7-flash'
            ? { reasoningEffort: ReasoningEffortId('low') }
            : {}),
        };
      });
      harness.ctx.on('llm/stream', (request: GenerateOptions, next) => {
        const active = scope?.active;
        if (
          active === null
          || active === undefined
          || active.capture.sessionId === null
          || String(request.sessionId) !== active.capture.sessionId
        ) {
          if (active !== null && active !== undefined) {
            active.capture.undeclaredStreamCount += 1;
          }
          throw new Error('MODEL_BAKEOFF_UNDECLARED_STREAM');
        }
        if (
          request.provider !== active.capture.expectedRoute
          || request.model !== active.capture.expectedModel
          || request.maxTokens !== active.capture.maxOutputTokens
        ) {
          throw new Error('MODEL_BAKEOFF_ROUTE_MODEL_MISMATCH');
        }
        active.capture.streamCount += 1;
        if (active.capture.streamCount > 1) {
          active.capture.undeclaredStreamCount += 1;
          throw new Error('MODEL_BAKEOFF_UNDECLARED_STREAM');
        }
        active.capture.availableTools = Object.freeze(
          request.tools?.map(({ name }) => name) ?? [],
        );
        return observeStream(active.capture, next(), this.now);
      });
      this.scope = scope;
      return scope;
    } catch (error) {
      await harness.dispose();
      throw error;
    }
  }

  private promptFor(
    request: ModelBakeoffDispatchRequest,
    scope: CandidateScope,
    turn: FrozenCouncilTurn,
  ): ContentBlock[] {
    const imageRole = request.case.role === 'Witness' || request.case.role === 'Rewriter';
    if (imageRole && scope.imageBlock === null) {
      throw new Error('MODEL_BAKEOFF_SYNTHETIC_IMAGE_MISSING');
    }
    const context: ModelBakeoffPromptContext = deepFreeze({
      contextVersion: 'cp03-model-bakeoff-prompt-context/0.3',
      runId: request.runId,
      approvalId: request.approvalId,
      caseId: request.case.caseId,
      phase: request.case.phase,
      role: request.case.role,
      repetition: request.case.repetition,
      continuityKey: request.case.continuityKey,
      allowedReferences: allowedCouncilReferences(turn),
      imageInputRefId: imageRole ? SYNTHETIC_IMAGE_REF : null,
      priorAcceptedShardHashes: [...scope.acceptedShardHashes],
    });
    const toolArgumentRules = deepFreeze({
      argumentShape: 'direct-object',
      modelFacingContract: request.case.phase === 'ConductorCommit'
        ? 'conductor-commit-submission/0.1'
        : 'council-role-submission/0.1',
      semanticCapabilityId: 'performRegisteredInteraction',
    });
    const template = this.options.fixtures.promptManifest.templates[request.case.phase];
    if (template === undefined) throw new Error('MODEL_BAKEOFF_PROMPT_TEMPLATE_MISSING');
    const prompt: ContentBlock[] = [{
      type: 'text',
      text: [
        template,
        'Use only the immutable fictional fixture below. Call the phase tool exactly once.',
        'Pass one JSON object directly as the tool arguments: never wrap it under shard or argument and never JSON-stringify it.',
        'Author only fields in modelFacingContract. The host binds role, kind, session, turn, schema, hashes, versions, deadline, shard identity, and commit status; never add those fields.',
        'For Rewriter semanticCapabilityCalls, capability must equal semanticCapabilityId from the same rules object.',
        `PACT_BAKEOFF_TOOL_ARGUMENT_RULES_JSON=${canonicalJson(toolArgumentRules)}`,
        `PACT_BAKEOFF_CONTEXT_JSON=${canonicalJson(context)}`,
        `PACT_BAKEOFF_FIXTURE_JSON=${canonicalJson(this.options.fixtures.manifest)}`,
      ].join('\n'),
    }];
    if (imageRole) prompt.push(scope.imageBlock!);
    return prompt;
  }

  private async disposeScope(): Promise<void> {
    const scope = this.scope;
    this.scope = null;
    if (scope === null || scope.disposed) return;
    scope.disposed = true;
    try {
      if (scope.activeTurn !== null) {
        scope.harness.councilRegistry?.closeTurn(scope.activeTurn.snapshot.turnId);
        scope.activeTurn = null;
      }
    } catch {
      // Closing an already closed synthetic turn does not broaden authority.
    }
    await scope.harness.dispose();
  }
}

export async function createModelBakeoffDshTransport(
  options: ModelBakeoffDshTransportOptions,
): Promise<ModelBakeoffDshTransport> {
  if (options.providerKind !== 'scripted' && options.providerKind !== 'real') {
    throw new Error('MODEL_BAKEOFF_PROVIDER_KIND_INVALID');
  }
  return new DshModelBakeoffTransport(options);
}
