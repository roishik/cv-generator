// AES-256-GCM envelope encryption for BYOK provider keys.
//
// Design (planning/03-architecture.md §5.2):
//   - Envelope structure so a real KMS (AWS/GCP) is a drop-in later: a master
//     key (KEK) derived from MASTER_KEY_SECRET wraps each record.
//   - AES-256-GCM is authenticated → tamper-evident (auth tag verified on
//     decrypt; a flipped ciphertext byte throws).
//   - `keyVersion` column supports KEK rotation.
//   - The decrypted plaintext lives in process memory for the request only and
//     is NEVER logged or persisted.
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import { getEnv } from "@/env";

const KEY_VERSION = 1;
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEK_BYTES = 32; // 256-bit
// scrypt salt is bound to the key version so rotating the KEK changes derivation.
const KEK_SALT = `cvgen-kek-v${KEY_VERSION}`;

/** Serializable envelope persisted alongside a provider key. */
export interface KeyEnvelope {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: number;
}

/** Derive the KEK from the master secret. Cheap-ish; cache per secret. */
const kekCache = new Map<string, Buffer>();
function deriveKek(masterSecret: string): Buffer {
  const cached = kekCache.get(masterSecret);
  if (cached) return cached;
  const kek = scryptSync(masterSecret, KEK_SALT, KEK_BYTES);
  kekCache.set(masterSecret, kek);
  return kek;
}

function resolveSecret(masterSecret?: string): string {
  const secret = masterSecret ?? getEnv().MASTER_KEY_SECRET;
  if (!secret) throw new Error("MASTER_KEY_SECRET is not configured");
  return secret;
}

/**
 * Encrypt a plaintext provider key into a serializable envelope.
 * @param plaintext the raw provider API key (never logged).
 * @param masterSecret override the master secret (tests); defaults to env.
 */
export function encryptKey(
  plaintext: string,
  masterSecret?: string,
): KeyEnvelope {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptKey: plaintext must be a non-empty string");
  }
  const kek = deriveKek(resolveSecret(masterSecret));
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

/**
 * Decrypt an envelope back to the plaintext provider key.
 * Throws if the auth tag fails (tampering / wrong key / corruption).
 * The returned string must stay in memory only.
 */
export function decryptKey(
  envelope: KeyEnvelope,
  masterSecret?: string,
): string {
  if (envelope.keyVersion !== KEY_VERSION) {
    throw new Error(
      `decryptKey: unsupported keyVersion ${envelope.keyVersion}`,
    );
  }
  const kek = deriveKek(resolveSecret(masterSecret));
  const iv = Buffer.from(envelope.iv, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(authTag);
  // .final() throws "Unsupported state or unable to authenticate data" on a
  // tampered ciphertext or wrong key — propagate it (never leak plaintext).
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Last 4 chars of a key for safe display in the UI (never the full key). */
export function keyLast4(plaintext: string): string {
  return plaintext.slice(-4);
}
