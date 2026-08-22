import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import type { Session } from '@deepseek-ai/dsh-session';
import {
  CP03_FOUNDATION_SCHEMA_VERSION,
  validateProviderCallEnvelope,
} from '@layered-redraw/pact-cp03-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  COMPATIBILITY_LIMITS,
  inspectCompatibilityConfig,
} from '../src/compatibility-config.js';
import {
  resolveProviderCatalog,
  type ProviderCatalogResolution,
} from '../src/catalog-eligibility.js';
import {
  CompatibilityDispatchError,
  ProviderDispatcher,
} from '../src/dispatch-budget.js';
import {
  createFakeCompatibilityTransport,
  runCompatibilityPlan,
} from '../src/compatibility-runner.js';
import {
  estimateWorstCaseCost,
} from '../src/pricing-budget.js';
import { resolveOfficialPricing } from '../src/official-pricing.js';
import { buildProviderPreflightReport } from '../src/preflight-report.js';
import {
  COMPATIBILITY_EXECUTION_WAVES,
  COMPATIBILITY_PROBES,
  probePlanSummary,
} from '../src/probe-plan.js';
import {
  createSyntheticCheckerboardPng,
  saveSyntheticCheckerboard,
} from '../src/synthetic-checkerboard.js';
import { SubmissionRegistry } from '../src/submission-registry.js';

const contexts: Context[] = [];
const SYNTHETIC_ATTACHMENT_ID = `sha256:${'a'.repeat(64)}`;

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose();
});

const completeEnv = (): NodeJS.ProcessEnv => ({
  PACT_DEEPSEEK_MODEL: 'deepseek-v4-pro',
  PACT_GEMINI_ROUTE: 'google',
  PACT_GEMINI_MODEL: 'gemini-3.5-flash',
  PACT_COMPAT_MAX_USD: '2.50',
  DEEPSEEK_API_KEY: 'do-not-retain-deepseek',
  GEMINI_API_KEY: 'do-not-retain-gemini',
});

describe('provider compatibility configuration', () => {
  it('returns only credential presence and never retains secret values', () => {
    const inspected = inspectCompatibilityConfig(completeEnv());

    expect(inspected.status).toBe('CONFIGURED');
    expect(inspected.missing).toEqual([]);
    expect(inspected.deepseek).toMatchObject({
      route: 'deepseek-official',
      model: 'deepseek-v4-pro',
      credentialRef: 'DEEPSEEK_API_KEY',
      credentialPresent: true,
    });
    expect(inspected.gemini).toMatchObject({
      route: 'google',
      model: 'gemini-3.5-flash',
      credentialRef: 'GEMINI_API_KEY',
      credentialPresent: true,
    });
    expect(JSON.stringify(inspected)).not.toContain('do-not-retain');
  });

  it('fails closed on every missing selector, cap, or credential reference', () => {
    const inspected = inspectCompatibilityConfig({});

    expect(inspected.status).toBe('NOT_CONFIGURED');
    expect(inspected.missing).toEqual([
      'PACT_DEEPSEEK_MODEL',
      'PACT_GEMINI_ROUTE',
      'PACT_GEMINI_MODEL',
      'PACT_COMPAT_MAX_USD',
      'DEEPSEEK_API_KEY',
      'GEMINI_API_KEY',
    ]);
  });
});

describe('fixed eight-probe plan', () => {
  it('fixes the intended probes, 8 planned dispatches, and 10 hard maximum', () => {
    const summary = probePlanSummary(COMPATIBILITY_PROBES);

    expect(summary).toEqual({
      intendedProbes: 8,
      plannedDispatches: 8,
      maximumDispatches: 10,
      byProvider: {
        deepseek: { probes: 5, plannedDispatches: 5, maximumDispatches: 6 },
        gemini: { probes: 3, plannedDispatches: 3, maximumDispatches: 4 },
      },
    });
    expect(COMPATIBILITY_PROBES.map((probe) => probe.label)).toEqual([
      'DeepSeek schema contribution',
      'DeepSeek conductor route/trace',
      'Gemini schema contribution',
      'Gemini multimodal continuable Rewriter',
      'DeepSeek parallel Guardian',
      'DeepSeek conductor non-executable draft',
      'DeepSeek hard-timeout cancel',
      'Gemini cancel after first chunk',
    ]);
    expect(COMPATIBILITY_PROBES[3]?.dependsOn).toEqual([]);
    expect(COMPATIBILITY_PROBES[4]?.dependsOn).toEqual([]);
    expect(COMPATIBILITY_PROBES[5]?.dependsOn).toEqual([
      'probe-02',
      'probe-04',
      'probe-05',
    ]);
    expect(COMPATIBILITY_EXECUTION_WAVES).toEqual([
      ['probe-01', 'probe-03'],
      ['probe-02', 'probe-04', 'probe-05'],
      ['probe-06'],
      ['probe-07', 'probe-08'],
    ]);
    for (const probeNumber of [0, 1, 2, 3, 4, 5] as const) {
      expect(COMPATIBILITY_PROBES[probeNumber]?.dispatches.map(
        (dispatch) => dispatch.expectedOutcome,
      )).toEqual(['structured-tool']);
    }
  });
});

describe('bounded fake dispatcher', () => {
  it('completes eight probes with the planned 8 dispatches', async () => {
    const transport = createFakeCompatibilityTransport();
    const result = await runCompatibilityPlan({
      config: inspectCompatibilityConfig(completeEnv()),
      transport,
      runId: 'compat_fake_success',
      syntheticAttachmentId: SYNTHETIC_ATTACHMENT_ID,
    });

    expect(result).toMatchObject({ completedProbes: 8, sentDispatches: 8 });
    expect(transport.attempts).toHaveLength(8);
    expect(result.attemptRecords).toHaveLength(8);
    expect(
      result.attemptRecords.every((record) =>
        validateProviderCallEnvelope(record.contract) === record.contract
      ),
    ).toBe(true);
    const multimodal = result.attemptRecords.filter(
      (record) => record.probeId === 'probe-04',
    );
    expect(multimodal).toHaveLength(1);
    expect(multimodal.every((record) =>
      record.attachmentId === SYNTHETIC_ATTACHMENT_ID &&
      record.contract.inputClasses.includes('synthetic_image')
    )).toBe(true);
    expect(multimodal.map((record) => record.contract.finish.kind)).toEqual([
      'tool_calls',
    ]);
  });

  it('uses at most one pre-side-effect transport retry for each provider', async () => {
    const deepseekReset = createFakeCompatibilityTransport({
      resetBeforeSideEffect: ['deepseek'],
    });
    const oneRetry = await runCompatibilityPlan({
      config: inspectCompatibilityConfig(completeEnv()),
      transport: deepseekReset,
      runId: 'compat_fake_deepseek_retry',
      syntheticAttachmentId: SYNTHETIC_ATTACHMENT_ID,
    });
    expect(oneRetry).toMatchObject({ completedProbes: 8, sentDispatches: 9 });
    const retriedDeepSeek = oneRetry.attemptRecords.filter(
      (record) => record.contract.retryOf !== null,
    );
    expect(retriedDeepSeek).toHaveLength(1);
    expect(retriedDeepSeek[0]?.provider).toBe('deepseek');
    expect(oneRetry.attemptRecords[0]?.contract.finish).toMatchObject({
      kind: 'error',
      detailCode: 'TRANSPORT_RESET',
    });

    const bothReset = createFakeCompatibilityTransport({
      resetBeforeSideEffect: ['deepseek', 'gemini'],
    });
    const twoRetries = await runCompatibilityPlan({
      config: inspectCompatibilityConfig(completeEnv()),
      transport: bothReset,
      runId: 'compat_fake_both_retry',
      syntheticAttachmentId: SYNTHETIC_ATTACHMENT_ID,
    });
    expect(twoRetries).toMatchObject({ completedProbes: 8, sentDispatches: 10 });
    expect(twoRetries.attemptRecords.filter(
      (record) => record.contract.retryOf !== null,
    )).toHaveLength(2);
  });

  it('refuses an eleventh dispatch before invoking transport', async () => {
    let calls = 0;
    const dispatcher = new ProviderDispatcher({
      deadlineAt: Date.now() + COMPATIBILITY_LIMITS.deadlineMs,
      maximumDispatches: 10,
      transport: async () => {
        calls += 1;
        return {
          kind: 'success',
          outcome: 'structured-tool',
          sideEffectAccepted: true,
        };
      },
    });
    const request = {
      probeId: 'probe-budget-only',
      provider: 'deepseek' as const,
      route: 'deepseek-official',
      model: 'deepseek-v4-pro',
      purpose: 'budget boundary',
      expectedOutcome: 'structured-tool' as const,
      expectedTools: ['pact_submit_contribution'] as const,
    };

    for (let index = 0; index < 10; index += 1) {
      await dispatcher.dispatch(request, `compat_budget_${index}`);
    }
    await expect(
      dispatcher.dispatch(request, 'compat_budget_refused'),
    ).rejects.toMatchObject({ code: 'DISPATCH_BUDGET_EXHAUSTED' });
    expect(calls).toBe(10);
  });

  it('rejects a path or URL in place of a durable attachment id before transport', async () => {
    let calls = 0;
    const dispatcher = new ProviderDispatcher({
      deadlineAt: Date.now() + COMPATIBILITY_LIMITS.deadlineMs,
      maximumDispatches: 10,
      transport: async () => {
        calls += 1;
        return {
          kind: 'success',
          outcome: 'structured-tool',
          sideEffectAccepted: true,
        };
      },
    });

    await expect(dispatcher.dispatch({
      probeId: 'probe-bad-attachment',
      provider: 'gemini',
      route: 'google',
      model: 'gemini-3.5-flash',
      purpose: 'reject a non-reference input',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_contribution'],
      attachmentId: 'file:///Users/example/private.png',
    }, 'compat_bad_attachment')).rejects.toThrow(
      'SYNTHETIC_ATTACHMENT_REFERENCE_INVALID',
    );
    expect(dispatcher.sentDispatches).toBe(0);
    expect(calls).toBe(0);
  });

  it('never retries a tool-result continuation after that probe accepted a tool side effect', async () => {
    let calls = 0;
    const dispatcher = new ProviderDispatcher({
      deadlineAt: Date.now() + COMPATIBILITY_LIMITS.deadlineMs,
      maximumDispatches: 10,
      transport: async (record) => {
        calls += 1;
        if (record.expectedOutcome === 'structured-tool') {
          return {
            kind: 'success',
            outcome: 'structured-tool',
            sideEffectAccepted: true,
          };
        }
        return {
          kind: 'failure',
          code: 'TRANSPORT_RESET',
          message: 'connection reset before the continuation produced output',
          preSideEffect: true,
          sideEffectAccepted: false,
        };
      },
    });

    const base = {
      probeId: 'probe-side-effect',
      provider: 'deepseek' as const,
      route: 'deepseek-official',
      model: 'deepseek-v4-pro',
    };
    await dispatcher.dispatch({
      ...base,
      purpose: 'accept the tool side effect',
      expectedOutcome: 'structured-tool',
      expectedTools: ['pact_submit_contribution'],
    }, 'compat_side_effect');
    await expect(dispatcher.dispatch({
      ...base,
      purpose: 'consume the accepted tool result',
      expectedOutcome: 'terminal-after-tool-result',
    }, 'compat_side_effect')).rejects.toMatchObject({
      code: 'RETRY_AFTER_SIDE_EFFECT_REFUSED',
    });
    expect(calls).toBe(2);
  });

  it('rejects plain JSON when a structured tool submission is required', async () => {
    const transport = createFakeCompatibilityTransport({
      plainJsonForProbe: 'probe-01',
    });

    await expect(runCompatibilityPlan({
      config: inspectCompatibilityConfig(completeEnv()),
      transport,
      runId: 'compat_plain_json',
      syntheticAttachmentId: SYNTHETIC_ATTACHMENT_ID,
    })).rejects.toMatchObject({
      code: 'STRUCTURED_SUBMISSION_MISSING',
    });
  });
});

describe('synthetic multimodal input', () => {
  it('creates only a 64x64 checkerboard PNG and stores a reference, not bytes or a path', async () => {
    const png = createSyntheticCheckerboardPng();
    expect([...png.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    expect(png.byteLength).toBeLessThan(2 * 1024 * 1024);

    const dshHome = join(tmpdir(), `pact-attachment-${randomUUID()}`);
    mkdirSync(dshHome, { recursive: true });
    const ctx = new Context();
    contexts.push(ctx);
    await ctx.plugin(LocalAttachmentStore, {
      dshHome,
      maxImageBytes: 2 * 1024 * 1024,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 2 * 1024 * 1024,
      maxImagePixels: 64 * 64,
    });

    const input = await saveSyntheticCheckerboard(ctx.attachments);
    const serialized = JSON.stringify(input);
    expect(input.envelope).toMatchObject({
      mediaType: 'image/png',
      encodedByteLength: png.byteLength,
      width: 64,
      height: 64,
      sourceClass: 'synthetic_checkerboard',
    });
    expect(input.envelope.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(input.messageBlock).toMatchObject({
      type: 'image',
      attachment: {
        mediaType: 'image/png',
        width: 64,
        height: 64,
        name: 'synthetic-checkerboard.png',
      },
    });
    expect(serialized).not.toContain(dshHome);
    expect(serialized).not.toContain('base64');
    expect(serialized).not.toContain('data:image');
    const stored = await ctx.attachments.readImage(
      input.messageBlock.attachment,
    );
    expect(Buffer.from(stored.data).equals(Buffer.from(png))).toBe(true);
  });
});

describe('late draft quarantine', () => {
  it('quarantines a late provider result and never promotes it to current draft', async () => {
    const appended: Array<{ type: string; data: unknown }> = [];
    const session = {
      append(type: string, data: unknown) {
        appended.push({ type, data });
      },
    } as unknown as Session;
    const registry = new SubmissionRegistry();
    const turnId = 'turn_provider_late01';
    registry.closeTurn(turnId);

    const receipt = await registry.acceptDraft(session, {
      identity: {
        draftId: 'draft_provider_late01',
        schemaVersion: CP03_FOUNDATION_SCHEMA_VERSION,
        caseSessionId: 'case_provider_late01',
        turnId,
        parentSceneHash: 'sha256:synthetic-parent',
      },
      decision: { status: 'DRAFT', actionSequence: ['REPLACE_OBJECT'] },
      creative: {},
      materials: {},
      execution: { executable: false },
      agency: {},
    });

    expect(receipt.accepted).toBe(false);
    expect(appended.map((event) => event.type)).toEqual(['pact/quarantine']);
    expect(registry.currentDraft(turnId)).toBeUndefined();
  });
});

describe('keyless catalog and cost eligibility', () => {
  it('resolves exact locked-adapter metadata without dispatching a provider request', async () => {
    let resolution: ProviderCatalogResolution | undefined;
    try {
      resolution = await resolveProviderCatalog({
        deepseekModel: 'deepseek-v4-pro',
        geminiRoute: 'google',
        geminiModel: 'gemini-3.5-flash',
      });
    } finally {
      await resolution?.dispose();
    }

    expect(resolution?.deepseek).toMatchObject({
      route: 'deepseek-official',
      model: 'deepseek-v4-pro',
      adapter: '@deepseek-ai/dsh-llm-deepseek',
      adapterVersion: '0.1.0-rc.6',
      endpointBase: 'https://api.deepseek.com',
      inputModalities: ['text'],
      catalogListed: true,
    });
    expect(resolution?.gemini).toMatchObject({
      route: 'google',
      model: 'gemini-3.5-flash',
      adapter: '@deepseek-ai/dsh-llm-pi-ai',
      adapterVersion: '0.1.0-rc.6',
      endpointBase: 'https://generativelanguage.googleapis.com/v1beta',
      inputModalities: ['text', 'image'],
      catalogListed: true,
    });
  });

  it('computes a conservative 6 DeepSeek plus 4 Gemini dispatch cap', () => {
    const estimate = estimateWorstCaseCost({
      deepseek: {
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2,
      },
      gemini: {
        inputUsdPerMillionTokens: 3,
        outputUsdPerMillionTokens: 4,
      },
    }, 2.50);

    expect(estimate.dispatches).toEqual({ deepseek: 6, gemini: 4 });
    expect(estimate.inputTokensPerDispatch).toBe(32_768);
    expect(estimate.maxOutputTokensPerDispatch).toBe(2_048);
    expect(estimate.withinUserCap).toBe(true);
    expect(estimate.worstCaseUsd).toBeCloseTo(0.647168, 6);
  });

  it('binds the exact selected models to the verified official pricing snapshot', () => {
    const pricing = resolveOfficialPricing(
      'deepseek-v4-pro',
      'gemini-3.5-flash',
    );

    expect(pricing).toMatchObject({
      status: 'RESOLVED',
      snapshotDate: '2026-08-22',
      rates: {
        deepseek: {
          inputUsdPerMillionTokens: 0.435,
          outputUsdPerMillionTokens: 0.87,
        },
        gemini: {
          inputUsdPerMillionTokens: 1.5,
          outputUsdPerMillionTokens: 9,
        },
      },
    });
    expect(resolveOfficialPricing(
      'deepseek-v4-pro',
      'gemini-unpriced-preview',
    )).toMatchObject({
      status: 'UNRESOLVED',
      unresolvedModels: ['gemini-unpriced-preview'],
    });
  });

  it('can become locally eligible while still authorizing zero real dispatches', async () => {
    const dshHome = join(tmpdir(), `pact-preflight-${randomUUID()}`);
    mkdirSync(dshHome, { recursive: true });
    const ctx = new Context();
    contexts.push(ctx);
    await ctx.plugin(LocalAttachmentStore, {
      dshHome,
      maxImageBytes: 2 * 1024 * 1024,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 2 * 1024 * 1024,
      maxImagePixels: 64 * 64,
    });

    const report = await buildProviderPreflightReport(
      completeEnv(),
      ctx.attachments,
    );
    expect(report).toMatchObject({
      status: 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL',
      realDispatchAuthorized: false,
      counts: {
        intended: 8,
        eligible: 8,
        excluded: 0,
        completed: 0,
        plannedDispatches: 8,
        sentDispatches: 0,
        maximumDispatches: 10,
      },
      disclosure: {
        providerRequestsMade: 0,
        realRunRequiresFreshExplicitApproval: true,
        catalogEligibilityIsCompatibilityPass: false,
      },
    });
    expect(report.pricing.estimate?.worstCaseUsd).toBeCloseTo(0.36655104, 8);
    expect(JSON.stringify(report)).not.toContain('do-not-retain');
  });
});
