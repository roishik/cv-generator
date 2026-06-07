// DeepSeek adapter — OpenAI-compatible API (Chat Completions + JSON schema).
// DeepSeek exposes an OpenAI-style API at https://api.deepseek.com, so we
// reuse the OpenAI SDK with a custom baseURL.
// PURE: no DB, no auth. The key is passed in by factory.ts.
import OpenAI from "openai";
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
import { toStrictJsonSchema } from "./strict-schema";
import { assertEstimatedPromptWithinCap } from "./token-budget";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export interface DeepSeekOptions {
  apiKey: string;
  model?: string;
  /** Override the base URL (useful for testing). */
  baseURL?: string;
}

export class DeepSeekProvider implements LLMProvider {
  readonly id = "deepseek" as const;
  private readonly client: OpenAI;
  private readonly model: string;
  private lastUsage: TokenUsage | null = null;

  constructor(opts: DeepSeekOptions) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL ?? DEEPSEEK_BASE_URL,
    });
    this.model = opts.model ?? DEFAULT_MODELS.deepseek;
  }

  async validateKey(): Promise<ValidateKeyResult> {
    try {
      // Cheapest DeepSeek ping: a 1-token chat completion.
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: errMessage(err) };
    }
  }

  private async callJsonSchema(
    schema: { name: string; description: string; schema: object },
    system: string,
    userPrompt: string,
  ): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          description: schema.description,
          schema: toStrictJsonSchema(schema.schema) as Record<string, unknown>,
          strict: true,
        },
      },
    });
    this.addUsage(
      res.usage?.prompt_tokens ?? 0,
      res.usage?.completion_tokens ?? 0,
      res.usage?.total_tokens,
    );
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("deepseek: empty response content");
    return content;
  }

  async extractProfile(input: ExtractProfileInput) {
    this.lastUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const user = buildExtractionUserPrompt(input.rawText);
    assertEstimatedPromptWithinCap(
      "extract",
      `${EXTRACTION_SYSTEM_PROMPT}\n\n${user}`,
    );
    const first = await this.callJsonSchema(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EXTRACTION_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "extractProfile", ExtractionResult, first, (msg) =>
      this.callJsonSchema(
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
    const first = await this.callJsonSchema(TAILOR_CV_JSON_SCHEMA, system, user);
    return parseWithRepair(this.id, "tailor", TailorResult, first, (msg) =>
      this.callJsonSchema(
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
    const first = await this.callJsonSchema(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EDIT_PROFILE_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "editProfile", ExtractionResult, first, (msg) =>
      this.callJsonSchema(
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
    return this.model;
  }

  private addUsage(prompt: number, completion: number, total?: number): void {
    if (!this.lastUsage) return;
    this.lastUsage.promptTokens += Math.max(0, prompt);
    this.lastUsage.completionTokens += Math.max(0, completion);
    this.lastUsage.totalTokens += Math.max(
      0,
      total ?? Math.max(0, prompt) + Math.max(0, completion),
    );
  }
}

function errMessage(err: unknown): string {
  if (err instanceof OpenAI.APIError) return `deepseek ${err.status}`;
  return err instanceof Error ? err.name : "unknown error";
}
