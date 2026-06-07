import { getEnv } from "@/env";
import type { TokenUsage } from "./provider";

export type AiCallKind = "extract" | "tailor" | "edit-profile";

export function configuredTokenCap(kind: AiCallKind): number {
  const env = getEnv();
  switch (kind) {
    case "extract":
      return env.TOKEN_CAP_EXTRACT_TOTAL;
    case "tailor":
      return env.TOKEN_CAP_TAILOR_TOTAL;
    case "edit-profile":
      return env.TOKEN_CAP_EDIT_PROFILE_TOTAL;
  }
}

export function estimateTokens(text: string): number {
  // Coarse, provider-agnostic estimate (roughly 4 chars/token for Latin scripts).
  return Math.ceil((text ?? "").length / 4);
}

export function assertEstimatedPromptWithinCap(
  kind: AiCallKind,
  promptText: string,
  capOverride?: number,
): void {
  const cap = capOverride ?? configuredTokenCap(kind);
  const estimatedPrompt = estimateTokens(promptText);
  if (estimatedPrompt > cap) {
    throw new Error(
      `Request is too large for ${kind}: estimated ${estimatedPrompt} tokens exceeds cap ${cap}. Reduce CV/JD/instruction size.`,
    );
  }
}

export function assertUsageWithinCap(
  kind: AiCallKind,
  usage: TokenUsage | null,
  capOverride?: number,
): void {
  if (!usage) return;
  const cap = capOverride ?? configuredTokenCap(kind);
  if (usage.totalTokens > cap) {
    throw new Error(
      `Token budget exceeded for ${kind}: used ${usage.totalTokens} tokens (cap ${cap}).`,
    );
  }
}
