/**
 * Release-hardening artifact capture.
 *
 * Drives the live dev app with Playwright using the dev-login shim + mock
 * provider (zero spend, deterministic) and captures screenshots of every
 * journey into planning/screenshots/. Also renders one-page PDFs for BOTH
 * templates via the pure render engine into planning/samples/ and runs the
 * QA checks.
 *
 * Usage:  BASE_URL=http://localhost:3100 pnpm tsx scripts/capture-screenshots.ts
 */

import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sampleCvData } from "@/lib/render-engine/sample-data";
import { renderCvToPdf } from "@/lib/pdf/render-pdf";
import { closeBrowser } from "@/lib/pdf/browser-pool";
import { runQaChecks } from "@/lib/qa/assertions";
import type { TemplateId } from "@/lib/schemas/cv-data";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "planning", "screenshots");
const SAMPLES = path.join(ROOT, "planning", "samples");

mkdirSync(SHOTS, { recursive: true });
mkdirSync(SAMPLES, { recursive: true });

async function shot(page: Page, name: string) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

async function devSignIn(page: Page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Ada Sample/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`    [console.error] ${m.text()}`);
  });

  console.log("→ Capturing UI screenshots");

  // Landing
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot(page, "01-landing");

  // Styleguide light
  await page.goto(`${BASE}/styleguide`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, "02-styleguide-light");

  // Styleguide dark — toggle theme via the html.dark class
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(400);
  await shot(page, "03-styleguide-dark");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  // Sign-in page (shows dev-login buttons)
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await shot(page, "04-sign-in");

  // Authenticate
  await devSignIn(page);
  await page.waitForLoadState("networkidle");
  await shot(page, "05-dashboard");

  // Onboarding (upload + paste paths on one wizard)
  await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "06-onboarding");
  // Exercise the paste path: fill the resume textarea if present
  const pasteArea = page.locator("textarea").first();
  if (await pasteArea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pasteArea.fill(
      "Jane Doe\nSenior Software Engineer\nAcme Corp 2020-Present\n- Built distributed systems\n- Led a team of 5",
    );
    await page.waitForTimeout(300);
    await shot(page, "07-onboarding-paste");
  }

  // Settings / BYOK
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "08-settings-byok");

  // Knowledge base editor
  await page.goto(`${BASE}/knowledge-base`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "09-knowledge-base");

  // Tailor workspace — paste JD → Generate → diff + preview
  await page.goto(`${BASE}/tailor`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "10-workspace-empty");

  const TECH_JD = [
    "We are hiring a Senior Software Engineer to build our machine learning platform.",
    "You will own widget infrastructure, mentor engineers, and drive latency improvements",
    "across our cloud SaaS product. Required: TypeScript, cloud infrastructure, mentoring.",
  ].join(" ");

  const jd = page.locator("#jd-input");
  let pasted = false;
  if (await jd.isVisible({ timeout: 5000 }).catch(() => false)) {
    await jd.fill(TECH_JD);
    pasted = true;
  } else {
    const jobTab = page.getByRole("tab", { name: /job/i });
    if (await jobTab.isVisible({ timeout: 2000 }).catch(() => false)) await jobTab.click();
    const ta = page.locator("textarea").first();
    if (await ta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ta.fill(TECH_JD);
      pasted = true;
    }
  }
  if (pasted) {
    await page.waitForTimeout(300);
    await shot(page, "11-workspace-jd-pasted");
    const tailorBtn = page.getByRole("button", { name: /Tailor CV/i }).first();
    if (await tailorBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tailorBtn.click();
      // Wait for tailored output (mock + PDF render)
      await page
        .getByText(/Tailored|Changes|Export/i)
        .first()
        .waitFor({ timeout: 90_000 })
        .catch(() => null);
      await page.waitForTimeout(1500);
      await shot(page, "12-workspace-tailored-diff");
    }
  }

  // Documents / version history
  await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "13-documents-history");

  // Rendered CV templates (pure render engine HTML, served at /preview/[template])
  for (const tpl of ["sidebar", "clean"] as TemplateId[]) {
    await page.goto(`${BASE}/preview/${tpl}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 794, height: 1123 });
    await shot(page, `14-cv-${tpl}`);
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await ctx.close();
  await browser.close();

  // ── Generate one-page PDFs for BOTH templates + QA ──
  console.log("\n→ Rendering one-page PDFs (both templates) + QA");
  const qaReport: string[] = [];
  for (const tpl of ["sidebar", "clean"] as TemplateId[]) {
    const res = await renderCvToPdf(sampleCvData, tpl);
    if (!res.fits) {
      console.log(`  [${tpl}] FIT FAILURE: ${res.reason}`);
      qaReport.push(`${tpl}: FIT FAILURE — ${res.reason}`);
      continue;
    }
    writeFileSync(path.join(SAMPLES, `cv-${tpl}.pdf`), res.pdf);
    writeFileSync(path.join(SAMPLES, `cv-${tpl}.html`), res.html);
    const qa = await runQaChecks({
      pdf: res.pdf,
      html: res.html,
      templateId: tpl,
      expectedText: sampleCvData.header.name,
      contentHeightPx: res.contentHeightPx,
      pageHeightPx: res.theme.page.heightPx,
      safeBottomPx: res.theme.page.safeBottomPx,
    });
    const line = `${tpl}: rung=${res.rungUsed} bytes=${res.pdf.byteLength} QA.ok=${qa.ok}`;
    console.log(`  ✅ ${line}`);
    for (const c of qa.checks) console.log(`       ${c.pass ? "PASS" : "FAIL"} ${c.name}`);
    qaReport.push(line);
  }
  writeFileSync(path.join(SAMPLES, "qa-report.txt"), qaReport.join("\n") + "\n");
  await closeBrowser();
  console.log("\n✅ Capture complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
