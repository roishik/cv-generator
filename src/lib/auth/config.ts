/**
 * Auth.js v5 configuration.
 *
 * Providers:
 *  1. Google OAuth — production path; creds optional locally when AUTH_DEV_LOGIN=true.
 *  2. Credentials dev-login shim — enabled ONLY when AUTH_DEV_LOGIN=true AND
 *     NODE_ENV !== 'production'. Hard-guarded: two independent checks, either
 *     alone would suffice, together they are belt-and-suspenders.
 *
 * Adapter:  @auth/drizzle-adapter → ownerDb (privileged). Adapter writes happen
 *           pre-session (creating users/sessions/accounts) so they must bypass RLS.
 *
 * Strategy: database sessions (not JWT) → instant server-side revocation;
 *           the sessions row is the identity source for RLS.
 *
 * Type note: our schema uses `bigint` for `accounts.expires_at` (spec-correct per
 * OAuth spec) and adds an `id` surrogate PK to sessions. The drizzle-adapter's
 * TypeScript types are stricter than its runtime behaviour, so we cast via
 * `as Parameters<typeof DrizzleAdapter>[1]`. The runtime mapping is 1:1.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { resolveSessionStrategy } from "@/lib/auth/session-strategy";
import { getOwnerDb } from "@/lib/db/client";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/lib/db/schema";

// ─── Demo users (for dev-login shim) ──────────────────────────────────────────
// These IDs match the seed script so they map to real KB rows.
export const DEV_USERS = [
  {
    id: "00000000-0000-4000-8000-00000000a001",
    email: "ada.demo@example.test",
    name: "Ada Sample",
  },
  {
    id: "00000000-0000-4000-8000-00000000b002",
    email: "blake.demo@example.test",
    name: "Blake Fixture",
  },
] as const;

// ─── Hard guard for dev-login shim ────────────────────────────────────────────
// Both conditions must hold — NODE_ENV check is evaluated at module load so a
// production build literally cannot include active dev-login code.
function isDevLoginEnabled(): boolean {
  if (process.env["NODE_ENV"] === "production") return false;
  return process.env["AUTH_DEV_LOGIN"] === "true";
}

function allowedEmails(): Set<string> {
  const raw = process.env["AUTH_ALLOWED_EMAILS"]?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isAllowedByEmailAllowlist(
  email: string | null | undefined,
  provider: string | null | undefined,
): boolean {
  // Local dev shim should remain usable even if a beta allowlist is configured.
  if (provider === "dev-login") return true;
  const allow = allowedEmails();
  if (allow.size === 0) return true;
  if (!email) return false;
  return allow.has(email.trim().toLowerCase());
}

// ─── Providers list ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProviders(): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providers: any[] = [];

  // Google OAuth — always available when creds are present
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (clientId && clientSecret) {
    providers.push(
      Google({
        clientId,
        clientSecret,
      }),
    );
  }

  // Dev-login shim — only in non-production with AUTH_DEV_LOGIN=true
  if (isDevLoginEnabled()) {
    providers.push(
      Credentials({
        id: "dev-login",
        name: "Dev Login (local only)",
        credentials: {
          userId: { label: "Demo User ID", type: "text" },
        },
        async authorize(credentials) {
          // Extra belt: check again inside the authorize callback itself
          if (!isDevLoginEnabled()) return null;

          const userId = credentials?.userId as string | undefined;
          if (!userId) return null;

          const devUser = DEV_USERS.find((u) => u.id === userId);
          if (!devUser) return null;

          // Verify the user actually exists in the DB (seed must have run)
          const db = getOwnerDb();
          const [row] = await db
            .select({ id: users.id, email: users.email, name: users.name })
            .from(users)
            .where(eq(users.id, devUser.id))
            .limit(1);

          if (!row) return null;

          return {
            id: row.id,
            email: row.email,
            name: row.name,
          };
        },
      }),
    );
  }

  return providers;
}

// ─── Drizzle adapter table map ────────────────────────────────────────────────
// Our schema column types differ slightly from the adapter's strict defaults
// (bigint vs integer for expires_at; extra id PK on sessions). The runtime
// mapping is 1:1; the double-cast bypasses the adapter's strict generics while
// keeping the intent explicit. This is the recommended pattern when your schema
// is semantically compatible but type-structurally diverges from the adapter defaults.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapterSchema: any = {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
};

// ─── Session strategy resolution ─────────────────────────────────────────────
// Auth.js v5 constraint: Credentials-only + database sessions is not supported.
// When no OAuth provider is configured (Google creds absent) and the dev-login
// Credentials shim is the only provider, we fall back to JWT sessions.
//
// This only applies in dev/test (Google creds are REQUIRED in production via
// the env validation in lib/env.ts, so production always has an OAuth provider
// and always uses database sessions for server-side revocation).
// Strategy decision lives in a pure, unit-tested helper (see session-strategy.ts).
function resolveSessionStrategyLocal(): "database" | "jwt" {
  const hasOAuth = !!(
    process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
  );
  return resolveSessionStrategy({
    hasOAuth,
    devLoginEnabled: isDevLoginEnabled(),
  });
}

// ─── Auth.js config ───────────────────────────────────────────────────────────

const sessionStrategy = resolveSessionStrategyLocal();

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Adapter is required for database sessions (OAuth path). For JWT sessions
  // (dev-only credentials path) the adapter is still provided so that lookups
  // via requireSession() → auth() → session callback can read the user record.
  adapter: DrizzleAdapter(getOwnerDb(), adapterSchema),
  session: {
    strategy: sessionStrategy,
    // 30-day default; can be shortened for higher security
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: buildProviders(),
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  callbacks: {
    // Optional private-beta gate. When AUTH_ALLOWED_EMAILS is set, only listed
    // emails can sign in via OAuth. Empty list means open sign-in.
    async signIn({ user, account }) {
      return isAllowedByEmailAllowlist(user.email, account?.provider);
    },
    // Expose the DB user id on the session object so server code can call withUser().
    // Works for both database sessions (user param populated by adapter) and JWT
    // sessions (token.sub carries the user id set by the authorize callback).
    async session({ session, user, token }) {
      const id = user?.id ?? (token?.sub as string | undefined);
      if (id) {
        session.user.id = id;
      }
      return session;
    },
    // For JWT sessions (dev credentials path): persist the user id from
    // authorize() return value into the JWT so session() can read it.
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
  },
  // Never log sensitive data
  logger: {
    error(error) {
      // Log the error type/code but never the full request/response bodies
      console.error("[auth] error", (error as { type?: string }).type ?? "unknown");
    },
  },
});
