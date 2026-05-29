// Provider factory. This is the ONE module in lib/ai allowed (per the
// dependency-direction lint rule) to bridge to outer layers — but to avoid
// coupling to not-yet-built db/auth modules (M5+), the DB-scoped resolver
// (`resolveProvider(userId, provider)` that loads + decrypts a stored key) is
// layered in a server action later. This file stays pure: given a provider id
// and (for real providers) an already-decrypted key, it constructs an adapter.
import type { LLMProvider, ProviderId } from "./provider";
import { MockProvider } from "./mock";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";

export interface CreateProviderInput {
  provider: ProviderId;
  /** Decrypted plaintext key (in-memory only). Not needed for `mock`. */
  apiKey?: string;
  /** Optional model id override (else the per-provider default). */
  model?: string;
}

/**
 * Construct an LLMProvider adapter. The caller is responsible for decrypting
 * the BYOK key (via lib/crypto/envelope) and passing it in; this layer never
 * touches the DB or logs the key.
 */
export function createProvider(input: CreateProviderInput): LLMProvider {
  switch (input.provider) {
    case "mock":
      return new MockProvider();
    case "anthropic":
      return new AnthropicProvider({
        apiKey: requireKey(input),
        ...(input.model ? { model: input.model } : {}),
      });
    case "openai":
      return new OpenAIProvider({
        apiKey: requireKey(input),
        ...(input.model ? { model: input.model } : {}),
      });
    case "google":
      return new GoogleProvider({
        apiKey: requireKey(input),
        ...(input.model ? { model: input.model } : {}),
      });
    default: {
      const _exhaustive: never = input.provider;
      throw new Error(`unknown provider: ${String(_exhaustive)}`);
    }
  }
}

function requireKey(input: CreateProviderInput): string {
  if (!input.apiKey) {
    throw new Error(`provider "${input.provider}" requires an API key`);
  }
  return input.apiKey;
}

/**
 * Cheap key probe used by the settings `testProviderKey` action. For `mock`
 * this is a no-op success. For real providers it constructs the adapter and
 * pings. Never logs the key.
 */
export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string | undefined,
  model?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (provider === "mock") return { ok: true, message: "mock needs no key" };
  const adapter = createProvider({
    provider,
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
  });
  return adapter.validateKey();
}
