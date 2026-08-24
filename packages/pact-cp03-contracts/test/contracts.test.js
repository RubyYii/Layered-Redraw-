import { describe, expect, it } from "vitest";

import {
  CP03_COUNCIL_SCHEMA_VERSION,
  CP03_RUNTIME_SCHEMA_VERSION,
  canonicalJson,
  sha256Canonical,
  validateAgentActionDraft,
  validateAgentContribution,
  validateApprovalRecord,
  validateConductorCommitSubmission,
  validateConductorDraftCommit,
  validateCouncilRoleSubmission,
  validateCouncilShard,
  validateModelBakeoffApproval,
  validateModelBakeoffAttempt,
  validateModelBakeoffSelection,
  validateProviderCallEnvelope,
  validateProviderRoutingManifest,
  validateViewerTurn,
} from "../src/index.js";
import {
  kindByRole,
  validAgentActionDraft,
  validAgentContribution,
  validApprovalRecord,
  validConductorCommitSubmission,
  validConductorDraftCommit,
  validCouncilRoleSubmissions,
  validCouncilShards,
  validModelBakeoffApproval,
  validModelBakeoffAttempt,
  validModelBakeoffSelection,
  validProviderCallEnvelope,
  validProviderRoutingManifest,
  validRuntimeAgentActionDraft,
  validViewerTurn,
} from "./fixtures.js";

const allRoutingAssignmentsFor = (provider) => {
  const route = provider === "deepseek" ? "deepseek-official" : "gemini-official";
  const model = provider === "deepseek"
    ? "deepseek-model-pending-bakeoff"
    : "gemini-model-pending-bakeoff";
  const adapterPackage = provider === "deepseek"
    ? "@deepseek-ai/dsh-llm-deepseek"
    : "@deepseek-ai/dsh-llm-pi-ai";
  return Object.fromEntries(Object.keys(validProviderRoutingManifest.assignments).map((role) => [
    role,
    {
      ...validProviderRoutingManifest.assignments[role],
      provider,
      route,
      model,
      adapterPackage,
    },
  ]));
};

describe("CP03 foundation gate contracts", () => {
  it("canonicalises object keys but preserves array order", async () => {
    expect(canonicalJson({ b: 2, a: [3, 1] })).toBe('{"a":[3,1],"b":2}');
    expect(await sha256Canonical({ b: 2, a: [3, 1] }))
      .toBe(await sha256Canonical({ a: [3, 1], b: 2 }));
    expect(await sha256Canonical({ a: [1, 3], b: 2 }))
      .not.toBe(await sha256Canonical({ a: [3, 1], b: 2 }));
  });

  it("rejects values outside plain finite JSON", () => {
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => canonicalJson({ value: undefined })).toThrow(/plain JSON/);
    expect(() => canonicalJson(new Date())).toThrow(/plain JSON/);
  });

  it("accepts the authority-separated foundation and runtime fixtures", () => {
    expect(CP03_RUNTIME_SCHEMA_VERSION).toBe("cp03-runtime/0.1");
    expect(validateViewerTurn(validViewerTurn)).toBe(validViewerTurn);
    expect(validateAgentContribution(validAgentContribution)).toBe(validAgentContribution);
    expect(validateAgentActionDraft(validAgentActionDraft)).toBe(validAgentActionDraft);
    expect(validateAgentActionDraft(validRuntimeAgentActionDraft)).toBe(validRuntimeAgentActionDraft);
    expect(validateApprovalRecord(validApprovalRecord)).toBe(validApprovalRecord);
    expect(validateProviderCallEnvelope(validProviderCallEnvelope)).toBe(validProviderCallEnvelope);
  });

  it("requires structured runtime evidence and keeps restriction sets independently typed", () => {
    expect(validateAgentActionDraft(validAgentActionDraft)).toBe(validAgentActionDraft);
    expect(validateAgentActionDraft({
      ...validRuntimeAgentActionDraft,
      execution: {
        ...validRuntimeAgentActionDraft.execution,
        forbiddenChanges: [],
        forbiddenCapabilityIds: [],
        rollbackRequirements: [],
      },
    })).toBeTruthy();
    expect(() => validateAgentActionDraft({
      ...validRuntimeAgentActionDraft,
      execution: {
        ...validRuntimeAgentActionDraft.execution,
        forbiddenCapabilityIds: undefined,
      },
    })).toThrow(/required|forbiddenCapabilityIds/);
    expect(() => validateAgentActionDraft({
      ...validRuntimeAgentActionDraft,
      agency: {
        ...validRuntimeAgentActionDraft.agency,
        witnessEvidence: undefined,
      },
    })).toThrow(/required|witnessEvidence/);
    expect(() => validateAgentActionDraft({
      ...validRuntimeAgentActionDraft,
      agency: {
        ...validRuntimeAgentActionDraft.agency,
        dissentRecords: undefined,
      },
    })).toThrow(/required|dissentRecords/);
  });

  it("accepts every frozen council shard, the minimal commit, and the dual-provider manifest", () => {
    expect(CP03_COUNCIL_SCHEMA_VERSION).toBe("cp03-council/0.2");
    for (const [role, shard] of Object.entries(validCouncilShards)) {
      expect(shard.role).toBe(role);
      expect(shard.kind).toBe(kindByRole[role]);
      expect(Object.isFrozen(shard)).toBe(true);
      expect(validateCouncilShard(shard)).toBe(shard);
    }
    expect(validateConductorDraftCommit(validConductorDraftCommit))
      .toBe(validConductorDraftCommit);
    expect(validateProviderRoutingManifest(validProviderRoutingManifest))
      .toBe(validProviderRoutingManifest);
  });

  it("accepts only agent-owned role and Conductor submission fields", () => {
    for (const submission of Object.values(validCouncilRoleSubmissions)) {
      expect(Object.keys(submission).sort()).toEqual([
        "content",
        "evidenceAnchors",
        "publicTrace",
        "uncertainties",
      ]);
      expect(validateCouncilRoleSubmission(submission)).toBe(submission);
    }
    expect(validateConductorCommitSubmission(validConductorCommitSubmission))
      .toBe(validConductorCommitSubmission);
  });

  it.each([
    ["schemaVersion", "cp03-council/0.2"],
    ["shardId", "shard_model_must_not_author"],
    ["kind", "WITNESS"],
    ["role", "Witness"],
    ["childSessionId", "550e8400-e29b-41d4-a716-446655440099"],
    ["caseSessionId", "case_model_must_not_author"],
    ["turnId", "turn_model_must_not_author"],
    ["snapshotHash", "a".repeat(64)],
    ["parentSceneHash", "b".repeat(64)],
    ["registryVersion", "cp03-registry/0.1"],
    ["routingManifestVersion", "cp03-council-routing/manifest-0.1"],
    ["deadlineId", "deadline_model_must_not_author"],
  ])("rejects runtime-owned role submission field %s", (field, value) => {
    expect(() => validateCouncilRoleSubmission({
      ...validCouncilRoleSubmissions.Witness,
      [field]: value,
    })).toThrow(/additionalProperties/);
  });

  it.each([
    ["schemaVersion", "cp03-council/0.2"],
    ["turnId", "turn_model_must_not_author"],
    ["status", "PROPOSED"],
  ])("rejects runtime-owned Conductor commit field %s", (field, value) => {
    expect(() => validateConductorCommitSubmission({
      ...validConductorCommitSubmission,
      [field]: value,
    })).toThrow(/additionalProperties/);
  });

  it("rejects wrappers and executable or location-bearing model fields", () => {
    expect(() => validateCouncilRoleSubmission({
      shard: validCouncilRoleSubmissions.Witness,
    })).toThrow(/validation failed/);
    expect(() => validateConductorCommitSubmission({
      argument: validConductorCommitSubmission,
    })).toThrow(/validation failed/);
    for (const forbiddenField of ["url", "path", "code"]) {
      expect(() => validateCouncilRoleSubmission({
        ...validCouncilRoleSubmissions.Witness,
        [forbiddenField]: `forbidden-${forbiddenField}`,
      })).toThrow(/additionalProperties/);
    }
    expect(() => validateCouncilRoleSubmission({
      ...validCouncilRoleSubmissions.Rewriter,
      content: {
        ...validCouncilRoleSubmissions.Rewriter.content,
        semanticCapabilityCalls: [{
          capability: "rawTransform",
          arguments: {
            actorId: "interaction-actor-a",
            targetId: "interaction-cup",
            affordance: "pickup",
          },
        }],
      },
    })).toThrow(/validation failed/);
    expect(() => validateCouncilRoleSubmission({
      ...validCouncilRoleSubmissions.Rewriter,
      content: {
        ...validCouncilRoleSubmissions.Rewriter.content,
        semanticCapabilityCalls: [{
          capability: "performRegisteredInteraction",
          arguments: {
            actorId: "interaction-actor-a",
            targetId: "interaction-cup",
            affordance: "pickup",
            position: [99, 0, 0],
          },
        }],
      },
    })).toThrow(/validation failed/);
  });

  it("rejects prose where Archivist rights references require registry IDs", () => {
    expect(() => validateCouncilRoleSubmission({
      ...validCouncilRoleSubmissions.Archivist,
      content: {
        ...validCouncilRoleSubmissions.Archivist.content,
        rightsRequirements: ["synthetic-fixture-only"],
      },
    })).toThrow(/validation failed/);
  });

  it("keeps council roles, commit authority, capability arguments, and providers closed", () => {
    expect(() => validateCouncilShard({
      ...validCouncilShards.Rewriter,
      role: "Guardian",
    })).toThrow(/validation failed/);
    expect(() => validateCouncilShard({
      ...validCouncilShards.Rewriter,
      kind: "GUARDIAN",
    })).toThrow(/validation failed/);
    expect(() => validateConductorDraftCommit({
      ...validConductorDraftCommit,
      creative: { publicPoeticText: "not allowed in a commit" },
    })).toThrow(/additionalProperties/);
    expect(() => validateCouncilShard({
      ...validCouncilShards.Rewriter,
      content: {
        ...validCouncilShards.Rewriter.content,
        semanticCapabilityCalls: [{
          capability: "performRegisteredInteraction",
          arguments: {
            actorId: "interaction-actor-a",
            targetId: "interaction-cup",
            affordance: "pickup",
            position: [99, 0, 0],
          },
        }],
      },
    })).toThrow(/validation failed/);
    expect(() => validateConductorDraftCommit({
      ...validConductorDraftCommit,
      actionSequence: ["Continue", "Reframe"],
    })).toThrow(/validation failed/);
    expect(() => validateProviderRoutingManifest({
      ...validProviderRoutingManifest,
      assignments: {
        ...validProviderRoutingManifest.assignments,
        CaseConductor: {
          ...validProviderRoutingManifest.assignments.CaseConductor,
          provider: "unapproved-provider",
        },
      },
    })).toThrow(/validation failed/);
  });

  it("requires both provider families in the routing manifest", () => {
    expect(() => validateProviderRoutingManifest({
      ...validProviderRoutingManifest,
      assignments: allRoutingAssignmentsFor("deepseek"),
    })).toThrow(/validation failed/);
  });

  it.each([
    ["provider and route", { provider: "deepseek", route: "gemini-official" }],
    ["provider and model family", {
      provider: "deepseek",
      model: "gemini-model-pending-bakeoff",
    }],
    ["provider and adapter package", {
      provider: "deepseek",
      adapterPackage: "@google/generative-ai",
    }],
    ["URL-like model identifier", {
      model: "https://models.example.test/deepseek-model",
    }],
  ])("rejects %s routing assignments", (_label, override) => {
    expect(() => validateProviderRoutingManifest({
      ...validProviderRoutingManifest,
      assignments: {
        ...validProviderRoutingManifest.assignments,
        CaseConductor: {
          ...validProviderRoutingManifest.assignments.CaseConductor,
          ...override,
        },
      },
    })).toThrow(/validation failed/);
  });

  it("rejects the legacy Google Gemini adapter instead of the installed DSH PI adapter", () => {
    expect(() => validateProviderRoutingManifest({
      ...validProviderRoutingManifest,
      assignments: {
        ...validProviderRoutingManifest.assignments,
        Witness: {
          ...validProviderRoutingManifest.assignments.Witness,
          adapterPackage: "@google/generative-ai",
        },
      },
    })).toThrow(/validation failed/);
  });

  it("keeps Archivist rights requirements registry-bound rather than licence prose", () => {
    expect(validCouncilShards.Archivist.content.rightsRequirements)
      .toEqual(["rights-local-scene"]);
    expect(validateCouncilShard(validCouncilShards.Archivist))
      .toBe(validCouncilShards.Archivist);
    for (const rightsRequirement of ["Licensed under CC-BY 4.0", "CC-BY-4.0"]) {
      expect(() => validateCouncilShard({
        ...validCouncilShards.Archivist,
        content: {
          ...validCouncilShards.Archivist.content,
          rightsRequirements: [rightsRequirement],
        },
      })).toThrow(/validation failed/);
    }
  });

  it("rejects requested action authority in a viewer turn", () => {
    expect(() => validateViewerTurn({ ...validViewerTurn, action: "Reframe" }))
      .toThrow(/additionalProperties/);
  });

  it("rejects provider self-reporting in a role contribution", () => {
    expect(() => validateAgentContribution({ ...validAgentContribution, provider: "self-reported" }))
      .toThrow(/additionalProperties/);
  });

  it("rejects executable capability calls and scene changes in a gate draft", () => {
    expect(() => validateAgentActionDraft({
      ...validAgentActionDraft,
      execution: {
        ...validAgentActionDraft.execution,
        semanticCapabilityCalls: [{ capability: "rawTransform", arguments: { position: [99, 0, 0] } }],
      },
    })).toThrow(/maxItems/);
    expect(() => validateAgentActionDraft({
      ...validAgentActionDraft,
      execution: { ...validAgentActionDraft.execution, expectedChanges: ["move chair"] },
    })).toThrow(/maxItems/);
  });

  it.each(["position", "path", "url", "script"])(
    "rejects provider-authored %s in an executable capability call",
    (field) => {
      expect(() => validateAgentActionDraft({
        ...validRuntimeAgentActionDraft,
        execution: {
          ...validRuntimeAgentActionDraft.execution,
          semanticCapabilityCalls: [{
            capability: "performRegisteredInteraction",
            arguments: {
              actorId: "interaction-actor-a",
              targetId: "interaction-cup",
              affordance: "pickup",
              [field]: field === "url" ? "https://example.com/model.glb" : [1, 2, 3],
            },
          }],
        },
      })).toThrow(/validation failed/);
    },
  );

  it("keeps executable authority proposal-only and capability-bounded", () => {
    expect(() => validateAgentActionDraft({
      ...validRuntimeAgentActionDraft,
      decision: { ...validRuntimeAgentActionDraft.decision, status: "DRAFT" },
    })).toThrow(/validation failed/);
    expect(() => validateAgentActionDraft({
      ...validRuntimeAgentActionDraft,
      execution: {
        ...validRuntimeAgentActionDraft.execution,
        semanticCapabilityCalls: [{
          capability: "rawTransform",
          arguments: {
            actorId: "interaction-actor-a",
            targetId: "interaction-cup",
            affordance: "pickup",
          },
        }],
      },
    })).toThrow(/validation failed/);
  });

  it("rejects malformed approval identity and undeclared authority", () => {
    expect(() => validateApprovalRecord({
      ...validApprovalRecord,
      caseSessionId: "another-case",
    })).toThrow(/validation failed/);
    expect(() => validateApprovalRecord({
      ...validApprovalRecord,
      approvedBy: "agent",
    })).toThrow(/validation failed/);
    expect(() => validateApprovalRecord({
      ...validApprovalRecord,
      transform: [0, 0, 0],
    })).toThrow(/validation failed/);
  });

  it("permits terminal actions only at the end of the sequence", () => {
    expect(() => validateAgentActionDraft({
      ...validAgentActionDraft,
      decision: { ...validAgentActionDraft.decision, actionSequence: ["Continue", "Reframe"] },
    })).toThrow(/oneOf|items/);
    expect(validateAgentActionDraft({
      ...validAgentActionDraft,
      decision: { ...validAgentActionDraft.decision, actionSequence: ["Reframe", "KeepOpaque"] },
      execution: { ...validAgentActionDraft.execution, terminalIntent: "KeepOpaque" },
    })).toBeTruthy();
    expect(() => validateAgentActionDraft({
      ...validAgentActionDraft,
      decision: { ...validAgentActionDraft.decision, actionSequence: ["Reframe", "Continue"] },
      execution: { ...validAgentActionDraft.execution, terminalIntent: "KeepOpaque" },
    })).toThrow(/const/);
  });

  it("rejects secret-bearing or model-authored provider envelope fields", () => {
    expect(() => validateProviderCallEnvelope({ ...validProviderCallEnvelope, apiKey: "secret" }))
      .toThrow(/additionalProperties/);
    expect(() => validateProviderCallEnvelope({
      ...validProviderCallEnvelope,
      nativeResponseSchema: "SUPPORTED",
    })).toThrow(/const/);
  });

  it("reports schema locations and keywords without echoing input text", () => {
    const sensitiveText = "do-not-echo-this-viewer-phrase";
    try {
      validateViewerTurn({ ...validViewerTurn, text: sensitiveText, action: "Reframe" });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error.message).toContain("additionalProperties");
      expect(error.message).not.toContain(sensitiveText);
      expect(error.message).not.toContain("Reframe");
    }
  });

  it("accepts the closed model-bakeoff approval, attempt, and author selection contracts", () => {
    expect(validateModelBakeoffApproval(validModelBakeoffApproval))
      .toBe(validModelBakeoffApproval);
    expect(validateModelBakeoffAttempt(validModelBakeoffAttempt))
      .toBe(validModelBakeoffAttempt);
    expect(validateModelBakeoffSelection(validModelBakeoffSelection))
      .toBe(validModelBakeoffSelection);
  });

  it("freezes the exact ordered candidate scope and approval authority", () => {
    expect(() => validateModelBakeoffApproval({
      ...validModelBakeoffApproval,
      candidates: [
        validModelBakeoffApproval.candidates[1],
        validModelBakeoffApproval.candidates[0],
        ...validModelBakeoffApproval.candidates.slice(2),
      ],
    })).toThrow(/validation failed/);
    expect(() => validateModelBakeoffApproval({
      ...validModelBakeoffApproval,
      externalCapabilities: ["search"],
    })).toThrow(/validation failed/);
    expect(() => validateModelBakeoffApproval({
      ...validModelBakeoffApproval,
      automaticRerun: true,
    })).toThrow(/validation failed/);
  });

  it("requires redacted durable attempt evidence without secret or raw-output fields", () => {
    expect(() => validateModelBakeoffAttempt({
      ...validModelBakeoffAttempt,
      rawOutput: "provider response must not enter this contract",
    })).toThrow(/additionalProperties/);
    expect(() => validateModelBakeoffAttempt({
      ...validModelBakeoffAttempt,
      providerFacts: {
        ...validModelBakeoffAttempt.providerFacts,
        adapterPackage: "@google/generative-ai",
      },
    })).toThrow(/validation failed/);
    expect(() => validateModelBakeoffAttempt({
      ...validModelBakeoffAttempt,
      sessionEventRange: null,
    })).toThrow(/validation failed/);
  });

  it("records late attempt latency honestly while closing provider-phase and tool-contract pairs", () => {
    expect(validateModelBakeoffAttempt({
      ...validModelBakeoffAttempt,
      latency: { completeMs: 15001, publicTraceMs: 13000 },
      finish: { kind: "late", detailCode: "HARD_TIMEOUT_EXCEEDED" },
      sideEffectAccepted: false,
      toolResult: { ...validModelBakeoffAttempt.toolResult, accepted: false },
    })).toBeTruthy();
    expect(() => validateModelBakeoffAttempt({
      ...validModelBakeoffAttempt,
      phase: "Archivist",
      role: "Archivist",
    })).toThrow(/validation failed/);
    expect(() => validateModelBakeoffAttempt({
      ...validModelBakeoffAttempt,
      toolResult: {
        ...validModelBakeoffAttempt.toolResult,
        name: "pact_submit_conductor_commit",
        contract: "conductor-draft-commit/0.1",
      },
    })).toThrow(/validation failed/);
  });

  it("keeps the signed blind selection identity-free and exactly five-role", () => {
    expect(() => validateModelBakeoffSelection({
      ...validModelBakeoffSelection,
      model: "gemini-3.7-flash",
    })).toThrow(/additionalProperties/);
    expect(() => validateModelBakeoffSelection({
      ...validModelBakeoffSelection,
      decisions: validModelBakeoffSelection.decisions.slice(0, 4),
    })).toThrow(/validation failed/);
    expect(() => validateModelBakeoffSelection({
      ...validModelBakeoffSelection,
      decisions: validModelBakeoffSelection.decisions.map((decision, index) => index === 0
        ? { ...decision, roleDecision: "Witness" }
        : decision),
    })).toThrow(/validation failed/);
  });
});
