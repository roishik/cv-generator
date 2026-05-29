import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders the main hero heading", async ({ page }) => {
    await page.goto("/");
    // The hero h1 says "One résumé." + "Tailored to every role."
    await expect(
      page.getByRole("heading").filter({ hasText: /résumé|Tailored|tailor/i }).first(),
    ).toBeVisible();
  });

  test("has a Get started link (in nav or CTA)", async ({ page }) => {
    await page.goto("/");
    // The nav and footer CTA both contain "Get started"
    const link = page.getByRole("link", { name: /Get started/i }).first();
    await expect(link).toBeVisible();
  });

  test("has a Style guide link that navigates to /styleguide", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Style guide" }).click();
    await expect(page).toHaveURL(/\/styleguide/);
  });

  test("styleguide page renders with design system content", async ({ page }) => {
    await page.goto("/styleguide");
    // The styleguide page has "Editorial Studio" as its main section heading
    await expect(
      page.getByText(/Editorial Studio|Style Guide|design system/i).first(),
    ).toBeVisible();
  });

  test("health endpoint reports ok with db + browser true", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean; db: boolean; browser: boolean };
    expect(body.db).toBe(true);
    expect(body.browser).toBe(true);
    expect(body.ok).toBe(true);
  });
});
