import { describe, expect, it } from "vitest";

import {
  evaluateRuntimeGate,
  isLocalRequest,
  longestLowQualityInterval,
  summarizeSeries,
} from "./smoke-test-cp02.mjs";

describe("CP02 browser evidence statistics", () => {
  it("summarizes raw timing series without clamping samples", () => {
    expect(summarizeSeries([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      median: 30,
      p95: 48,
      min: 10,
      max: 50,
    });
  });

  it("measures the full continuous interval below adaptive quality 75%", () => {
    const samples = [
      { elapsedMs: 0, performance: { qualityScale: 1 } },
      { elapsedMs: 1000, performance: { qualityScale: 0.7 } },
      { elapsedMs: 2000, performance: { qualityScale: 0.65 } },
      { elapsedMs: 3500, performance: { qualityScale: 0.7 } },
      { elapsedMs: 4500, performance: { qualityScale: 0.8 } },
      { elapsedMs: 5500, performance: { qualityScale: 0.6 } },
      { elapsedMs: 6200, performance: { qualityScale: 0.9 } },
    ];
    expect(longestLowQualityInterval(samples, 0.75)).toBe(3500);
  });

  it("fails closed on an invalid environment before applying performance thresholds", () => {
    const verdict = evaluateRuntimeGate({
      environment: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        webgl: { renderer: "ANGLE SwiftShader" },
        targetMachine: { matches: false },
      },
      adaptive: { frameDeltasMs: [16, 16, 16], longestBelow75QualityMs: 0 },
      operations: { applyMs: [20], undoMs: [20] },
    });
    expect(verdict.status).toBe("ENVIRONMENT_INVALID");
    expect(verdict.environmentReasons).toEqual(expect.arrayContaining([
      "headless_browser",
      "software_renderer",
      "wrong_target_machine",
    ]));
  });

  it("uses the approved provisional runtime thresholds exactly", () => {
    const environment = {
      headless: false,
      viewport: { width: 1280, height: 720 },
      webgl: { renderer: "ANGLE Metal Renderer: Apple M5" },
      targetMachine: { matches: true },
    };
    const pass = evaluateRuntimeGate({
      environment,
      adaptive: { frameDeltasMs: Array(120).fill(25), longestBelow75QualityMs: 4999 },
      operations: { applyMs: Array(20).fill(100), undoMs: Array(20).fill(80) },
    });
    expect(pass.status).toBe("PASS");
    expect(pass.metrics.medianFps).toBe(40);

    const fail = evaluateRuntimeGate({
      environment,
      adaptive: { frameDeltasMs: Array(120).fill(40), longestBelow75QualityMs: 5000 },
      operations: { applyMs: Array(20).fill(260), undoMs: Array(20).fill(80) },
    });
    expect(fail.status).toBe("FAIL");
    expect(fail.failedThresholds).toEqual(expect.arrayContaining([
      "median_fps_below_30",
      "apply_p95_above_250ms",
      "quality_below_75_for_5s",
    ]));
  });

  it("accepts only loopback browser requests", () => {
    expect(isLocalRequest("http://127.0.0.1:5173/src/main.js")).toBe(true);
    expect(isLocalRequest("http://localhost:5173/favicon.svg")).toBe(true);
    expect(isLocalRequest("blob:http://127.0.0.1:5173/embedded-texture-id")).toBe(true);
    expect(isLocalRequest("blob:http://localhost:5173/embedded-texture-id")).toBe(true);
    expect(isLocalRequest("blob:https://example.com/remote-id")).toBe(false);
    expect(isLocalRequest("data:image/png;base64,AAAA")).toBe(false);
    expect(isLocalRequest("https://example.com/model.glb")).toBe(false);
  });
});
