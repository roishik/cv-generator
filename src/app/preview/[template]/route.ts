import { NextResponse } from "next/server";
import { renderCvToHtml } from "@/lib/render-engine/render";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { TemplateId } from "@/lib/schemas/cv-data";

export const runtime = "nodejs";

// Dev-only: serves a single template's rendered HTML (sample data) so the
// /preview page can iframe it. Keeps react-dom/server off the page graph.
export async function GET(_req: Request, ctx: { params: Promise<{ template: string }> }) {
  if (process.env["NODE_ENV"] === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const { template } = await ctx.params;
  const parsed = TemplateId.safeParse(template);
  if (!parsed.success) {
    return new NextResponse("Unknown template", { status: 404 });
  }
  const html = renderCvToHtml(sampleCvData, parsed.data);
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
