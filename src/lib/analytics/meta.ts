const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_HEX_RE = /\b[0-9a-f]{24,}\b/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SAFE_KEY_RE = /^[a-zA-Z0-9_.:-]{1,96}$/;
const BLOCKED_META_KEY_RE =
  /(api.?key|secret|password|token|raw.?text|job.?description|cv.?data|resume.?text|filename|file.?name|content|plaintext|ciphertext|auth.?tag)/i;

export type AnalyticsMeta = Record<string, unknown>;

export function normalizeAnalyticsPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let path = raw;
  try {
    path = raw.startsWith("http") ? new URL(raw).pathname : raw;
  } catch {
    path = raw;
  }
  path = path.split(/[?#]/, 1)[0] ?? "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(UUID_RE, ":id").replace(LONG_HEX_RE, ":hash");
  path = path.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  if (path.length > 180) return "/[long-path]";
  return path;
}

export function sanitizeAnalyticsString(value: string): string {
  const clean = value.replace(EMAIL_RE, "[email]").replace(UUID_RE, ":id");
  if (clean.length > 240) return `[redacted:${clean.length} chars]`;
  return clean;
}

export function safeAnalyticsKey(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.trim();
  if (!SAFE_KEY_RE.test(clean)) return undefined;
  return clean;
}

export function sanitizeAnalyticsMeta(input: unknown, depth = 0): unknown {
  if (input == null) return null;
  if (typeof input === "string") return sanitizeAnalyticsString(input);
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "boolean") return input;
  if (input instanceof Date) return input.toISOString();
  if (depth >= 4) return "[redacted:depth]";

  if (Array.isArray(input)) {
    return input.slice(0, 20).map((item) => sanitizeAnalyticsMeta(item, depth + 1));
  }

  if (typeof input === "object") {
    const out: AnalyticsMeta = {};
    for (const [key, value] of Object.entries(input).slice(0, 50)) {
      if (BLOCKED_META_KEY_RE.test(key)) continue;
      const cleanKey = safeAnalyticsKey(key);
      if (!cleanKey) continue;
      const cleanValue = sanitizeAnalyticsMeta(value, depth + 1);
      if (cleanValue !== undefined) out[cleanKey] = cleanValue;
    }
    return out;
  }

  return null;
}

export function analyticsErrorMeta(error: unknown): AnalyticsMeta {
  const err = error as { name?: string; message?: string; code?: string; status?: number };
  return {
    errorType: sanitizeAnalyticsString(err?.name ?? "Error"),
    errorCode: err?.code ? sanitizeAnalyticsString(String(err.code)) : undefined,
    statusCode: typeof err?.status === "number" ? err.status : undefined,
    message: err?.message ? sanitizeAnalyticsString(err.message) : "Unknown error",
  };
}

export function byteSizeBucket(byteSize: number): string {
  if (byteSize < 250_000) return "<250KB";
  if (byteSize < 1_000_000) return "250KB-1MB";
  if (byteSize < 3_000_000) return "1MB-3MB";
  if (byteSize < 8_000_000) return "3MB-8MB";
  return "8MB+";
}
