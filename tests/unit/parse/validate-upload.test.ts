// @vitest-environment node
/**
 * Unit tests for upload validation (MIME sniff + size limits + extension allowlist).
 * PURE: no DB, no auth, no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  validateUpload,
  sniffMime,
  MAX_BYTE_SIZE,
} from "@/lib/parse/validate-upload";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures");

describe("sniffMime", () => {
  it("sniffs PDF magic bytes (%PDF)", () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    expect(sniffMime(buf)).toBe("application/pdf");
  });

  it("sniffs DOCX magic bytes (PK zip)", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(sniffMime(buf)).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("returns undefined for plain text", () => {
    const buf = Buffer.from("Hello, world");
    expect(sniffMime(buf)).toBeUndefined();
  });
});

describe("validateUpload", () => {
  it("accepts a valid PDF fixture", () => {
    const buf = readFileSync(path.join(FIXTURES_DIR, "sample-resume.pdf"));
    const result = validateUpload(buf, "sample-resume.pdf");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe("application/pdf");
    }
  });

  it("accepts a valid DOCX fixture", () => {
    const buf = readFileSync(path.join(FIXTURES_DIR, "sample-resume.docx"));
    const result = validateUpload(buf, "sample-resume.docx");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    }
  });

  it("accepts a TXT file (fallback via extension)", () => {
    const buf = Buffer.from("Some plain text content here for testing");
    const result = validateUpload(buf, "resume.txt");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe("text/plain");
  });

  it("rejects when file is too large", () => {
    // Create a buffer larger than MAX_BYTE_SIZE (8 MB)
    const buf = Buffer.alloc(MAX_BYTE_SIZE + 1);
    // Stamp PDF magic bytes so the type check passes
    buf[0] = 0x25; buf[1] = 0x50; buf[2] = 0x44; buf[3] = 0x46;
    const result = validateUpload(buf, "big.pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too large");
  });

  it("rejects an empty buffer", () => {
    const result = validateUpload(Buffer.alloc(0), "empty.pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("empty");
  });

  it("rejects an unsupported file extension with no magic bytes", () => {
    const buf = Buffer.from("this is not a known file type");
    const result = validateUpload(buf, "resume.xyz");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unsupported");
  });
});
