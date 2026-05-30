/**
 * Pure, presentation-only description of the active AI provider.
 *
 * The UI used to hardcode "Mock provider active" everywhere; this lets server
 * components surface the *real* provider (and its default model) so the badge,
 * onboarding notice, and tailoring progress line tell the truth.
 *
 * PURE — takes the resolved provider id; the caller reads env.AI_PROVIDER.
 */
import { DEFAULT_MODELS, type ProviderId } from "./provider";

export interface ProviderDescription {
  provider: ProviderId;
  isMock: boolean;
  /** Human label, e.g. "OpenAI" or "Mock". */
  name: string;
  /** Default model id for real providers (undefined for mock). */
  model?: string;
  /** Compact line for the progress footer, e.g. "OpenAI · gpt-5.4" or "Mock · deterministic". */
  label: string;
}

const NAMES: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  mock: "Mock",
};

export function describeProvider(provider: ProviderId): ProviderDescription {
  if (provider === "mock") {
    return { provider, isMock: true, name: "Mock", label: "Mock · deterministic" };
  }
  const model = DEFAULT_MODELS[provider];
  return {
    provider,
    isMock: false,
    name: NAMES[provider],
    model,
    label: `${NAMES[provider]} · ${model}`,
  };
}
