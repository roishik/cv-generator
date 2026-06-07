import { describe, it, expect } from "vitest";
import { keywordSet, tokenize, overlapCount } from "@/lib/tailor/keywords";

describe("keywords (shared JD↔CV tokenizer)", () => {
  it("lower-cases and drops stopwords + 1-char noise", () => {
    const set = keywordSet("We are looking for a Senior Platform Engineer.");
    expect(set.has("platform")).toBe(true);
    expect(set.has("engineer")).toBe(true);
    // boilerplate / stopwords removed
    expect(set.has("we")).toBe(false);
    expect(set.has("are")).toBe(false);
    expect(set.has("for")).toBe(false);
    expect(set.has("a")).toBe(false);
  });

  it("keeps short tech tokens like ai / ml / go", () => {
    const set = keywordSet("Experience with ML, AI and Go required.");
    expect(set.has("ml")).toBe(true);
    expect(set.has("ai")).toBe(true);
    expect(set.has("go")).toBe(true);
  });

  it("preserves c++ / c# style tokens", () => {
    const set = keywordSet("Strong C++ and C# skills.");
    expect(set.has("c++")).toBe(true);
    expect(set.has("c#")).toBe(true);
  });

  it("tokenize keeps duplicates (for frequency), keywordSet dedupes", () => {
    const toks = tokenize("kubernetes kubernetes platform");
    expect(toks.filter((t) => t === "kubernetes")).toHaveLength(2);
    expect(keywordSet("kubernetes kubernetes platform").size).toBe(2);
  });

  it("overlapCount counts shared distinct tokens", () => {
    const a = keywordSet("kubernetes platform pipeline");
    const b = keywordSet("kubernetes data pipeline");
    expect(overlapCount(a, b)).toBe(2); // kubernetes + pipeline
  });
});
