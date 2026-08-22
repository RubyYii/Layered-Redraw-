const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export class FramePacingMonitor {
  constructor({ sampleSize = 30, slowFrameMs = 22, fastFrameMs = 16.8 } = {}) {
    this.sampleSize = Math.max(12, Math.round(sampleSize));
    this.slowFrameMs = slowFrameMs;
    this.fastFrameMs = fastFrameMs;
    this.samples = [];
    this.lastTimestamp = null;
    this.qualityScale = 1;
    this.cooldownUntil = 0;
  }

  reset(timestamp = null) {
    this.samples.length = 0;
    this.lastTimestamp = Number.isFinite(timestamp) ? timestamp : null;
    this.cooldownUntil = 0;
  }

  sample(timestamp) {
    if (!Number.isFinite(timestamp)) return null;
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
      return null;
    }

    const frameMs = clamp(timestamp - this.lastTimestamp, 1, 250);
    this.lastTimestamp = timestamp;
    this.samples.push(frameMs);
    if (this.samples.length > this.sampleSize) this.samples.shift();
    if (this.samples.length < this.sampleSize) return null;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const averageMs = this.samples.reduce((total, value) => total + value, 0) / this.samples.length;
    let qualityChanged = false;

    if (timestamp >= this.cooldownUntil && (averageMs > this.slowFrameMs || p95Ms > 34)) {
      const reduction = averageMs > 40 || p95Ms > 60 ? 0.25 : 0.15;
      const next = clamp(Number((this.qualityScale - reduction).toFixed(2)), 0.55, 1);
      qualityChanged = next !== this.qualityScale;
      this.qualityScale = next;
      this.cooldownUntil = timestamp + 1000;
    } else if (timestamp >= this.cooldownUntil && averageMs < this.fastFrameMs && p95Ms < 21) {
      const next = clamp(Number((this.qualityScale + 0.1).toFixed(2)), 0.55, 1);
      qualityChanged = next !== this.qualityScale;
      this.qualityScale = next;
      this.cooldownUntil = timestamp + 2500;
    }

    return {
      averageMs,
      medianMs,
      p95Ms,
      fps: 1000 / averageMs,
      qualityScale: this.qualityScale,
      qualityChanged,
    };
  }
}
