// Google (Gemini) adapter — generationConfig with
// responseMimeType='application/json' + responseSchema.
// PURE: no DB, no auth. The key is passed in by factory.ts.
import { GoogleGenAI } from "@google/genai";
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
import { buildTailorPrompts } from "./prompts/tailor";
import { EDIT_PROFILE_SYSTEM_PROMPT, buildEditProfileUserPrompt } from "./prompts/edit-profile";
import { parseWithRepair } from "./structured";

export interface GoogleOptions {
  apiKey: string;
  model?: string;
}

export class GoogleProvider implements LLMProvider {
  readonly id = "google" as const;
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(opts: GoogleOptions) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODELS.google;
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
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        // Our JSON Schema is structurally compatible with Gemini's responseSchema.
        responseSchema: schema.schema as never,
      },
    });
    const text = res.text;
    if (!text) throw new Error("google: empty response text");
    return text;
  }

  async extractProfile(input: ExtractProfileInput) {
    const user = buildExtractionUserPrompt(input.rawText);
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
    const { system, user } = buildTailorPrompts(input);
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
    const user = buildEditProfileUserPrompt(input);
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
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.name : "unknown error";
}
