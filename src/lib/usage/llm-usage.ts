import type { LLMProvider, TokenUsage } from "@/lib/ai/provider";
import { withUser } from "@/lib/db/rls";
import { usageEvents } from "@/lib/db/schema";

export function providerUsage(provider: LLMProvider): TokenUsage | null {
  return provider.getLastUsage?.() ?? null;
}

export function providerModel(provider: LLMProvider): string | null {
  return provider.getModelId?.() ?? null;
}

export async function recordLlmUsageEvent(input: {
  userId: string;
  kind: "extract" | "tailor" | "edit_profile";
  provider: string;
  model: string | null;
  status: "ok" | "error";
  latencyMs: number;
  usage: TokenUsage | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await withUser(input.userId, (tx) =>
    tx.insert(usageEvents).values({
      userId: input.userId,
      kind: input.kind,
      provider: input.provider,
      model: input.model,
      promptTokens: input.usage?.promptTokens ?? null,
      completionTokens: input.usage?.completionTokens ?? null,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      status: input.status,
      meta: (input.meta ?? {}) as Record<string, unknown>,
    }),
  );
}
