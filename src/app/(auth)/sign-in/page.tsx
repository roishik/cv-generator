/**
 * Sign-in page.
 *
 * Shows:
 *  - Google OAuth button (when GOOGLE_CLIENT_ID is configured).
 *  - Dev-login buttons (one per seeded demo user) — ONLY when AUTH_DEV_LOGIN=true
 *    AND NODE_ENV !== 'production'. The guard is evaluated server-side at render
 *    time so the buttons are never present in a production build/response.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { SignInButtons } from "./sign-in-buttons";

export const metadata = {
  title: "Sign in — Tailor",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  // If already authenticated, skip the page
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  const { callbackUrl, error } = await searchParams;

  const hasGoogle =
    !!process.env["GOOGLE_CLIENT_ID"] && !!process.env["GOOGLE_CLIENT_SECRET"];

  const devLoginEnabled =
    process.env["NODE_ENV"] !== "production" &&
    process.env["AUTH_DEV_LOGIN"] === "true";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center">
          <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            tailor
          </span>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to start tailoring your CV
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error === "OAuthAccountNotLinked"
              ? "An account with this email already exists with a different provider."
              : "Sign-in failed. Please try again."}
          </div>
        )}

        {/* Sign-in options */}
        <SignInButtons
          hasGoogle={hasGoogle}
          devLoginEnabled={devLoginEnabled}
          callbackUrl={callbackUrl ?? "/dashboard"}
        />

        {/* Footer note */}
        <p className="text-center text-[11px] text-muted-foreground">
          No résumé fabrication. Your data stays yours.
        </p>
      </div>
    </main>
  );
}
