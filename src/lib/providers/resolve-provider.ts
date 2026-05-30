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
import { providerKeys } from "@/lib/db/schema";
import { decryptKey } from "@/lib/crypto/envelope";
import type { ProviderId } from "@/lib/ai/provider";
import { getEnv } from "@/env";

export interface ResolvedProvider {
  provider: ProviderId;
  /** Decrypted plaintext key (in-memory only). Absent for the mock provider. */
  apiKey?: string;
}

export async function resolveProvider(userId: string): Promise<ResolvedProvider> {
  const envProvider = getEnv().AI_PROVIDER as ProviderId;
  if (envProvider === "mock") return { provider: "mock" };

  const key = await withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, envProvider)))
      .limit(1);
    return row;
  });

  if (!key) {
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

  return { provider: envProvider, apiKey };
}
