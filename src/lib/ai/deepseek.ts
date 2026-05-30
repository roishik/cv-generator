// DeepSeek adapter — OpenAI-compatible API (Chat Completions + JSON schema).
// DeepSeek exposes an OpenAI-style API at https://api.deepseek.com, so we
// reuse the OpenAI SDK with a custom baseURL.
// PURE: no DB, no auth. The key is passed in by factory.ts.
import OpenAI from "openai";
import type {
  LLMProvider,
  ExtractProfileInput,
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
import { TAILOR_SYSTEM_PROMPT, buildTailorUserPrompt } from "./prompts/tailor";
import { parseWithRepair } from "./structured";
import { toStrictJsonSchema } from "./strict-schema";

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
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("deepseek: empty response content");
    return content;
  }

  async extractProfile(input: ExtractProfileInput) {
    const user = buildExtractionUserPrompt(input.rawText);
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
    const user = buildTailorUserPrompt(input);
    const first = await this.callJsonSchema(
      TAILOR_CV_JSON_SCHEMA,
      TAILOR_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "tailor", TailorResult, first, (msg) =>
      this.callJsonSchema(
        TAILOR_CV_JSON_SCHEMA,
        TAILOR_SYSTEM_PROMPT,
        `${user}\n\n${buildRepairPrompt(msg)}`,
      ),
    );
  }
}

function errMessage(err: unknown): string {
  if (err instanceof OpenAI.APIError) return `deepseek ${err.status}`;
  return err instanceof Error ? err.name : "unknown error";
}
