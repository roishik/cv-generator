import { describe, it, expect } from "vitest";
import {
  encryptKey,
  decryptKey,
  keyLast4,
  type KeyEnvelope,
} from "@/lib/crypto/envelope";

const MASTER = "test-master-secret-at-least-32-bytes-long!!";

describe("crypto/envelope (AES-256-GCM)", () => {
  it("round-trips a key", () => {
    const plaintext = "sk-ant-api03-abcdef1234567890";
    const env = encryptKey(plaintext, MASTER);
    expect(env.keyVersion).toBe(1);
    expect(env.ciphertext).not.toContain(plaintext);
    expect(decryptKey(env, MASTER)).toBe(plaintext);
  });

  it("produces a fresh IV each call (non-deterministic ciphertext)", () => {
    const a = encryptKey("same-key", MASTER);
    const b = encryptKey("same-key", MASTER);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptKey(a, MASTER)).toBe("same-key");
    expect(decryptKey(b, MASTER)).toBe("same-key");
  });

  it("fails authentication when the ciphertext is tampered", () => {
    const env = encryptKey("secret-value", MASTER);
    const buf = Buffer.from(env.ciphertext, "base64");
    buf[0] = buf[0]! ^ 0xff; // flip a byte
    const tampered: KeyEnvelope = {
      ...env,
      ciphertext: buf.toString("base64"),
    };
    expect(() => decryptKey(tampered, MASTER)).toThrow();
  });

  it("fails authentication when the auth tag is tampered", () => {
    const env = encryptKey("secret-value", MASTER);
    const tag = Buffer.from(env.authTag, "base64");
    tag[0] = tag[0]! ^ 0xff;
    expect(() =>
      decryptKey({ ...env, authTag: tag.toString("base64") }, MASTER),
    ).toThrow();
  });

  it("fails to decrypt with the wrong master secret", () => {
    const env = encryptKey("secret-value", MASTER);
    expect(() => decryptKey(env, "a-different-master-secret-32bytes-long!!")).toThrow();
  });

  it("rejects an unsupported key version", () => {
    const env = encryptKey("x", MASTER);
    expect(() => decryptKey({ ...env, keyVersion: 99 }, MASTER)).toThrow(
      /unsupported keyVersion/,
    );
  });

  it("keyLast4 returns only the last 4 chars", () => {
    expect(keyLast4("sk-test-ABCD")).toBe("ABCD");
  });
});
