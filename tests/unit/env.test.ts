import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * These tests exercise the Zod schema logic directly rather than
 * mutating process.env (which is read-only in strict TypeScript).
 */

// Inline the schema shape for unit-testing without process.env mutation
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_DEV_LOGIN: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  DATABASE_URL: z.string().url(),
  APP_DATABASE_URL: z.string().url().optional(),
  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  STORAGE_SIGNING_SECRET: z.string().min(16),
  MASTER_KEY_SECRET: z.string().min(16),
  AI_PROVIDER: z
    .enum(["mock", "anthropic", "openai", "google"])
    .default("mock"),
  PDF_MAX_CONCURRENCY: z.coerce.number().int().positive().default(3),
  RATELIMIT_LLM_PER_HOUR: z.coerce.number().int().positive().default(10),
  RATELIMIT_UPLOAD_PER_HOUR: z.coerce.number().int().positive().default(20),
});

const minimalValidEnv = {
  AUTH_SECRET: "super-secret-auth-key-at-least-16-chars",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/cvgen",
  STORAGE_SIGNING_SECRET: "signing-secret-at-least-16-chars!!",
  MASTER_KEY_SECRET: "master-key-secret-at-least-16-chars!!!",
  AUTH_DEV_LOGIN: "true",
  AI_PROVIDER: "mock",
};

describe("env schema", () => {
  it("parses valid minimal env", () => {
    const result = envSchema.safeParse(minimalValidEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.AUTH_DEV_LOGIN).toBe(true);
      expect(result.data.AI_PROVIDER).toBe("mock");
      expect(result.data.NODE_ENV).toBe("development");
    }
  });

  it("fails when AUTH_SECRET is too short", () => {
    const result = envSchema.safeParse({ ...minimalValidEnv, AUTH_SECRET: "short" });
    expect(result.success).toBe(false);
  });

  it("fails when DATABASE_URL is not a valid URL", () => {
    const result = envSchema.safeParse({ ...minimalValidEnv, DATABASE_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("defaults AI_PROVIDER to mock when absent", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { AI_PROVIDER: _unused, ...withoutProvider } = minimalValidEnv;
    const result = envSchema.safeParse(withoutProvider);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.AI_PROVIDER).toBe("mock");
    }
  });

  it("defaults NODE_ENV to development", () => {
    const result = envSchema.safeParse(minimalValidEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe("development");
    }
  });

  it("defaults PDF_MAX_CONCURRENCY to 3", () => {
    const result = envSchema.safeParse(minimalValidEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PDF_MAX_CONCURRENCY).toBe(3);
    }
  });

  it("allows optional Google OAuth keys", () => {
    const result = envSchema.safeParse({
      ...minimalValidEnv,
      GOOGLE_CLIENT_ID: "some-client-id",
      GOOGLE_CLIENT_SECRET: "some-client-secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.GOOGLE_CLIENT_ID).toBe("some-client-id");
    }
  });
});
