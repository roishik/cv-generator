import { describe, expect, it } from "vitest";
import {
  byteSizeBucket,
  normalizeAnalyticsPath,
  sanitizeAnalyticsMeta,
} from "@/lib/analytics/meta";

describe("analytics metadata privacy helpers", () => {
  it("normalizes dynamic ids and removes query strings from paths", () => {
    expect(
      normalizeAnalyticsPath("/workspace/123e4567-e89b-12d3-a456-426614174000?token=secret"),
    ).toBe("/workspace/:id");
  });

  it("drops sensitive metadata fields", () => {
    const clean = sanitizeAnalyticsMeta({
      provider: "openai",
      filename: "resume.pdf",
      rawText: "private resume text",
      cvData: { header: { name: "Candidate" } },
      nested: { apiKey: "sk-secret", status: "ok" },
    }) as Record<string, unknown>;

    expect(clean["provider"]).toBe("openai");
    expect(clean["filename"]).toBeUndefined();
    expect(clean["rawText"]).toBeUndefined();
    expect(clean["cvData"]).toBeUndefined();
    expect(clean["nested"]).toEqual({ status: "ok" });
  });

  it("redacts emails and long strings", () => {
    const clean = sanitizeAnalyticsMeta({
      message: `contact roishik10@gmail.com ${"x".repeat(260)}`,
    }) as Record<string, unknown>;

    expect(String(clean["message"])).toMatch(/^\[redacted:\d+ chars\]$/);
  });

  it("buckets upload sizes", () => {
    expect(byteSizeBucket(100_000)).toBe("<250KB");
    expect(byteSizeBucket(900_000)).toBe("250KB-1MB");
    expect(byteSizeBucket(2_000_000)).toBe("1MB-3MB");
    expect(byteSizeBucket(5_000_000)).toBe("3MB-8MB");
  });
});
