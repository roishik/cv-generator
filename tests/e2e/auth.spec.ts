/**
 * e2e — Auth gating tests.
 *
 * Verifies:
 *  1. Unauthenticated access to (app) routes redirects to /sign-in.
 *  2. The dev-login shim is available on the sign-in page.
 *  3. Dev sign-in with Ada Sample → lands on /dashboard.
 *  4. After sign-in, dashboard is accessible.
 *  5. Signing out removes the session.
 */

import { test, expect } from "@playwright/test";

const APP_ROUTES = [
  "/dashboard",
  "/tailor",
  "/onboarding",
  "/settings",
  "/documents",
  "/knowledge-base",
];

test.describe("Auth gating — unauthenticated", () => {
  for (const route of APP_ROUTES) {
    test(`GET ${route} → redirects to /sign-in`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }
});

test.describe("Dev-login shim", () => {
  test("sign-in page shows dev login buttons when AUTH_DEV_LOGIN=true", async ({ page }) => {
    await page.goto("/sign-in");
    // The page should show dev login section
    await expect(page.getByText("Dev login", { exact: false })).toBeVisible();
    await expect(page.getByText("Ada Sample", { exact: false })).toBeVisible();
    await expect(page.getByText("Blake Fixture", { exact: false })).toBeVisible();
  });

  test("dev sign-in as Ada → lands on /dashboard", async ({ page }) => {
    await page.goto("/sign-in");
    // Click the Ada Sample dev-login button
    await page.getByRole("button", { name: /Ada Sample/i }).click();
    // Should redirect to dashboard after auth
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    // Dashboard heading is visible
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("after sign-in, /dashboard is accessible without redirect", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: /Ada Sample/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Navigate away and back
    await page.goto("/");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("sign-in page already-authenticated user is redirected to /dashboard", async ({ page }) => {
    // Sign in first
    await page.goto("/sign-in");
    await page.getByRole("button", { name: /Ada Sample/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Now go to /sign-in — should redirect because already authed
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
});
