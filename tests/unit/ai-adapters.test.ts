// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { OpenAIProvider } from "@/lib/ai/openai";
import { GoogleProvider } from "@/lib/ai/google";
import { createProvider, validateProviderKey } from "@/lib/ai/factory";
import { ExtractionResult, TailorResult } from "@/lib/schemas/llm-contracts";
import { SchemaValidationError } from "@/lib/ai/provider";
import { MockProvider } from "@/lib/ai/mock";
import { SAMPLE_KB, SAMPLE_JD, SAMPLE_RESUME_TEXT } from "./fixtures/ai-fixtures";

// A valid extraction payload (the JSON a real model would emit for the tool args).
const VALID_EXTRACTION = {
  header: { name: "Dana Whitfield", title: "Senior PM" },
  contact: { email: "dana@example.com" },
  experiences: [
    { company: "Northstar AI", role: "Senior PM", bulletsFull: ["Did X."] },
  ],
  education: [],
  skills: { professional: ["Product"], soft: [] },
};

// A valid tailor payload echoing a real KB id.
const VALID_TAILOR = {
  cvData: {
    header: { name: "Dana Whitfield", title: "Senior PM", summary: "S." },
    contact: { email: "dana@example.com" },
    summary: "S.",
    skills: { professional: ["Product"], soft: [] },
    experience: [
      {
        kbExperienceId: SAMPLE_KB.experiences[0]!.id,
        company: "Northstar AI",
        role: "Senior PM",
        bullets: ["Did X."],
      },
    ],
    education: [],
  },
  rationale: [],
  templateSuggestion: "clean",
  warnings: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AnthropicProvider adapter", () => {
  function stub(provider: AnthropicProvider, payload: object) {
    // The adapter accesses this.client.messages.create
    const client = (provider as unknown as { client: { messages: { create: unknown } } })
      .client;
    client.messages.create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", name: "x", input: payload }],
    });
  }

  it("parses extraction tool-use into a valid ExtractionResult", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-test" });
    stub(p, VALID_EXTRACTION);
    const res = await p.extractProfile({ rawText: SAMPLE_RESUME_TEXT });
    expect(() => ExtractionResult.parse(res)).not.toThrow();
  });

  it("parses tailor tool-use into a valid TailorResult", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-test" });
    stub(p, VALID_TAILOR);
    const res = await p.tailor({
      knowledgeBase: SAMPLE_KB,
      jdText: SAMPLE_JD,
      templateId: "clean",
    });
    expect(() => TailorResult.parse(res)).not.toThrow();
  });

  it("repairs once on a bad first response, then succeeds", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-test" });
    const client = (p as unknown as { client: { messages: { create: unknown } } }).client;
    const create = vi
      .fn()
      .mockResolvedValueOnce({ content: [{ type: "tool_use", name: "x", input: { bad: true } }] })
      .mockResolvedValueOnce({ content: [{ type: "tool_use", name: "x", input: VALID_EXTRACTION }] });
    client.messages.create = create;
    const res = await p.extractProfile({ rawText: "x" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.header.name).toBe("Dana Whitfield");
  });

  it("hard-errors after the repair retry also fails", async () => {
    const p = new AnthropicProvider({ apiKey: "sk-test" });
    const client = (p as unknown as { client: { messages: { create: unknown } } }).client;
    client.messages.create = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "tool_use", name: "x", input: { bad: true } }] });
    await expect(p.extractProfile({ rawText: "x" })).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
  });
});

describe("OpenAIProvider adapter", () => {
  function stub(provider: OpenAIProvider, payload: object) {
    const client = (
      provider as unknown as { client: { chat: { completions: { create: unknown } } } }
    ).client;
    client.chat.completions.create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    });
  }

  it("parses json_schema content into a valid ExtractionResult", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-test" });
    stub(p, VALID_EXTRACTION);
    const res = await p.extractProfile({ rawText: SAMPLE_RESUME_TEXT });
    expect(() => ExtractionResult.parse(res)).not.toThrow();
  });

  it("parses tailor content into a valid TailorResult", async () => {
    const p = new OpenAIProvider({ apiKey: "sk-test" });
    stub(p, VALID_TAILOR);
    const res = await p.tailor({
      knowledgeBase: SAMPLE_KB,
      jdText: SAMPLE_JD,
      templateId: "clean",
    });
    expect(() => TailorResult.parse(res)).not.toThrow();
  });
});

describe("GoogleProvider adapter", () => {
  function stub(provider: GoogleProvider, payload: object) {
    const client = (
      provider as unknown as { client: { models: { generateContent: unknown } } }
    ).client;
    client.models.generateContent = vi
      .fn()
      .mockResolvedValue({ text: JSON.stringify(payload) });
  }

  it("parses responseSchema JSON into a valid ExtractionResult", async () => {
    const p = new GoogleProvider({ apiKey: "key" });
    stub(p, VALID_EXTRACTION);
    const res = await p.extractProfile({ rawText: SAMPLE_RESUME_TEXT });
    expect(() => ExtractionResult.parse(res)).not.toThrow();
  });

  it("parses tailor JSON into a valid TailorResult", async () => {
    const p = new GoogleProvider({ apiKey: "key" });
    stub(p, VALID_TAILOR);
    const res = await p.tailor({
      knowledgeBase: SAMPLE_KB,
      jdText: SAMPLE_JD,
      templateId: "clean",
    });
    expect(() => TailorResult.parse(res)).not.toThrow();
  });
});

describe("factory", () => {
  it("creates a MockProvider for 'mock' with no key", () => {
    expect(createProvider({ provider: "mock" })).toBeInstanceOf(MockProvider);
  });

  it("throws when a real provider is requested without a key", () => {
    expect(() => createProvider({ provider: "anthropic" })).toThrow(/requires an API key/);
  });

  it("validateProviderKey is a no-op success for mock", async () => {
    await expect(validateProviderKey("mock", undefined)).resolves.toEqual({
      ok: true,
      message: "mock needs no key",
    });
  });
});
