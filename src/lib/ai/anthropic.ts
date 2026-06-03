// Anthropic adapter — uses tool-use with input_schema = our JSON Schema.
// The model "calls" a single tool whose arguments are the structured result.
// PURE: no DB, no auth. The key is passed in by factory.ts.
import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  ExtractProfileInput,
  EditProfileInput,
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
import { EDIT_PROFILE_SYSTEM_PROMPT, buildEditProfileUserPrompt } from "./prompts/edit-profile";
import { parseWithRepair } from "./structured";

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODELS.anthropic;
    this.maxTokens = opts.maxTokens ?? 4096;
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

  private async callTool(
    tool: { name: string; description: string; schema: object },
    system: string,
    userPrompt: string,
  ): Promise<string> {
    const run = async (messages: Anthropic.MessageParam[]): Promise<string> => {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        tools: [
          {
            name: tool.name,
            description: tool.description,
            input_schema: tool.schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: tool.name },
        messages,
      });
      const toolUse = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (!toolUse) throw new Error("anthropic: no tool_use block in response");
      return JSON.stringify(toolUse.input);
    };
    return run([{ role: "user", content: userPrompt }]);
  }

  async extractProfile(input: ExtractProfileInput) {
    const user = buildExtractionUserPrompt(input.rawText);
    const first = await this.callTool(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EXTRACTION_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "extractProfile", ExtractionResult, first, (msg) =>
      this.callTool(
        EXTRACT_PROFILE_JSON_SCHEMA,
        EXTRACTION_SYSTEM_PROMPT,
        `${user}\n\n${buildRepairPrompt(msg)}`,
      ),
    );
  }

  async tailor(input: TailorInput) {
    const user = buildTailorUserPrompt(input);
    const first = await this.callTool(
      TAILOR_CV_JSON_SCHEMA,
      TAILOR_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "tailor", TailorResult, first, (msg) =>
      this.callTool(
        TAILOR_CV_JSON_SCHEMA,
        TAILOR_SYSTEM_PROMPT,
        `${user}\n\n${buildRepairPrompt(msg)}`,
      ),
    );
  }

  async editProfile(input: EditProfileInput) {
    const user = buildEditProfileUserPrompt(input);
    const first = await this.callTool(
      EXTRACT_PROFILE_JSON_SCHEMA,
      EDIT_PROFILE_SYSTEM_PROMPT,
      user,
    );
    return parseWithRepair(this.id, "editProfile", ExtractionResult, first, (msg) =>
      this.callTool(
        EXTRACT_PROFILE_JSON_SCHEMA,
        EDIT_PROFILE_SYSTEM_PROMPT,
        `${user}\n\n${buildRepairPrompt(msg)}`,
      ),
    );
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `anthropic ${err.status}`;
  return err instanceof Error ? err.name : "unknown error";
}
