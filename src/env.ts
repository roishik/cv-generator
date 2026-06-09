/**
 * Zod-validated environment module.
 * Fails fast at boot if required variables are missing.
 *
 * OPTIONAL-when-local rules (from 04-master-plan §6):
 *  - Google OAuth vars: optional when AUTH_DEV_LOGIN=true
 *  - Managed provider keys: optional (BYOK per-user in DB; managed-free path uses
 *    env keys only when configured)
 *  - STORAGE_SIGNING_SECRET: required
 *  - MASTER_KEY_SECRET: required
 */

import { z } from "zod";

const envSchema = z
  .object({
    // ── Node ──────────────────────────────────────────────────────────────────
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // ── App ───────────────────────────────────────────────────────────────────
    NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
    AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),

    // ── Auth.js Google OAuth (optional when AUTH_DEV_LOGIN=true) ─────────────
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    AUTH_DEV_LOGIN: z
      .string()
      .transform((v) => v === "true")
      .default("false"),
    AUTH_ALLOWED_EMAILS: z.string().optional(),
    AUTH_ADMIN_EMAILS: z.string().optional(),

    // ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: z.string().url(),
    APP_DATABASE_URL: z.string().url().optional(),
    CLOUD_SQL_CONNECTION_NAME: z.string().optional(),

    // ── File storage ──────────────────────────────────────────────────────────
    STORAGE_DRIVER: z.enum(["local", "supabase", "gcs"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("./storage"),
    GCS_BUCKET_UPLOADS: z.string().optional(),
    GCS_BUCKET_ARTIFACTS: z.string().optional(),
    GCS_BUCKET_PHOTOS: z.string().optional(),
    STORAGE_SIGNING_SECRET: z.string().min(16, "STORAGE_SIGNING_SECRET must be at least 16 chars"),

    // ── Encryption ────────────────────────────────────────────────────────────
    MASTER_KEY_SECRET: z.string().min(16, "MASTER_KEY_SECRET must be at least 16 chars"),

    // ── AI ────────────────────────────────────────────────────────────────────
    AI_PROVIDER: z.enum(["mock", "anthropic", "openai", "google", "deepseek"]).default("mock"),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    ANTHROPIC_DEFAULT_MODEL: z.string().optional(),
    OPENAI_DEFAULT_MODEL: z.string().optional(),
    GOOGLE_DEFAULT_MODEL: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_DEFAULT_MODEL: z.string().optional(),

    // ── PDF ───────────────────────────────────────────────────────────────────
    PLAYWRIGHT_CHROMIUM: z.string().optional(),
    PDF_MAX_CONCURRENCY: z.coerce.number().int().positive().default(3),

    // ── Rate limiting ─────────────────────────────────────────────────────────
    RATELIMIT_LLM_PER_HOUR: z.coerce.number().int().positive().default(30),
    RATELIMIT_UPLOAD_PER_HOUR: z.coerce.number().int().positive().default(20),
    RATELIMIT_GLOBAL_LLM_PER_HOUR: z.coerce.number().int().positive().default(1000),
    RATELIMIT_GLOBAL_UPLOAD_PER_HOUR: z.coerce.number().int().positive().default(1000),

    // ── Token budgets ─────────────────────────────────────────────────────────
    TOKEN_CAP_EXTRACT_TOTAL: z.coerce.number().int().positive().default(120000),
    TOKEN_CAP_TAILOR_TOTAL: z.coerce.number().int().positive().default(160000),
    TOKEN_CAP_EDIT_PROFILE_TOTAL: z.coerce.number().int().positive().default(120000),
    // Managed free budget picks max(default, 2x rolling avg per user+kind).
    TOKEN_CAP_FREE_EXTRACT_DEFAULT: z.coerce.number().int().positive().default(120000),
    TOKEN_CAP_FREE_TAILOR_DEFAULT: z.coerce.number().int().positive().default(160000),
  })
  .refine(
    (data) => {
      // Runtime-only production checks. We intentionally skip them during
      // `next build` (NEXT_PHASE=phase-production-build), then enforce at boot.
      if (process.env["NEXT_PHASE"] === "phase-production-build") return true;
      if (data.NODE_ENV === "production") {
        const hasGoogle = !!data.GOOGLE_CLIENT_ID && !!data.GOOGLE_CLIENT_SECRET;
        const noDevLogin = data.AUTH_DEV_LOGIN === false;
        const noMock = data.AI_PROVIDER !== "mock";
        const strongSecrets =
          data.AUTH_SECRET.length >= 32 &&
          data.STORAGE_SIGNING_SECRET.length >= 32 &&
          data.MASTER_KEY_SECRET.length >= 32;
        return hasGoogle && noDevLogin && noMock && strongSecrets;
      }
      // In dev/test: Google creds optional when AUTH_DEV_LOGIN=true
      if (data.AUTH_DEV_LOGIN) return true;
      // Otherwise they're still optional (just means no Google sign-in)
      return true;
    },
    {
      message:
        "Invalid production env: require Google OAuth creds, AUTH_DEV_LOGIN=false, AI_PROVIDER!=mock, and 32+ char secrets",
    },
  )
  .refine(
    (data) => {
      if (data.STORAGE_DRIVER !== "gcs") return true;
      return !!data.GCS_BUCKET_UPLOADS && !!data.GCS_BUCKET_ARTIFACTS;
    },
    {
      message: "STORAGE_DRIVER=gcs requires GCS_BUCKET_UPLOADS and GCS_BUCKET_ARTIFACTS",
    },
  );

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error("❌  Invalid environment variables:");
    console.error(JSON.stringify(formatted, null, 2));
    throw new Error("Invalid environment variables. Check the console for details.");
  }
  return result.data;
}

// Lazy singleton — evaluated at first import.
// Using a getter pattern avoids top-level execution during test tree-shaking.
let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    _env = parseEnv();
  }
  return _env;
}

/** Convenience re-export for direct destructuring. */
export const env = new Proxy({} as Env, {
  get(_, key: string) {
    return getEnv()[key as keyof Env];
  },
});
