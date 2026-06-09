import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "@/lib/admin/admin-emails";
import { parseAdminDays } from "@/lib/admin/analytics";

describe("admin analytics helpers", () => {
  it("defaults admin access to the configured owner email", () => {
    expect(isAdminEmail("roishik10@gmail.com", undefined)).toBe(true);
    expect(isAdminEmail("someone@example.com", undefined)).toBe(false);
  });

  it("parses comma-separated admin emails case-insensitively", () => {
    const admins = parseAdminEmails(" Owner@Example.com, roishik10@gmail.com ");
    expect(admins.has("owner@example.com")).toBe(true);
    expect(isAdminEmail("OWNER@example.com", " Owner@Example.com ")).toBe(true);
  });

  it("accepts only supported admin dashboard ranges", () => {
    expect(parseAdminDays("7")).toBe(7);
    expect(parseAdminDays("30")).toBe(30);
    expect(parseAdminDays("90")).toBe(90);
    expect(parseAdminDays("365")).toBe(30);
  });
});
