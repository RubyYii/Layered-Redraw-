const DATABASE_NAME = "blockout-studio-v4";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "project-snapshots";
const ASSET_STORE = "portable-assets";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_SNAPSHOT_BYTES = 96_000_000;
const MAX_ASSET_BYTES = 160_000_000;
const QUOTA_HEADROOM = 0.9;

const requestResult = (request) => new Promise((resolve, reject) => {
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
});

const transactionResult = (transaction) => new Promise((resolve, reject) => {
  transaction.addEventListener("complete", () => resolve(), { once: true });
  transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
  transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
});

export const utf8ByteLength = (value) => new TextEncoder().encode(String(value ?? "")).byteLength;

export function assertStorageCapacity(estimate, incomingBytes) {
  const bytes = Math.max(0, Number(incomingBytes) || 0);
  const quota = Number(estimate?.quota);
  const usage = Math.max(0, Number(estimate?.usage) || 0);
  if (Number.isFinite(quota) && quota > 0 && usage + bytes > quota * QUOTA_HEADROOM) {
    throw new Error("浏览器本地存储空间不足；请先导出工程包并清理旧站点数据。");
  }
  return { quota: Number.isFinite(quota) ? quota : null, usage, incomingBytes: bytes };
}

export function validatePortableAssetRecord(record) {
  if (!record || typeof record !== "object") throw new Error("可移植资产记录无效。");
  const sha256 = String(record.sha256 ?? "").toLowerCase();
  const filename = String(record.filename ?? "").replaceAll("\\", "/").split("/").at(-1)?.slice(0, 160) ?? "";
  const mimeType = String(record.mimeType ?? "application/octet-stream").slice(0, 96);
  const bytes = Math.round(Number(record.bytes) || Number(record.blob?.size) || 0);
  if (!SHA256_PATTERN.test(sha256)) throw new Error("可移植资产缺少有效 SHA-256。");
  if (!filename) throw new Error("可移植资产缺少安全文件名。");
  if (bytes < 1 || bytes > MAX_ASSET_BYTES) throw new Error("可移植资产大小超出 160 MB 限制。");
  if (!(record.blob instanceof Blob) || record.blob.size !== bytes) throw new Error("可移植资产二进制大小不一致。");
  return { sha256, filename, mimeType, bytes, blob: record.blob };
}

export class ProjectPersistence {
  constructor({ indexedDB = globalThis.indexedDB, storageManager = globalThis.navigator?.storage } = {}) {
    this.indexedDB = indexedDB;
    this.storageManager = storageManager;
    this.databasePromise = null;
  }

  get available() {
    return Boolean(this.indexedDB?.open);
  }

  async open() {
    if (!this.available) throw new Error("当前浏览器不支持 IndexedDB。");
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(ASSET_STORE)) {
          database.createObjectStore(ASSET_STORE, { keyPath: "sha256" });
        }
      });
      request.addEventListener("success", () => {
        const database = request.result;
        database.addEventListener("versionchange", () => database.close());
        resolve(database);
      }, { once: true });
      request.addEventListener("error", () => {
        this.databasePromise = null;
        reject(request.error ?? new Error("IndexedDB open failed"));
      }, { once: true });
      request.addEventListener("blocked", () => {
        this.databasePromise = null;
        reject(new Error("IndexedDB 升级被另一个页面阻塞，请关闭旧标签页后重试。"));
      }, { once: true });
    });
    return this.databasePromise;
  }

  async estimate() {
    try {
      return await this.storageManager?.estimate?.() ?? null;
    } catch {
      return null;
    }
  }

  async saveSnapshot(id, json) {
    const value = String(json ?? "");
    const bytes = utf8ByteLength(value);
    if (!id || bytes < 2 || bytes > MAX_SNAPSHOT_BYTES) throw new Error("恢复快照大小超出 96 MB 限制。");
    assertStorageCapacity(await this.estimate(), bytes);
    const database = await this.open();
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite", { durability: "strict" });
    transaction.objectStore(SNAPSHOT_STORE).put({
      id: String(id),
      json: value,
      bytes,
      updatedAt: new Date().toISOString(),
    });
    await transactionResult(transaction);
    return { id: String(id), bytes };
  }

  async loadSnapshot(id) {
    if (!this.available || !id) return null;
    const database = await this.open();
    const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
    const result = await requestResult(transaction.objectStore(SNAPSHOT_STORE).get(String(id)));
    await transactionResult(transaction);
    return result ?? null;
  }

  async putAsset(record) {
    const validated = validatePortableAssetRecord(record);
    const existing = await this.getAsset(validated.sha256);
    if (existing) {
      if (existing.bytes !== validated.bytes) throw new Error("同一资产哈希对应了不同大小的二进制。");
      return { ...validated, deduplicated: true };
    }
    assertStorageCapacity(await this.estimate(), validated.bytes);
    const database = await this.open();
    const transaction = database.transaction(ASSET_STORE, "readwrite", { durability: "strict" });
    transaction.objectStore(ASSET_STORE).put({
      ...validated,
      storedAt: new Date().toISOString(),
    });
    await transactionResult(transaction);
    return { ...validated, deduplicated: false };
  }

  async getAsset(sha256) {
    const digest = String(sha256 ?? "").toLowerCase();
    if (!this.available || !SHA256_PATTERN.test(digest)) return null;
    const database = await this.open();
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const result = await requestResult(transaction.objectStore(ASSET_STORE).get(digest));
    await transactionResult(transaction);
    return result ?? null;
  }

  async listAssets() {
    if (!this.available) return [];
    const database = await this.open();
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const result = await requestResult(transaction.objectStore(ASSET_STORE).getAll());
    await transactionResult(transaction);
    return result ?? [];
  }
}

export const PROJECT_PERSISTENCE_LIMITS = Object.freeze({
  maxSnapshotBytes: MAX_SNAPSHOT_BYTES,
  maxAssetBytes: MAX_ASSET_BYTES,
  quotaHeadroom: QUOTA_HEADROOM,
});
