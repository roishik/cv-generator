import { getEnv } from "@/env";

type RateLimitKind = "llm" | "upload";

interface Counter {
  windowStartMs: number;
  count: number;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour fixed window
const counters = new Map<string, Counter>();

function currentWindowStart(nowMs = Date.now()): number {
  return Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
}

function counterKey(scope: "user" | "global", kind: RateLimitKind, userId?: string): string {
  if (scope === "global") return `global:${kind}`;
  return `user:${kind}:${userId ?? ""}`;
}

function limits(kind: RateLimitKind): { user: number; global: number } {
  const env = getEnv();
  if (kind === "llm") {
    return {
      user: env.RATELIMIT_LLM_PER_HOUR,
      global: env.RATELIMIT_GLOBAL_LLM_PER_HOUR,
    };
  }
  return {
    user: env.RATELIMIT_UPLOAD_PER_HOUR,
    global: env.RATELIMIT_GLOBAL_UPLOAD_PER_HOUR,
  };
}

function consume(key: string, maxPerWindow: number, nowMs = Date.now()): {
  ok: boolean;
  remaining: number;
  resetAtMs: number;
} {
  const windowStartMs = currentWindowStart(nowMs);
  const resetAtMs = windowStartMs + WINDOW_MS;
  const existing = counters.get(key);
  const base: Counter =
    !existing || existing.windowStartMs !== windowStartMs
      ? { windowStartMs, count: 0 }
      : existing;

  const nextCount = base.count + 1;
  const ok = nextCount <= maxPerWindow;
  const stored: Counter = ok ? { windowStartMs, count: nextCount } : base;
  counters.set(key, stored);

  return {
    ok,
    remaining: Math.max(0, maxPerWindow - stored.count),
    resetAtMs,
  };
}

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    retryAfterSeconds: number,
    readonly meta: { kind: RateLimitKind; scope: "user" | "global" },
  ) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * In-memory fixed-window limiter.
 * Intended for single-instance runtime (Cloud Run min instances=1 / local dev).
 * Swap to Redis/Postgres-backed counters before horizontal scaling.
 */
export function assertWithinRateLimit(input: {
  kind: RateLimitKind;
  userId: string;
}): void {
  const { kind, userId } = input;
  const nowMs = Date.now();
  const cfg = limits(kind);

  const userResult = consume(counterKey("user", kind, userId), cfg.user, nowMs);
  if (!userResult.ok) {
    throw new RateLimitError(
      `Rate limit exceeded: too many ${kind} operations for this user in the last hour.`,
      Math.ceil((userResult.resetAtMs - nowMs) / 1000),
      { kind, scope: "user" },
    );
  }

  const globalResult = consume(counterKey("global", kind), cfg.global, nowMs);
  if (!globalResult.ok) {
    throw new RateLimitError(
      `Rate limit exceeded: system-wide ${kind} capacity reached for this hour.`,
      Math.ceil((globalResult.resetAtMs - nowMs) / 1000),
      { kind, scope: "global" },
    );
  }
}

export function __resetRateLimitForTests(): void {
  counters.clear();
}
