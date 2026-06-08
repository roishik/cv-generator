// Google (Gemini) adapter — generationConfig with
// responseMimeType='application/json' + responseSchema.
// PURE: no DB, no auth. The key is passed in by factory.ts.
import { GoogleGenAI } from "@google/genai";
import type {
  LLMProvider,
  ExtractProfileInput,
  EditProfileInput,
  TokenUsage,
  TailorInput,
  ValidateKeyResult,
} from "./provider";
import { DEFAULT_MODELS } from "./provider";
import {
  ExtractionResult,
  TailorResult,
  EXTRACT_PROFILE_JSON_SCHEMA,
  TAILOR_CV_JSON_SCHEMA,
} from "@/lib/schemas/llm-contracts";
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  buildRepairPrompt,
} from "./prompts/extraction";
import { buildTailorPrompts } from "./prompts/tailor";
import { EDIT_PROFILE_SYSTEM_PROMPT, buildEditProfileUserPrompt } from "./prompts/edit-profile";
import { parseWithRepair } from "./structured";
import { assertEstimatedPromptWithinCap } from "./token-budget";

export interface GoogleOptions {
  apiKey: string;
  model?: string;
}

export class GoogleProvider implements LLMProvider {
  readonly id = "google" as const;
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private lastModelUsed: string;
  private lastUsage: TokenUsage | null = null;

  constructor(opts: GoogleOptions) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODELS.google;
    this.lastModelUsed = this.model;
  }

  async validateKey(): Promise<ValidateKeyResult> {
    try {
      // Cheapest probe: list a single model page.
      await this.client.models.list({ config: { pageSize: 1 } });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: errMessage(err) };
    }
  }

  private async callJson(
    schema: { schema: object },
    system: string,
    userPrompt: string,
  ): Promise<string> {
    const res = await this.generateWithFallback(schema, system, userPrompt);
    this.addUsage({
      promptTokenCount: res.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: res.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokenCount: res.usageMetadata?.totalTokenCount ?? 0,
    });
    const text = res.text;
    if (!text) throw new Error("google: empty response text");
    return text;
  }

  async extractProfile(input: ExtractProfileInput) {
    this.lastUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const user = buildExtractionUserPrompt(input.rawText);
    assertEstimatedPromptWithinCap(
      "extract",
      `${EXTRACTION_SYSTEM_PROMPT}\n\n${user}`,
    );
    const first = await this.callJson(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EXTRACTION_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "extractProfile", ExtractionResult, first, (msg) =>
      this.callJson(
        EXTRACT_PROFILE_JSON_SCHEMA,
        EXTRACTION_SYSTEM_PROMPT,
        `${user}\n\n${buildRepairPrompt(msg)}`,
      ),
    );
  }

  async tailor(input: TailorInput) {
    this.lastUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const { system, user } = buildTailorPrompts(input);
    assertEstimatedPromptWithinCap("tailor", `${system}\n\n${user}`);
    const first = await this.callJson(TAILOR_CV_JSON_SCHEMA, system, user);
    return parseWithRepair(this.id, "tailor", TailorResult, first, (msg) =>
      this.callJson(
        TAILOR_CV_JSON_SCHEMA,
        system,
        `${user}\n\n${buildRepairPrompt(msg)}`,
      ),
    );
  }

  async editProfile(input: EditProfileInput) {
    this.lastUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const user = buildEditProfileUserPrompt(input);
    assertEstimatedPromptWithinCap(
      "edit-profile",
      `${EDIT_PROFILE_SYSTEM_PROMPT}\n\n${user}`,
    );
    const first = await this.callJson(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EDIT_PROFILE_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "editProfile", ExtractionResult, first, (msg) =>
      this.callJson(
        EXTRACT_PROFILE_JSON_SCHEMA,
        EDIT_PROFILE_SYSTEM_PROMPT,
        `${user}\n\n${buildRepairPrompt(msg)}`,
      ),
    );
  }

  getLastUsage(): TokenUsage | null {
    return this.lastUsage;
  }

  getModelId(): string {
    return this.lastModelUsed;
  }

  private async generateWithFallback(
    schema: { schema: object },
    system: string,
    userPrompt: string,
  ) {
    try {
      this.lastModelUsed = this.model;
      return await this.generate(schema, system, userPrompt, this.model);
    } catch (err) {
      if (this.model === "gemini-3.5-flash" && isTransientGoogleOverload(err)) {
        const fallback = "gemini-2.5-flash";
        this.lastModelUsed = fallback;
        return this.generate(schema, system, userPrompt, fallback);
      }
      throw friendlyGoogleError(err);
    }
  }

  private async generate(
    schema: { schema: object },
    system: string,
    userPrompt: string,
    model: string,
  ) {
    return this.client.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        // Our JSON Schema is structurally compatible with Gemini's responseSchema.
        responseSchema: schema.schema as never,
      },
    });
  }

  private addUsage(meta: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  }): void {
    if (!this.lastUsage) return;
    const prompt = Math.max(0, meta.promptTokenCount);
    const completion = Math.max(0, meta.candidatesTokenCount);
    const total = Math.max(0, meta.totalTokenCount || prompt + completion);
    this.lastUsage.promptTokens += prompt;
    this.lastUsage.completionTokens += completion;
    this.lastUsage.totalTokens += total;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.name : "unknown error";
}

function isTransientGoogleOverload(err: unknown): boolean {
  const status = typeof err === "object" && err !== null && "status" in err
    ? (err as { status?: unknown }).status
    : undefined;
  const text = err instanceof Error ? err.message : String(err);
  return (
    status === 503 ||
    text.includes('"code":503') ||
    text.includes("UNAVAILABLE") ||
    text.toLowerCase().includes("high demand")
  );
}

function friendlyGoogleError(err: unknown): Error {
  if (isTransientGoogleOverload(err)) {
    return new Error(
      "Google Gemini is temporarily overloaded. Please try again in a minute.",
    );
  }
  return err instanceof Error ? err : new Error("Google AI request failed.");
}
