import { describe, it, expect } from "vitest";
import { TAILOR_SYSTEM_PROMPT } from "@/lib/ai/prompts/tailor";

// Writing-knowledge ported from research/ai-job-search into Tailor's tailoring
// prompt (FINDINGS.md Tier 1/2). These tests pin the *presence* of the rules so
// a future prompt refactor can't silently drop them — the prompt is the soft
// half of Tailor's "soft prompt + hard code guarantee" pattern.

describe("TAILOR_SYSTEM_PROMPT — writing-style rules (finding 1.1)", () => {
  const p = TAILOR_SYSTEM_PROMPT.toLowerCase();

  it("bans em-dashes", () => {
    expect(p).toContain("em-dash");
  });

  it("bans the cliché / buzzword blocklist from 03-writing-style.md", () => {
    // Source blocklist: passionate about / great fit / leverage / hit the
    // ground running / drive results / synergies / team player.
    expect(p).toContain("passionate about");
    expect(p).toContain("leverage");
    expect(p).toContain("hit the ground running");
    expect(p).toContain("synergies");
  });

  it("requires demonstrate-don't-state phrasing", () => {
    expect(p).toContain("demonstrate");
  });

  it("requires first-person active voice", () => {
    expect(p).toContain("active voice");
  });

  it("requires varied bullet openers", () => {
    expect(p).toMatch(/vary|varied/);
  });

  it("requires forward-looking framing", () => {
    expect(p).toContain("forward-looking");
  });
});

describe("TAILOR_SYSTEM_PROMPT — interview backtrack test (finding 1.2)", () => {
  const p = TAILOR_SYSTEM_PROMPT.toLowerCase();

  it("states the interview backtrack test for the reframe boundary", () => {
    expect(p).toContain("backtrack");
    expect(p).toContain("interview");
  });

  it("gives the OK / flag-it / never taxonomy", () => {
    expect(p).toContain("ok:");
    expect(p).toMatch(/flag/);
    expect(p).toContain("never:");
  });

  it("frames the test as the gray zone the truthfulness code gate cannot catch", () => {
    // It must invite reframing (not forbid it) while drawing the honest line.
    expect(p).toMatch(/reframe|reframing|emphasis/);
  });
});
