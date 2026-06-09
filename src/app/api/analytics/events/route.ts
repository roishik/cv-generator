export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { recordAnalyticsEventSafe } from "@/lib/analytics/events";

const AnalyticsEventInput = z.object({
  kind: z.string().min(1).max(80),
  status: z.enum(["ok", "warning", "error"]).optional(),
  path: z.string().max(300).optional(),
  action: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  value: z.number().finite().optional(),
  durationMs: z
    .number()
    .finite()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional(),
  meta: z.record(z.unknown()).optional(),
});

const AnalyticsBody = z.union([
  AnalyticsEventInput,
  z.object({ events: z.array(AnalyticsEventInput).min(1).max(20) }),
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse(null, { status: 204 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid analytics payload" }, { status: 400 });
  }

  const parsed = AnalyticsBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid analytics payload" }, { status: 400 });
  }

  const events = "events" in parsed.data ? parsed.data.events : [parsed.data];
  for (const event of events) {
    await recordAnalyticsEventSafe({
      userId: session.user.id,
      kind: event.kind,
      status: event.status,
      path: event.path,
      action: event.action,
      category: event.category,
      value: event.value,
      durationMs: event.durationMs,
      meta: event.meta,
    });
  }

  return new NextResponse(null, { status: 204 });
}
