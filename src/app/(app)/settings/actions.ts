"use server";

/**
 * Settings server actions — BYOK key management.
 *
 *  saveProviderKey(provider, apiKey)  → validate + encrypt + store
 *  deleteProviderKey(provider)        → remove key for provider
 *  listProviderKeys()                 → masked list (never raw key)
 *  setActiveProvider(provider)        → update profiles.defaultProvider
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { withUser } from "@/lib/db/rls";
import { providerKeys, profiles } from "@/lib/db/schema";
import { encryptKey, keyLast4 } from "@/lib/crypto/envelope";
import { validateProviderKey } from "@/lib/ai/factory";
import type { ProviderId } from "@/lib/ai/provider";
import { recordAnalyticsEventSafe } from "@/lib/analytics/events";

const PROVIDER_IDS = ["anthropic", "openai", "google", "deepseek"] as const;
const ProviderIdSchema = z.enum(PROVIDER_IDS);

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderKeyInfo {
  provider: ProviderId;
  last4: string | null;
  validatedAt: string | null;
  isActive: boolean;
}

export interface SaveKeyResult {
  ok: boolean;
  error?: string;
  /** Validation message from the provider (e.g. "Connected · claude-sonnet") */
  validationMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate, encrypt, and store a provider API key for the authenticated user.
 * Never logs the plaintext key; stores only ciphertext + last4.
 */
export async function saveProviderKey(
  rawProvider: string,
  rawApiKey: string,
): Promise<SaveKeyResult> {
  const startedAt = Date.now();
  const providerParsed = ProviderIdSchema.safeParse(rawProvider);
  if (!providerParsed.success) return { ok: false, error: "Invalid provider" };
  const provider = providerParsed.data as ProviderId;

  const apiKey = rawApiKey.trim();
  if (apiKey.length < 8) return { ok: false, error: "API key is too short" };

  const userId = await requireSession();

  // Validate the key against the provider (cheap models-list/ping call).
  const validation = await validateProviderKey(provider, apiKey);
  if (!validation.ok) {
    await recordAnalyticsEventSafe({
      userId,
      kind: "provider_key_saved",
      status: "error",
      durationMs: Date.now() - startedAt,
      meta: { provider, reason: "validation_failed" },
    });
    return { ok: false, error: validation.message ?? `${provider} rejected this key` };
  }

  // Encrypt the key in memory; never persists plaintext.
  const envelope = encryptKey(apiKey);
  const last4 = keyLast4(apiKey);
  const now = new Date();

  await withUser(userId, async (tx) => {
    // Upsert: one row per (user, provider).
    const existing = await tx
      .select({ id: providerKeys.id })
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
      .limit(1);

    if (existing.length > 0) {
      await tx
        .update(providerKeys)
        .set({
          ciphertext: Buffer.from(envelope.ciphertext, "base64"),
          iv: Buffer.from(envelope.iv, "base64"),
          authTag: Buffer.from(envelope.authTag, "base64"),
          keyVersion: envelope.keyVersion,
          last4,
          validatedAt: now,
          updatedAt: now,
        })
        .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)));
    } else {
      await tx.insert(providerKeys).values({
        userId,
        provider,
        ciphertext: Buffer.from(envelope.ciphertext, "base64"),
        iv: Buffer.from(envelope.iv, "base64"),
        authTag: Buffer.from(envelope.authTag, "base64"),
        keyVersion: envelope.keyVersion,
        last4,
        validatedAt: now,
      });
    }
  });

  await recordAnalyticsEventSafe({
    userId,
    kind: "provider_key_saved",
    durationMs: Date.now() - startedAt,
    meta: { provider },
  });

  return { ok: true, validationMessage: validation.message };
}

/**
 * Remove a provider key for the authenticated user.
 */
export async function deleteProviderKey(
  rawProvider: string,
): Promise<{ ok: boolean; error?: string }> {
  const providerParsed = ProviderIdSchema.safeParse(rawProvider);
  if (!providerParsed.success) return { ok: false, error: "Invalid provider" };
  const provider = providerParsed.data as ProviderId;

  const userId = await requireSession();

  await withUser(userId, (tx) =>
    tx
      .delete(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider))),
  );

  await recordAnalyticsEventSafe({
    userId,
    kind: "provider_key_deleted",
    meta: { provider },
  });

  return { ok: true };
}

/**
 * List all configured provider keys for the authenticated user.
 * Never returns the plaintext key — only last4 + status.
 */
export async function listProviderKeys(): Promise<ProviderKeyInfo[]> {
  const userId = await requireSession();

  const [keys, profile] = await Promise.all([
    withUser(userId, (tx) =>
      tx
        .select({
          provider: providerKeys.provider,
          last4: providerKeys.last4,
          validatedAt: providerKeys.validatedAt,
        })
        .from(providerKeys)
        .where(eq(providerKeys.userId, userId)),
    ),
    withUser(userId, (tx) =>
      tx
        .select({ defaultProvider: profiles.defaultProvider })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1),
    ),
  ]);

  const activeProvider = profile[0]?.defaultProvider ?? null;

  return keys.map((k) => ({
    provider: k.provider as ProviderId,
    last4: k.last4,
    validatedAt: k.validatedAt?.toISOString() ?? null,
    isActive: k.provider === activeProvider,
  }));
}

/**
 * Set the active provider for tailoring. Updates profiles.defaultProvider.
 */
export async function setActiveProvider(
  rawProvider: string,
): Promise<{ ok: boolean; error?: string }> {
  const providerParsed = ProviderIdSchema.safeParse(rawProvider);
  if (!providerParsed.success) return { ok: false, error: "Invalid provider" };
  const provider = providerParsed.data as ProviderId;

  const userId = await requireSession();

  // Ensure the key exists before making it active.
  const existing = await withUser(userId, (tx) =>
    tx
      .select({ id: providerKeys.id })
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
      .limit(1),
  );
  if (existing.length === 0) {
    await recordAnalyticsEventSafe({
      userId,
      kind: "provider_selected",
      status: "error",
      meta: { provider, reason: "missing_key" },
    });
    return { ok: false, error: "No key configured for this provider" };
  }

  await withUser(userId, (tx) =>
    tx
      .insert(profiles)
      .values({
        userId,
        defaultProvider: provider,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { defaultProvider: provider, updatedAt: new Date() },
      }),
  );

  await recordAnalyticsEventSafe({
    userId,
    kind: "provider_selected",
    meta: { provider },
  });

  return { ok: true };
}
