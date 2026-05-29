// The provider-agnostic LLM abstraction (BYOK).
// PURE: this module and its adapters must NOT import @/lib/db or @/lib/auth.
// Keys/KB are passed in by the caller (factory.ts is the only boundary that
// may touch DB/auth).
import type {
  ExtractionResult,
  TailorResult,
} from "@/lib/schemas/llm-contracts";
import type {
  KnowledgeBaseForLLM,
} from "@/lib/schemas/knowledge-base";
import type { TemplateId } from "@/lib/schemas/cv-data";

export type ProviderId = "anthropic" | "openai" | "google" | "mock";

export interface ValidateKeyResult {
  ok: boolean;
  message?: string;
}

export interface ExtractProfileInput {
  rawText: string;
}

export interface TailorInput {
  knowledgeBase: KnowledgeBaseForLLM;
  jdText: string;
  templateId: TemplateId;
}

/**
 * Every adapter implements these two structured calls + a cheap key probe.
 * Outputs are already zod-validated by the adapter (one bounded repair retry on
 * schema mismatch, then a hard error).
 */
export interface LLMProvider {
  readonly id: ProviderId;
  /** cheap auth/connectivity probe; no content generation. */
  validateKey(): Promise<ValidateKeyResult>;
  /** LLM call #1 — resume text → structured KB extraction. */
  extractProfile(input: ExtractProfileInput): Promise<ExtractionResult>;
  /** LLM call #2 — (KB + JD + templateId) → tailored CvData + rationale. */
  tailor(input: TailorInput): Promise<TailorResult>;
}

/** Default model ids per provider. Override via constructor options.
 * NOTE: these are best-effort current mid-tier defaults; confirm exact ids
 * against provider docs before production (tracked in openIssues). */
export const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4.1",
  google: "gemini-2.5-pro",
} as const;

export class SchemaValidationError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly call: "extractProfile" | "tailor",
    public readonly zodMessage: string,
  ) {
    // Never include the raw model output / any key material in the message.
    super(
      `[${provider}] ${call} output failed schema validation after repair retry: ${zodMessage}`,
    );
    this.name = "SchemaValidationError";
  }
}
