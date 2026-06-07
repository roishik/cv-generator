import "server-only";

/**
 * BYOK provider resolution — the single source of truth for "which provider +
 * which decrypted key does this user's LLM call use?".
 *
 * Used by BOTH hot paths:
 *   - onboarding extraction (extractProfileFromUpload / extractProfileFromText)
 *   - tailoring (runTailoring)
 *
 * Behaviour:
 *   - AI_PROVIDER=mock  → { provider: "mock" } (no key; deterministic local dev)
 *   - AI_PROVIDER=<real> → load + decrypt the user's stored BYOK key for that
 *     provider. Throws a clear, user-facing error if no key is on file.
 *
 * Never logs the plaintext key. Lives outside lib/ai/** so it is allowed (per the
 * dep-direction lint rule) to import db + crypto; lib/ai stays pure.
 */

import { and, eq } from "drizzle-orm";
import { withUser } from "@/lib/db/rls";
import { providerKeys, usageEvents } from "@/lib/db/schema";
import { decryptKey } from "@/lib/crypto/envelope";
import type { ProviderId } from "@/lib/ai/provider";
import { getEnv } from "@/env";

export type ProviderAuthMode = "mock" | "byok" | "managed-free";

export interface ResolvedProvider {
  provider: ProviderId;
  /** Decrypted plaintext key (in-memory only). Absent for the mock provider. */
  apiKey?: string;
  /** How this request is authorized. */
  authMode: ProviderAuthMode;
  /**
   * Managed-free per-request total-token cap. Computed as max(default, 2x rolling
   * average) for the same user+operation from historical usage_events.
   */
  freeTokenCap?: number;
}

export async function resolveProvider(
  userId: string,
  opts: {
    purpose?: "extract" | "tailor" | "edit-profile";
    allowManaged?: boolean;
  } = {},
): Promise<ResolvedProvider> {
  const env = getEnv();
  const envProvider = env.AI_PROVIDER as ProviderId;
  if (envProvider === "mock") return { provider: "mock", authMode: "mock" };

  const key = await withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, envProvider)))
      .limit(1);
    return row;
  });

  if (!key) {
    const managedEnabled =
      !!opts.allowManaged &&
      (opts.purpose === "extract" || opts.purpose === "tailor");
    const managedKey = managedKeyFor(envProvider, env);
    if (managedEnabled && managedKey) {
      const kind = opts.purpose === "extract" ? "extract" : "tailor";
      const freeUsed = await managedFreeUsed(userId, kind);
      if (!freeUsed) {
        const freeTokenCap = await computeManagedFreeTokenCap(userId, kind);
        return {
          provider: envProvider,
          apiKey: managedKey,
          authMode: "managed-free",
          freeTokenCap,
        };
      }
    }
    throw new Error(
      `No ${envProvider} API key on file. Add one in Settings before continuing.`,
    );
  }

  const apiKey = decryptKey({
    ciphertext: Buffer.from(key.ciphertext).toString("base64"),
    iv: Buffer.from(key.iv).toString("base64"),
    authTag: Buffer.from(key.authTag).toString("base64"),
    keyVersion: key.keyVersion,
  });

  return { provider: envProvider, apiKey, authMode: "byok" };
}

function managedKeyFor(provider: ProviderId, env: ReturnType<typeof getEnv>): string | undefined {
  switch (provider) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "google":
      return env.GOOGLE_API_KEY;
    case "deepseek":
      return env.DEEPSEEK_API_KEY;
    case "mock":
      return undefined;
  }
}

async function managedFreeUsed(
  userId: string,
  kind: "extract" | "tailor",
): Promise<boolean> {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ meta: usageEvents.meta })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.kind, kind),
          eq(usageEvents.status, "ok"),
        ),
      ),
  );
  return rows.some((r) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    return meta["billing"] === "managed-free";
  });
}

async function computeManagedFreeTokenCap(
  userId: string,
  kind: "extract" | "tailor",
): Promise<number> {
  const env = getEnv();
  const fallback =
    kind === "extract"
      ? env.TOKEN_CAP_FREE_EXTRACT_DEFAULT
      : env.TOKEN_CAP_FREE_TAILOR_DEFAULT;
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ promptTokens: usageEvents.promptTokens, completionTokens: usageEvents.completionTokens })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.kind, kind),
          eq(usageEvents.status, "ok"),
        ),
      ),
  );
  const totals = rows
    .map((r) => (r.promptTokens ?? 0) + (r.completionTokens ?? 0))
    .filter((n) => n > 0);
  if (totals.length === 0) return fallback;
  const avg = Math.ceil(totals.reduce((a, b) => a + b, 0) / totals.length);
  return Math.max(fallback, avg * 2);
}
