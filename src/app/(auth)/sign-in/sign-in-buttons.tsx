/**
 * Client component: sign-in action buttons.
 *
 * Separated into a client component so we can use the next-auth signIn action
 * (which needs to run in a client context for the form POST flow).
 *
 * The dev-login buttons are ONLY rendered when `devLoginEnabled === true`,
 * which the server page component evaluates. Even if someone crafts a request,
 * the server action `devSignIn` checks `isDevLoginEnabled()` independently.
 */

"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

interface SignInButtonsProps {
  hasGoogle: boolean;
  devLoginEnabled: boolean;
  callbackUrl: string;
}

const DEV_USERS = [
  { id: "00000000-0000-4000-8000-00000000a001", name: "Ada Sample (sidebar)" },
  { id: "00000000-0000-4000-8000-00000000b002", name: "Blake Fixture (clean)" },
] as const;

export function SignInButtons({ hasGoogle, devLoginEnabled, callbackUrl }: SignInButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function handleGoogle() {
    setLoadingId("google");
    startTransition(() => {
      signIn("google", { callbackUrl });
    });
  }

  function handleDevLogin(userId: string) {
    setLoadingId(userId);
    startTransition(() => {
      signIn("dev-login", { userId, callbackUrl });
    });
  }

  return (
    <div className="space-y-4">
      {/* Google */}
      {hasGoogle && (
        <Button
          className="w-full"
          variant="outline"
          onClick={handleGoogle}
          disabled={isPending}
          aria-busy={loadingId === "google" && isPending}
        >
          {loadingId === "google" && isPending ? (
            "Redirecting…"
          ) : (
            <>
              {/* Google "G" wordmark svg (inline, no external dependency) */}
              <svg
                className="mr-2 h-4 w-4"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </>
          )}
        </Button>
      )}

      {/* Dev-login shim */}
      {devLoginEnabled && (
        <div className="space-y-2">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Dev login (local only)
          </p>
          {DEV_USERS.map((u) => (
            <Button
              key={u.id}
              className="w-full"
              variant="secondary"
              onClick={() => handleDevLogin(u.id)}
              disabled={isPending}
              aria-busy={loadingId === u.id && isPending}
            >
              {loadingId === u.id && isPending ? "Signing in…" : u.name}
            </Button>
          ))}
          <p className="text-center text-[10px] text-muted-foreground">
            Run <code className="font-mono">pnpm db:seed</code> to create these users.
          </p>
        </div>
      )}

      {/* If neither Google nor dev-login is available */}
      {!hasGoogle && !devLoginEnabled && (
        <div className="rounded-lg border border-border bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">
          No sign-in method configured.
          <br />
          Set <code className="font-mono text-[11px]">AUTH_DEV_LOGIN=true</code> in <code className="font-mono text-[11px]">.env</code> for local dev.
        </div>
      )}
    </div>
  );
}
