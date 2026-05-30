/**
 * Pure resolution of the Auth.js session strategy.
 *
 * Extracted from auth/config.ts so it can be unit-tested without booting NextAuth.
 *
 * KEY CONSTRAINT (Auth.js v5): the Credentials provider CANNOT create database
 * session rows — only the OAuth/email flows do. Therefore, whenever the dev-login
 * Credentials shim is enabled, we MUST use JWT sessions, *even when Google OAuth
 * credentials are also present locally*. If we used "database" in that case, the
 * dev-login would authorize successfully but no session cookie would be written,
 * and the user would silently bounce back to /sign-in.
 *
 * Production never enables the dev-login shim, so it always resolves to "database"
 * (server-side revocable sessions), and env validation requires Google creds there.
 */
export interface SessionStrategyInputs {
  /** Google (or any OAuth) credentials are configured. */
  hasOAuth: boolean;
  /** The dev-login Credentials shim is enabled (non-prod + AUTH_DEV_LOGIN=true). */
  devLoginEnabled: boolean;
}

export function resolveSessionStrategy({
  devLoginEnabled,
}: SessionStrategyInputs): "database" | "jwt" {
  // Credentials shim on → JWT is mandatory (see file header).
  if (devLoginEnabled) return "jwt";
  return "database";
}
