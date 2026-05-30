import { describe, it, expect } from "vitest";
import { resolveSessionStrategy } from "@/lib/auth/session-strategy";

describe("resolveSessionStrategy", () => {
  it("uses JWT when the dev-login shim is enabled, even WITH Google OAuth creds present", () => {
    // Regression: adding Google creds previously flipped this to "database",
    // which silently broke the Credentials dev-login (no session cookie written).
    expect(
      resolveSessionStrategy({ hasOAuth: true, devLoginEnabled: true }),
    ).toBe("jwt");
  });

  it("uses JWT when dev-login is enabled and no OAuth creds exist", () => {
    expect(
      resolveSessionStrategy({ hasOAuth: false, devLoginEnabled: true }),
    ).toBe("jwt");
  });

  it("uses database sessions in production-like config (dev-login OFF, OAuth present)", () => {
    expect(
      resolveSessionStrategy({ hasOAuth: true, devLoginEnabled: false }),
    ).toBe("database");
  });

  it("uses database sessions when dev-login is off (the OAuth-only path)", () => {
    expect(
      resolveSessionStrategy({ hasOAuth: false, devLoginEnabled: false }),
    ).toBe("database");
  });
});
