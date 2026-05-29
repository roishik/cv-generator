/**
 * UserMenu — avatar + sign-out button.
 *
 * Server component that reads the current session and passes the user's
 * initials to the client button. Sign-out is a server action so it works
 * without JS as a progressive enhancement.
 */

"use client";

import { useTransition } from "react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  initials: string;
  name?: string;
}

export function UserMenu({ initials, name }: UserMenuProps) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(() => {
      signOut({ callbackUrl: "/sign-in" });
    });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      title={isPending ? "Signing out…" : `Signed in as ${name ?? initials} — click to sign out`}
      aria-label={isPending ? "Signing out" : "Sign out"}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full",
        "bg-spruce-100 text-xs font-semibold text-spruce-700",
        "dark:bg-[hsl(var(--accent))] dark:text-[hsl(var(--accent-foreground))]",
        "transition-opacity duration-120 hover:opacity-80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        isPending && "opacity-50",
      )}
    >
      <span aria-hidden>{isPending ? "…" : initials}</span>
    </button>
  );
}
