import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertLocalOrSameOrigin,
  createCasePackValidator,
  loadCasePack,
  validateCasePackManifest,
} from "./case-pack-runtime.js";
import { syncCasePack } from "../scripts/sync-pact-cp02-case-pack.mjs";

const temporaryRoots = [];

const glbWithDocument = (document) => {
  const rawJson = Buffer.from(JSON.stringify(document));
  const padding = (4 - (rawJson.length % 4)) % 4;
  const json = Buffer.concat([rawJson, Buffer.alloc(padding, 0x20)]);
  const output = Buffer.alloc(20 + json.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  return output;
};

const testTableBytes = () => glbWithDocument({ asset: { version: "2.0" }, scenes: [{}], scene: 0 });

const approvedManifest = () => ({
  schemaVersion: 1,
  casePackId: "pact-cp02-v1",
  createdAt: "2026-08-21T15:21:33Z",
  decisionRecord: "checkpoints/cp02/sources/candidate-review.md",
  publicReleaseAuthorized: false,
  assets: [{
    assetId: "PH-TABLE-WOODEN-001",
    sourceAssetId: "WoodenTable_01",
    filename: "WoodenTable_01.glb",
    path: "assets/WoodenTable_01.glb",
    bytes: 1_823_744,
    sha256: "cd8807b19ac0db16e2c29564634bfb949b175c51eb7dfda5c0aa4cb94af3fe2b",
    sourceStatus: "SOURCE_CLEARED",
    technicalStatus: "TECHNICALLY_VALIDATED",
    artisticStatus: "ARTISTICALLY_APPROVED",
    artisticDecision: "KEEP",
    publicDisplay: false,
    binding: { scale: 1 },
    placement: {
      mode: "REPLACE_PROXY",
      semanticClass: "table",
      slotId: "memory-table-bedside",
      slotStatus: "EXISTING_AUTHORED_SLOT",
      replacesAssetId: "CP02-TABLE-PROXY-001",
    },
  }],
});

const testManifestAndValidator = () => {
  const bytes = testTableBytes();
  const manifest = approvedManifest();
  manifest.assets[0].bytes = bytes.byteLength;
  manifest.assets[0].sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const asset = manifest.assets[0];
  const validateManifestImpl = createCasePackValidator({
    [asset.assetId]: {
      sourceAssetId: asset.sourceAssetId,
      filename: asset.filename,
      bytes: asset.bytes,
      sha256: asset.sha256,
      placement: { ...asset.placement },
    },
  });
  return { bytes, manifest, validateManifestImpl };
};

const makeSourceDirectory = (manifest, bytes = testTableBytes()) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pact-case-pack-source-"));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "case-pack.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(root, manifest.assets[0].path), bytes);
  return root;
};

const makeTargetDirectory = () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "pact-case-pack-target-"));
  temporaryRoots.push(parent);
  return path.join(parent, "pact-cp02");
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("hash-bound local Case Pack runtime", () => {
  it("accepts an artist-approved local-only record without claiming public release", () => {
    const manifest = validateCasePackManifest(approvedManifest());

    expect(manifest.publicReleaseAuthorized).toBe(false);
    expect(manifest.assets[0]).toMatchObject({
      artisticDecision: "KEEP",
      artisticStatus: "ARTISTICALLY_APPROVED",
      publicDisplay: false,
      placement: { mode: "REPLACE_PROXY", slotId: "memory-table-bedside" },
    });
  });

  it("snapshots a code-authored catalog so later mutations cannot weaken its policy", () => {
    const { manifest } = testManifestAndValidator();
    const asset = manifest.assets[0];
    const catalog = {
      [asset.assetId]: {
        sourceAssetId: asset.sourceAssetId,
        filename: asset.filename,
        bytes: asset.bytes,
        sha256: asset.sha256,
        placement: { ...asset.placement },
      },
    };
    const validateManifest = createCasePackValidator(catalog);
    catalog[asset.assetId].sha256 = "0".repeat(64);
    catalog[asset.assetId].placement.slotId = "unapproved-slot";

    expect(validateManifest(manifest).assets[0]).toMatchObject({
      sha256: asset.sha256,
      placement: { slotId: "memory-table-bedside" },
    });
  });

  it("lets a separately authored policy bind its own stable Case Pack ID", () => {
    const { manifest } = testManifestAndValidator();
    const asset = manifest.assets[0];
    manifest.casePackId = "future-room-v1";
    const validateManifest = createCasePackValidator({
      [asset.assetId]: {
        sourceAssetId: asset.sourceAssetId,
        filename: asset.filename,
        bytes: asset.bytes,
        sha256: asset.sha256,
        placement: { ...asset.placement },
      },
    }, { casePackId: "future-room-v1" });

    expect(validateManifest(manifest).casePackId).toBe("future-room-v1");
    manifest.casePackId = "unapproved-room";
    expect(() => validateManifest(manifest)).toThrow(/ID|catalog|批准/i);
  });

  it("keeps the thermos additive and forbids it from replacing the existing cup", () => {
    const manifest = approvedManifest();
    Object.assign(manifest.assets[0], {
      assetId: "PH-MUG-MATERIAL-001",
      sourceAssetId: "modified_thermos",
      filename: "modified_thermos.glb",
      path: "assets/modified_thermos.glb",
      bytes: 7_159_640,
      sha256: "f92b05260ea0075b8095a36dac23e457bc22489b3c1cb5240178796d3b705562",
      placement: {
        mode: "ADDITIVE_ONLY",
        semanticClass: "thermos",
        slotId: "memory-thermos-on-table",
        slotStatus: "PENDING_AUTHORED_SLOT",
        replacesAssetId: null,
        prohibitedReplacementAssetId: "CP02-CUP-PROXY-001",
      },
    });

    expect(validateCasePackManifest(manifest).assets[0].placement).toMatchObject({
      mode: "ADDITIVE_ONLY",
      replacesAssetId: null,
      prohibitedReplacementAssetId: "CP02-CUP-PROXY-001",
    });

    manifest.assets[0].placement.replacesAssetId = "CP02-CUP-PROXY-001";
    expect(() => validateCasePackManifest(manifest)).toThrow(/additive|replace|新增|替换/i);
  });

  it.each([
    ["bytes", 1_823_745],
    ["sha256", "0".repeat(64)],
  ])("rejects manifest self-report drift in approved GLB %s", (field, value) => {
    const manifest = approvedManifest();
    manifest.assets[0][field] = value;

    expect(() => validateCasePackManifest(manifest)).toThrow(/catalog|allowlist|登记|批准/i);
  });

  it.each([
    "../outside.glb",
    "assets/../../outside.glb",
    "/absolute.glb",
    "https://example.com/model.glb",
    "assets\\model.glb",
    "assets/%2e%2e/outside.glb",
  ])("rejects unsafe manifest path %s", (unsafePath) => {
    const manifest = approvedManifest();
    manifest.assets[0].path = unsafePath;
    expect(() => validateCasePackManifest(manifest)).toThrow(/path|路径/i);
  });

  it("rejects records that are not independently cleared, validated, and kept", () => {
    for (const mutation of [
      { sourceStatus: "DISCOVERED" },
      { technicalStatus: "PENDING" },
      { artisticStatus: "TECHNICALLY_VALIDATED" },
      { artisticDecision: "REFERENCE_ONLY" },
    ]) {
      const manifest = approvedManifest();
      Object.assign(manifest.assets[0], mutation);
      expect(() => validateCasePackManifest(manifest)).toThrow(/approved|批准|status/i);
    }
  });

  it("rejects a self-approved record that is absent from the fixed CP02 catalog", () => {
    const manifest = approvedManifest();
    Object.assign(manifest.assets[0], {
      assetId: "PH-UNREGISTERED-FOURTH-ASSET",
      sourceAssetId: "unregistered_asset",
      filename: "unregistered_asset.glb",
      path: "assets/unregistered_asset.glb",
    });
    expect(() => validateCasePackManifest(manifest)).toThrow(/catalog|allowlist|登记|批准/i);
  });

  it("does not let a local manifest promote itself to public release", () => {
    const releaseClaim = approvedManifest();
    releaseClaim.publicReleaseAuthorized = true;
    expect(() => validateCasePackManifest(releaseClaim)).toThrow(/public|公开发布|批准/i);

    const displayClaim = approvedManifest();
    displayClaim.assets[0].publicDisplay = true;
    expect(() => validateCasePackManifest(displayClaim)).toThrow(/public|公开展示|批准/i);
  });

  it("accepts only relative or exact same-origin roots", () => {
    const page = "http://127.0.0.1:5173/?case=pact-cp02";
    expect(assertLocalOrSameOrigin("/case-packs/pact-cp02/", page).origin).toBe("http://127.0.0.1:5173");
    expect(() => assertLocalOrSameOrigin("https://example.com/pact/", page)).toThrow(/same-origin|同源/i);
    expect(() => assertLocalOrSameOrigin("file:///tmp/pact/", page)).toThrow(/protocol|协议/i);
    expect(() => assertLocalOrSameOrigin("data:text/plain,no", page)).toThrow(/protocol|协议/i);
    expect(() => assertLocalOrSameOrigin("blob:http://127.0.0.1:5173/id", page)).toThrow(/protocol|协议/i);
  });

  it("verifies size and SHA-256 before passing bytes to the GLB loader", async () => {
    const { bytes, manifest, validateManifestImpl } = testManifestAndValidator();
    const calls = [];
    let fetchCalls = 0;
    const pack = await loadCasePack("/case-packs/pact-cp02/", manifest, {
      locationHref: "http://127.0.0.1:5173/?case=pact-cp02",
      validateManifestImpl,
      fetchImpl: async () => {
        fetchCalls += 1;
        return { ok: true, arrayBuffer: async () => bytes };
      },
      loadGlbBytesImpl: async (...args) => {
        calls.push(args);
        return { loaded: true };
      },
    });

    await expect(pack.asset("PH-TABLE-WOODEN-001")).resolves.toEqual({ loaded: true });
    expect(calls).toHaveLength(1);
    expect(Buffer.from(calls[0][0])).toEqual(bytes);
    expect(calls[0][1]).toBe("WoodenTable_01.glb");
    await expect(pack.asset("PH-TABLE-WOODEN-001")).resolves.toEqual({ loaded: true });
    expect(fetchCalls).toBe(1);
    expect(calls).toHaveLength(2);
    await expect(pack.asset("UNKNOWN-ASSET")).rejects.toThrow(/approved|批准|unknown/i);

    const badPack = await loadCasePack("/case-packs/pact-cp02/", manifest, {
      locationHref: "http://127.0.0.1:5173/",
      validateManifestImpl,
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Buffer.from("tampered") }),
      loadGlbBytesImpl: async () => ({ loaded: true }),
    });
    await expect(badPack.asset("PH-TABLE-WOODEN-001")).rejects.toThrow(/size|bytes|大小|SHA-256/i);

    const badHashPack = await loadCasePack("/case-packs/pact-cp02/", manifest, {
      locationHref: "http://127.0.0.1:5173/",
      validateManifestImpl,
      fetchImpl: async () => ({
        ok: true,
        arrayBuffer: async () => Buffer.from(bytes.map((value, index) => index === 24 ? value ^ 0xff : value)),
      }),
      loadGlbBytesImpl: async () => ({ loaded: true }),
    });
    await expect(badHashPack.asset("PH-TABLE-WOODEN-001")).rejects.toThrow(/SHA-256/i);
  });

  it("copies an exact verified pack and rejects extra GLBs, missing files, hash drift, and symlinks", async () => {
    const { bytes, manifest, validateManifestImpl } = testManifestAndValidator();
    const cleanSource = makeSourceDirectory(manifest, bytes);
    const target = makeTargetDirectory();
    const testPolicy = { validateManifestImpl };

    await expect(syncCasePack({ sourceRoot: cleanSource, targetRoot: target }, testPolicy)).resolves.toMatchObject({
      assetCount: 1,
      casePackId: "pact-cp02-v1",
    });
    expect(fs.readFileSync(path.join(target, "assets", "WoodenTable_01.glb"))).toEqual(bytes);

    const extraSource = makeSourceDirectory(manifest, bytes);
    fs.writeFileSync(path.join(extraSource, "assets", "unregistered.glb"), bytes);
    await expect(syncCasePack({ sourceRoot: extraSource, targetRoot: makeTargetDirectory() }, testPolicy))
      .rejects.toThrow(/extra|unexpected|未登记/i);

    const missingSource = makeSourceDirectory(manifest, bytes);
    fs.unlinkSync(path.join(missingSource, manifest.assets[0].path));
    await expect(syncCasePack({ sourceRoot: missingSource, targetRoot: makeTargetDirectory() }, testPolicy))
      .rejects.toThrow(/missing|缺少/i);

    const driftSource = makeSourceDirectory(manifest, Buffer.from("tampered"));
    await expect(syncCasePack({ sourceRoot: driftSource, targetRoot: makeTargetDirectory() }, testPolicy))
      .rejects.toThrow(/size|bytes|大小|SHA-256/i);

    const hashDriftBytes = Buffer.from(bytes);
    hashDriftBytes[24] ^= 0xff;
    const hashDriftSource = makeSourceDirectory(manifest, hashDriftBytes);
    await expect(syncCasePack({ sourceRoot: hashDriftSource, targetRoot: makeTargetDirectory() }, testPolicy))
      .rejects.toThrow(/SHA-256/i);

    const symlinkSource = makeSourceDirectory(manifest, bytes);
    const assetPath = path.join(symlinkSource, manifest.assets[0].path);
    fs.unlinkSync(assetPath);
    if (process.platform === "win32") fs.symlinkSync(cleanSource, assetPath, "junction");
    else fs.symlinkSync(path.join(cleanSource, manifest.assets[0].path), assetPath, "file");
    await expect(syncCasePack({ sourceRoot: symlinkSource, targetRoot: makeTargetDirectory() }))
      .rejects.toThrow(/symlink|symbolic|符号链接/i);
  });
});
