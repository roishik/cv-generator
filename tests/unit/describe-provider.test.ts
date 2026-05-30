import { describe, it, expect } from "vitest";
import { describeProvider } from "@/lib/ai/describe-provider";

describe("describeProvider", () => {
  it("reports mock honestly", () => {
    const d = describeProvider("mock");
    expect(d.isMock).toBe(true);
    expect(d.label).toBe("Mock · deterministic");
    expect(d.model).toBeUndefined();
  });

  it("reports a real provider with its default model (no more fake 'mock' label)", () => {
    const d = describeProvider("openai");
    expect(d.isMock).toBe(false);
    expect(d.name).toBe("OpenAI");
    expect(d.model).toBe("gpt-5.4");
    expect(d.label).toBe("OpenAI · gpt-5.4");
  });

  it("covers anthropic / google / deepseek", () => {
    expect(describeProvider("anthropic").label).toBe("Anthropic · claude-sonnet-4-6");
    expect(describeProvider("google").label).toBe("Google · gemini-2.5-pro");
    expect(describeProvider("deepseek").label).toBe("DeepSeek · deepseek-v4-pro");
  });
});
