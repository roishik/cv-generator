import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (class merging utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges Tailwind conflicting classes (last wins)", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles undefined/null gracefully", () => {
    expect(cn("base", undefined, null, "extra")).toBe("base extra");
  });
});
