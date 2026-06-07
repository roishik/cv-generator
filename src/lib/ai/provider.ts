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
import type { CvData, TemplateId } from "@/lib/schemas/cv-data";

export type ProviderId = "anthropic" | "openai" | "google" | "deepseek" | "mock";

export interface ValidateKeyResult {
  ok: boolean;
  message?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ExtractProfileInput {
  rawText: string;
}

export interface EditProfileInput {
  /** The candidate's current knowledge base (the full, structured profile). */
  currentKb: KnowledgeBaseForLLM;
  /** Natural-language edit instruction (e.g. "add an MSc in CS from MIT, 2021"). */
  instruction: string;
}

export interface TailorInput {
  knowledgeBase: KnowledgeBaseForLLM;
  jdText: string;
  templateId: TemplateId;
  /** Optional free-text user instructions (e.g. "drop bullet 3, emphasize leadership"). */
  instructions?: string;
  /**
   * The candidate's CURRENT CV. When instructions are given WITHOUT a real JD,
   * the prompt switches to minimal-edit mode: apply the instruction to this CV
   * and preserve everything else verbatim (instead of re-tailoring from scratch).
   */
  baselineCvData?: CvData;
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
  /** LLM call #3 — (KB + instruction) → the full updated KB (same shape as extraction). */
  editProfile(input: EditProfileInput): Promise<ExtractionResult>;
  /**
   * Optional per-call token usage. Adapters that expose provider usage metadata
   * populate this after each call; pure/mock adapters may return null.
   */
  getLastUsage?(): TokenUsage | null;
  /** Optional model id for usage/audit logging. */
  getModelId?(): string | null;
}

/** Default model ids per provider. Override via constructor options or env.
 * NOTE: model id strings are best-effort; confirm exact ids against each
 * provider's API docs. All are overridable via env vars or constructor args. */
export const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.4",
  google: "gemini-3.5-flash",
  deepseek: "deepseek-v4-pro",
} as const;

export class SchemaValidationError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly call: "extractProfile" | "tailor" | "editProfile",
    public readonly zodMessage: string,
  ) {
    // Never include the raw model output / any key material in the message.
    super(
      `[${provider}] ${call} output failed schema validation after repair retry: ${zodMessage}`,
    );
    this.name = "SchemaValidationError";
  }
}
