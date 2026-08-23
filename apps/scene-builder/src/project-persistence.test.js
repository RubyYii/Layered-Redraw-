import { describe, expect, it } from "vitest";
import {
  PROJECT_PERSISTENCE_LIMITS,
  assertStorageCapacity,
  utf8ByteLength,
  validatePortableAssetRecord,
} from "./project-persistence.js";

describe("project persistence guards", () => {
  it("measures UTF-8 bytes instead of JavaScript code units", () => {
    expect(utf8ByteLength("场景")).toBe(6);
    expect(utf8ByteLength("scene")).toBe(5);
  });

  it("reserves ten percent of the browser quota", () => {
    expect(() => assertStorageCapacity({ usage: 80, quota: 100 }, 9)).not.toThrow();
    expect(() => assertStorageCapacity({ usage: 80, quota: 100 }, 11)).toThrow(/存储空间不足/);
    expect(PROJECT_PERSISTENCE_LIMITS.quotaHeadroom).toBe(0.9);
  });

  it("rejects a binary whose declared size does not match its blob", () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    expect(() => validatePortableAssetRecord({
      sha256: "a".repeat(64),
      filename: "model.glb",
      bytes: 2,
      blob,
    })).toThrow(/大小不一致/);
  });
});
