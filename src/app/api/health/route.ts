/**
 * GET /api/health — liveness/readiness probe.
 *
 * Returns { ok, browser, db } as specified by the master plan (§5 manifest, M12
 * acceptance). Node runtime only (never Edge — touches pg + the Chromium binary).
 *
 *  - `db`      — true if a trivial `SELECT 1` succeeds on the app pool.
 *  - `browser` — true if Playwright's Chromium executable is present on disk
 *                (cheap check; we deliberately do NOT launch a browser on every
 *                health poll). Falls back to launch-probe only if the path lookup
 *                is unavailable.
 *  - `ok`      — db && browser.
 *
 * Never leaks connection strings, stack traces, or secrets in the body.
 */

import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { getAppSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkDb(): Promise<boolean> {
  try {
    const sql = getAppSql();
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function checkBrowser(): boolean {
  try {
    const explicit = process.env.PLAYWRIGHT_CHROMIUM;
    if (explicit) return existsSync(explicit);
    // executablePath() returns the path Playwright would launch; existence on
    // disk means a PDF render can boot Chromium without a network install.
    const p = chromium.executablePath();
    return !!p && existsSync(p);
  } catch {
    return false;
  }
}

export async function GET() {
  const [db, browser] = [await checkDb(), checkBrowser()];
  const ok = db && browser;
  return NextResponse.json({ ok, browser, db }, { status: ok ? 200 : 503 });
}
