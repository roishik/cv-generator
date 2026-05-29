// @vitest-environment node
/**
 * Unit tests for text extraction from PDF, DOCX, and TXT files.
 * PURE: no DB, no auth, no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { extractTextFromBuffer, MIN_TEXT_LENGTH } from "@/lib/parse/extract-text";

const FIXTURES_DIR = path.join(__dirname, "../../fixtures");

describe("extractTextFromBuffer — PDF", () => {
  it("extracts readable text from a sample PDF", async () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "sample-resume.pdf"));
    const text = await extractTextFromBuffer(buffer, "application/pdf");
    expect(text.length).toBeGreaterThan(MIN_TEXT_LENGTH);
    expect(text).toContain("Dana Whitfield");
  });

  it("is deterministic (same input → same output)", async () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "sample-resume.pdf"));
    const a = await extractTextFromBuffer(buffer, "application/pdf");
    const b = await extractTextFromBuffer(buffer, "application/pdf");
    expect(a).toBe(b);
  });
});

describe("extractTextFromBuffer — DOCX", () => {
  it("extracts readable text from a sample DOCX", async () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "sample-resume.docx"));
    const text = await extractTextFromBuffer(
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(text.length).toBeGreaterThan(MIN_TEXT_LENGTH);
    expect(text).toContain("Dana Whitfield");
  });

  it("is deterministic", async () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "sample-resume.docx"));
    const mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const a = await extractTextFromBuffer(buffer, mime);
    const b = await extractTextFromBuffer(buffer, mime);
    expect(a).toBe(b);
  });
});

describe("extractTextFromBuffer — TXT", () => {
  it("returns normalized text from a plain-text buffer", async () => {
    const content = "Dana Whitfield\ndana@example.com\n\nEngineer at Acme\n2020 - 2024\n- Built things";
    const buffer = Buffer.from(content, "utf8");
    const text = await extractTextFromBuffer(buffer, "text/plain");
    expect(text).toContain("Dana Whitfield");
    expect(text).not.toMatch(/\r/); // no carriage returns
  });
});

describe("extractTextFromBuffer — unsupported MIME", () => {
  it("throws for unsupported MIME types", async () => {
    const buffer = Buffer.from("not a real file");
    await expect(extractTextFromBuffer(buffer, "image/png")).rejects.toThrow(
      "unsupported MIME type",
    );
  });
});
