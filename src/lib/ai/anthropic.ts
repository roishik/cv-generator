// Anthropic adapter — uses output_config.format (structured JSON output) +
// adaptive thinking + streaming. Replaces the old tool-use approach which is
// incompatible with thinking. PURE: no DB, no auth. Key passed by factory.ts.
import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  ExtractProfileInput,
  EditProfileInput,
  TokenUsage,
  TailorInput,
  ValidateKeyResult,
  ReasoningOptions,
} from "./provider";
import {
  DEFAULT_MODELS,
  FLAGSHIP_MODELS,
  ANTHROPIC_EFFORT,
  ANTHROPIC_MAX_TOKENS,
} from "./provider";
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
import { env } from "@/env";

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  reasoning?: ReasoningOptions;
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly effort: "medium" | "high";
  private lastUsage: TokenUsage | null = null;

  constructor(opts: AnthropicOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    const tier = opts.reasoning?.tier ?? "standard";
    // Extended tier uses the flagship model unless the caller supplied an explicit override.
    const defaultModel =
      tier === "extended"
        ? (env.ANTHROPIC_EXTENDED_MODEL ?? FLAGSHIP_MODELS.anthropic)
        : DEFAULT_MODELS.anthropic;
    this.model = opts.model ?? defaultModel;
    this.effort = ANTHROPIC_EFFORT[tier];
    this.maxTokens = opts.maxTokens ?? ANTHROPIC_MAX_TOKENS[tier];
  }

  async validateKey(): Promise<ValidateKeyResult> {
    try {
      // Cheapest auth probe: a 1-token completion.
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: errMessage(err) };
    }
  }

  /**
   * Structured-output call via output_config.format (json_schema) + adaptive
   * thinking + streaming. Replaces the old forced tool-use approach which is
   * incompatible with thinking.
   */
  private async callStructured(
    schemaDef: { name: string; description: string; schema: object },
    system: string,
    userPrompt: string,
  ): Promise<string> {
    const run = async (messages: Anthropic.MessageParam[]): Promise<string> => {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        thinking: { type: "adaptive" },
        output_config: {
          effort: this.effort,
          format: {
            type: "json_schema",
            schema: toStrictJsonSchema(schemaDef.schema) as { [key: string]: unknown },
          },
        },
        system,
        messages,
      });
      const msg = await stream.finalMessage();
      this.addUsage(
        msg.usage?.input_tokens ?? 0,
        msg.usage?.output_tokens ?? 0,
      );
      const textBlock = msg.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (!textBlock) throw new Error("anthropic: no text block in response");
      return textBlock.text;
    };
    return run([{ role: "user", content: userPrompt }]);
  }

  async extractProfile(input: ExtractProfileInput) {
    this.lastUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const user = buildExtractionUserPrompt(input.rawText);
    assertEstimatedPromptWithinCap(
      "extract",
      `${EXTRACTION_SYSTEM_PROMPT}\n\n${user}`,
    );
    const first = await this.callStructured(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EXTRACTION_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "extractProfile", ExtractionResult, first, (msg) =>
      this.callStructured(
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
    const first = await this.callStructured(TAILOR_CV_JSON_SCHEMA, system, user);
    return parseWithRepair(this.id, "tailor", TailorResult, first, (msg) =>
      this.callStructured(
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
    const first = await this.callStructured(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EDIT_PROFILE_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "editProfile", ExtractionResult, first, (msg) =>
      this.callStructured(
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

  private addUsage(prompt: number, completion: number): void {
    if (!this.lastUsage) return;
    this.lastUsage.promptTokens += Math.max(0, prompt);
    this.lastUsage.completionTokens += Math.max(0, completion);
    this.lastUsage.totalTokens += Math.max(0, prompt) + Math.max(0, completion);
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `anthropic ${err.status}`;
  return err instanceof Error ? err.name : "unknown error";
}
