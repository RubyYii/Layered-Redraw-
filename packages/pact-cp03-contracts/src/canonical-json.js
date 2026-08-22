const plain = (value) => Object.getPrototypeOf(value) === Object.prototype;

function normalise(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON rejects non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === "object" && plain(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalise(value[key])]));
  }
  throw new TypeError("canonical JSON accepts plain JSON values only");
}

export const canonicalJson = (value) => JSON.stringify(normalise(value));

export async function sha256Canonical(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
