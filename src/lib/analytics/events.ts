import { withUser } from "@/lib/db/rls";
import { usageEvents } from "@/lib/db/schema";
import {
  normalizeAnalyticsPath,
  safeAnalyticsKey,
  sanitizeAnalyticsMeta,
  type AnalyticsMeta,
} from "./meta";

export type AnalyticsStatus = "ok" | "warning" | "error";

export interface AnalyticsEvent {
  userId: string;
  kind: string;
  status?: AnalyticsStatus;
  path?: string | null;
  action?: string | null;
  category?: string | null;
  value?: number | null;
  durationMs?: number | null;
  meta?: AnalyticsMeta;
}

export async function recordAnalyticsEvent(input: AnalyticsEvent): Promise<void> {
  const kind = safeAnalyticsKey(input.kind);
  if (!kind) throw new Error("recordAnalyticsEvent: invalid event kind");

  const meta = sanitizeAnalyticsMeta({
    ...(input.path ? { path: normalizeAnalyticsPath(input.path) } : {}),
    ...(input.action ? { action: safeAnalyticsKey(input.action) } : {}),
    ...(input.category ? { category: safeAnalyticsKey(input.category) } : {}),
    ...(typeof input.value === "number" && Number.isFinite(input.value)
      ? { value: Math.round(input.value) }
      : {}),
    ...(input.meta ?? {}),
  }) as AnalyticsMeta;

  await withUser(input.userId, (tx) =>
    tx.insert(usageEvents).values({
      userId: input.userId,
      kind,
      status: input.status ?? "ok",
      latencyMs:
        typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
          ? Math.max(0, Math.round(input.durationMs))
          : null,
      meta,
    }),
  );
}

export async function recordAnalyticsEventSafe(input: AnalyticsEvent): Promise<void> {
  try {
    await recordAnalyticsEvent(input);
  } catch {
    console.error("[analytics] failed to record event", input.kind);
  }
}
