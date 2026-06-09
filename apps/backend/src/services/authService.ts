import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "sb_";
const SECRET_BYTES = 24;
const VISIBLE_PREFIX_CHARS = 11;

export interface GeneratedKey {
  readonly plaintext: string;
  readonly hash: string;
  readonly prefix: string;
}

export function generateApiKey(): GeneratedKey {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, VISIBLE_PREFIX_CHARS)
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function verifyApiKey(plaintext: string, expectedHash: string): boolean {
  if (!plaintext || !expectedHash) return false;
  const candidate = Buffer.from(hashApiKey(plaintext), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/**
 * Constant-time equality for two secrets of arbitrary length. Hashing both
 * sides to a fixed width first keeps the comparison free of length-based timing
 * leaks (timingSafeEqual itself requires equal-length buffers).
 */
export function secretsEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function parseBearerToken(header: string | string[] | undefined): string | undefined {
  if (!header) return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== "string") return undefined;
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match) return undefined;
  const token = match[1];
  return token ? token.trim() : undefined;
}
