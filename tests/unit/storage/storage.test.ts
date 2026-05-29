// @vitest-environment node
/**
 * Unit tests for LocalFsStorage and HMAC signed-token utilities.
 * PURE: no DB, no auth. Uses a temp directory per test.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { LocalFsStorage } from "@/lib/storage/local-fs";
import { mintToken, verifyToken } from "@/lib/storage/token";

const TEST_SECRET = "test-signing-secret-at-least-16-chars";

let tmpDir: string;

function makeTmpStorage(): LocalFsStorage {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "cvgen-storage-test-"));
  return new LocalFsStorage(tmpDir, TEST_SECRET, "http://localhost:3000");
}

afterEach(() => {
  if (tmpDir) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

describe("LocalFsStorage — put / get / delete", () => {
  it("round-trips a file: put → get returns same bytes", async () => {
    const storage = makeTmpStorage();
    const data = Buffer.from("hello storage world");
    const key = "uploads/user1/test.txt";

    await storage.put({ key, data, mimeType: "text/plain" });
    const retrieved = await storage.get(key);

    expect(retrieved.equals(data)).toBe(true);
  });

  it("throws when getting a nonexistent key", async () => {
    const storage = makeTmpStorage();
    await expect(storage.get("uploads/user1/nonexistent.pdf")).rejects.toThrow(
      "not found",
    );
  });

  it("delete removes the file (subsequent get throws)", async () => {
    const storage = makeTmpStorage();
    const key = "uploads/user1/todelete.txt";
    await storage.put({ key, data: Buffer.from("bye"), mimeType: "text/plain" });
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow("not found");
  });

  it("delete is a no-op for nonexistent keys", async () => {
    const storage = makeTmpStorage();
    await expect(storage.delete("uploads/user1/doesnotexist.txt")).resolves.not.toThrow();
  });

  it("creates nested directories automatically", async () => {
    const storage = makeTmpStorage();
    const key = "uploads/deep/nested/user/file.pdf";
    const data = Buffer.from("%PDF test content");
    await storage.put({ key, data, mimeType: "application/pdf" });
    const retrieved = await storage.get(key);
    expect(retrieved.equals(data)).toBe(true);
  });
});

describe("LocalFsStorage — getSignedUrl", () => {
  it("returns a URL containing the HMAC token", async () => {
    const storage = makeTmpStorage();
    const key = "uploads/user1/file.pdf";
    await storage.put({ key, data: Buffer.from("pdf data"), mimeType: "application/pdf" });

    const { url, expiresAt } = await storage.getSignedUrl(key, 3600);

    expect(url).toContain("/api/files/");
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("the token in the URL verifies to the correct key", async () => {
    const storage = makeTmpStorage();
    const key = "uploads/user1/resume.pdf";
    const { url } = await storage.getSignedUrl(key, 3600);

    // Extract the token from the URL path /api/files/<token>
    const tokenEncoded = url.split("/api/files/")[1]!;
    const token = decodeURIComponent(tokenEncoded);
    const payload = verifyToken(TEST_SECRET, token);

    expect(payload.key).toBe(key);
  });

  it("expired token is rejected", () => {
    // Mint a token with ttl=-1 (already expired)
    const token = mintToken(TEST_SECRET, "uploads/user/file.pdf", -1);
    expect(() => verifyToken(TEST_SECRET, token)).toThrow("expired");
  });

  it("tampered token is rejected", () => {
    const token = mintToken(TEST_SECRET, "uploads/user/file.pdf", 3600);
    // Flip the last character of the signature
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(() => verifyToken(TEST_SECRET, tampered)).toThrow(/signature|expired|malformed/);
  });

  it("token for wrong secret is rejected", () => {
    const token = mintToken("correct-secret-long-enough", "uploads/user/file.pdf", 3600);
    expect(() => verifyToken("wrong-secret-different-value", token)).toThrow(/signature/);
  });
});

describe("HMAC token utilities", () => {
  it("mintToken + verifyToken round-trips", () => {
    const token = mintToken(TEST_SECRET, "uploads/user1/doc.pdf", 60);
    const payload = verifyToken(TEST_SECRET, token);
    expect(payload.key).toBe("uploads/user1/doc.pdf");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("verifyToken rejects malformed tokens (no dot)", () => {
    expect(() => verifyToken(TEST_SECRET, "nodothere")).toThrow("missing signature");
  });

  it("verifyToken rejects tokens with invalid payload", () => {
    // Valid HMAC over non-JSON payload
    const badPayload = Buffer.from("notjson").toString("base64url");
    const sig = mintToken(TEST_SECRET, "x", 60).split(".")[1];
    expect(() => verifyToken(TEST_SECRET, `${badPayload}.${sig}`)).toThrow();
  });
});

describe("LocalFsStorage — path sanitization", () => {
  it("rejects path traversal in keys", async () => {
    const storage = makeTmpStorage();
    // Put passes for safe keys; traversal attempt should be rejected.
    await expect(
      storage.put({ key: "../etc/passwd", data: Buffer.from("x"), mimeType: "text/plain" }),
    ).rejects.toThrow("invalid key");
  });
});
