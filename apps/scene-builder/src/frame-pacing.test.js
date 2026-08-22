import { describe, expect, it } from "vitest";
import { FramePacingMonitor } from "./frame-pacing.js";

const feed = (monitor, frameMs, count) => {
  let timestamp = 0;
  monitor.sample(timestamp);
  let result = null;
  for (let index = 0; index < count; index += 1) {
    timestamp += frameMs;
    result = monitor.sample(timestamp) ?? result;
  }
  return result;
};

describe("adaptive frame pacing", () => {
  it("reduces render quality after sustained slow frames", () => {
    const monitor = new FramePacingMonitor({ sampleSize: 12 });
    const result = feed(monitor, 30, 12);

    expect(result.fps).toBeCloseTo(33.333, 2);
    expect(result.qualityChanged).toBe(true);
    expect(result.qualityScale).toBe(0.85);
  });

  it("keeps full quality for stable 60fps pacing", () => {
    const monitor = new FramePacingMonitor({ sampleSize: 12 });
    const result = feed(monitor, 16.67, 12);

    expect(result.qualityScale).toBe(1);
    expect(result.qualityChanged).toBe(false);
    expect(result.p95Ms).toBeLessThan(17);
  });

  it("drops quality faster for severe software-renderer stalls", () => {
    const monitor = new FramePacingMonitor({ sampleSize: 12 });
    const result = feed(monitor, 90, 12);

    expect(result.qualityChanged).toBe(true);
    expect(result.qualityScale).toBe(0.75);
    expect(result.fps).toBeLessThan(12);
  });
});
