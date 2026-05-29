import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders the Tailor heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tailor" })).toBeVisible();
  });

  test("has a Get started link", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: "Get started" });
    await expect(link).toBeVisible();
  });

  test("has a Style guide link that navigates to /styleguide", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Style guide" }).click();
    await expect(page).toHaveURL(/\/styleguide/);
  });

  test("styleguide page renders", async ({ page }) => {
    await page.goto("/styleguide");
    await expect(
      page.getByRole("heading", { name: "Style Guide" }),
    ).toBeVisible();
  });
});
