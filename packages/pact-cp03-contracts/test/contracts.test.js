import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  sha256Canonical,
  validateAgentActionDraft,
  validateAgentContribution,
  validateProviderCallEnvelope,
  validateViewerTurn,
} from "../src/index.js";
import {
  validAgentActionDraft,
  validAgentContribution,
  validProviderCallEnvelope,
  validViewerTurn,
} from "./fixtures.js";

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

  it("accepts the four authority-separated fixtures", () => {
    expect(validateViewerTurn(validViewerTurn)).toBe(validViewerTurn);
    expect(validateAgentContribution(validAgentContribution)).toBe(validAgentContribution);
    expect(validateAgentActionDraft(validAgentActionDraft)).toBe(validAgentActionDraft);
    expect(validateProviderCallEnvelope(validProviderCallEnvelope)).toBe(validProviderCallEnvelope);
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
});
