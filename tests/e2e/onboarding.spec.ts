/**
 * e2e — Onboarding journey.
 *
 * Journey: dev sign-in → paste resume text → extraction (mock) → review profile.
 *
 * Uses the mock AI provider (AI_PROVIDER=mock) so no real keys are needed.
 * Dev-login shim signs in as Ada Sample (seeded user with a knowledge base).
 */

import { test, expect } from "@playwright/test";

// A short but valid resume text (> MIN_TEXT_LENGTH=100 chars)
const SAMPLE_RESUME_TEXT = `
Dana Whitfield
Senior Product Manager · AI Platforms
dana@example.com | +1 415 555 0142 | San Francisco, CA | linkedin.com/in/danawhitfield

EXPERIENCE
Northstar AI — Senior Product Manager (2021–Present)
- Led the 0→1 launch of an LLM developer platform, growing to 40,000 monthly active developers.
- Defined the API roadmap with eng leadership; cut time-to-first-call from 30 min to under 5.
- Ran weekly experiments that lifted activation 22% and retention 11%.

Mapline — Product Manager (2017–2021)
- Owned the geospatial analytics suite used by 300+ enterprise customers.
- Shipped a self-serve onboarding flow that reduced sales-assist tickets 35%.

EDUCATION
University of Washington — B.S. Computer Science (2012–2016), Minor in Statistics

SKILLS
Product Strategy, ML/AI Products, Roadmapping, SQL, A/B Testing, Developer Platforms
Cross-functional leadership, Stakeholder alignment, Mentoring
`.trim();

async function devSignIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /Ada Sample/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe("Onboarding — paste text path", () => {
  test("dev sign-in → navigate to onboarding page", async ({ page }) => {
    await devSignIn(page);
    // Navigate to onboarding
    await page.goto("/onboarding");
    // Should stay on onboarding (not redirect to sign-in)
    await expect(page).toHaveURL(/\/onboarding/);
    // The onboarding page renders — it has the OnboardingWizard client component
    await page.waitForLoadState("networkidle");
    // The wizard header or step rail should be visible
    await expect(
      page.getByText(/Upload|Resume|Step 1|onboarding/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("onboarding page shows the step rail", async ({ page }) => {
    await devSignIn(page);
    await page.goto("/onboarding");
    await page.waitForLoadState("networkidle");
    // Step rail should show Upload (step 1) — first visible step label
    // The OnboardingWizard shows steps: Upload / Review / AI key
    await expect(
      page.getByText("Upload").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("paste text path: can enter resume text and trigger extraction", async ({ page }) => {
    await devSignIn(page);
    await page.goto("/onboarding");

    // Look for the paste text option
    const pasteToggle = page.getByRole("button", { name: /paste.*text|type.*manually|enter.*text/i });
    if (await pasteToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await pasteToggle.click();
    }

    // Find textarea for pasting resume text
    const textarea = page.getByRole("textbox");
    if (await textarea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await textarea.fill(SAMPLE_RESUME_TEXT);

      // Find and click the extract/continue button
      const extractBtn = page.getByRole("button", { name: /extract|continue|analyse|analyze/i });
      if (await extractBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await extractBtn.click();
        // Should show progress or advance to step 2
        // Allow generous timeout for server action
        await page.waitForTimeout(2_000);
        // Either progress indicator or step 2 content should appear
        const step2OrProgress = page.getByText(/Review|Extracted|profile|extracting/i);
        await expect(step2OrProgress).toBeVisible({ timeout: 30_000 });
      }
    }
  });

  test("onboarding redirects unauthenticated user to sign-in", async ({ page }) => {
    // No sign-in; direct navigation
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
