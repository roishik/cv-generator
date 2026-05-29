/**
 * Zod-validated environment module.
 * Fails fast at boot if required variables are missing.
 *
 * OPTIONAL-when-local rules (from 04-master-plan §6):
 *  - Google OAuth vars: optional when AUTH_DEV_LOGIN=true
 *  - AI provider keys: always optional (BYOK per-user in DB); AI_PROVIDER defaults to 'mock'
 *  - STORAGE_SIGNING_SECRET: required
 *  - MASTER_KEY_SECRET: required
 */

import { z } from "zod";

const envSchema = z
  .object({
    // ── Node ──────────────────────────────────────────────────────────────────
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // ── App ───────────────────────────────────────────────────────────────────
    NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
    AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),

    // ── Auth.js Google OAuth (optional when AUTH_DEV_LOGIN=true) ─────────────
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    AUTH_DEV_LOGIN: z
      .string()
      .transform((v) => v === "true")
      .default("false"),
    AUTH_ALLOWED_EMAILS: z.string().optional(),

    // ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: z.string().url(),
    APP_DATABASE_URL: z.string().url().optional(),

    // ── File storage ──────────────────────────────────────────────────────────
    STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("./storage"),
    STORAGE_SIGNING_SECRET: z
      .string()
      .min(16, "STORAGE_SIGNING_SECRET must be at least 16 chars"),

    // ── Encryption ────────────────────────────────────────────────────────────
    MASTER_KEY_SECRET: z
      .string()
      .min(16, "MASTER_KEY_SECRET must be at least 16 chars"),

    // ── AI ────────────────────────────────────────────────────────────────────
    AI_PROVIDER: z
      .enum(["mock", "anthropic", "openai", "google"])
      .default("mock"),
    ANTHROPIC_DEFAULT_MODEL: z.string().optional(),
    OPENAI_DEFAULT_MODEL: z.string().optional(),
    GOOGLE_DEFAULT_MODEL: z.string().optional(),

    // ── PDF ───────────────────────────────────────────────────────────────────
    PLAYWRIGHT_CHROMIUM: z.string().optional(),
    PDF_MAX_CONCURRENCY: z.coerce.number().int().positive().default(3),

    // ── Rate limiting ─────────────────────────────────────────────────────────
    RATELIMIT_LLM_PER_HOUR: z.coerce.number().int().positive().default(10),
    RATELIMIT_UPLOAD_PER_HOUR: z.coerce.number().int().positive().default(20),
  })
  .refine(
    (data) => {
      // Google OAuth is REQUIRED in production (dev-login shim disabled in prod)
      if (data.NODE_ENV === "production") {
        return !!data.GOOGLE_CLIENT_ID && !!data.GOOGLE_CLIENT_SECRET;
      }
      // In dev/test: Google creds optional when AUTH_DEV_LOGIN=true
      if (data.AUTH_DEV_LOGIN) return true;
      // Otherwise they're still optional (just means no Google sign-in)
      return true;
    },
    {
      message:
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production",
    },
  );

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error("❌  Invalid environment variables:");
    console.error(JSON.stringify(formatted, null, 2));
    throw new Error(
      "Invalid environment variables. Check the console for details.",
    );
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
