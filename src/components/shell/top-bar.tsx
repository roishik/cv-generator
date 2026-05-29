"use client";

import { Moon, Sun, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * TopBar — authenticated app top bar.
 *
 * Contains: breadcrumb slot, ⌘K trigger, theme toggle, avatar/menu.
 *
 * Theme toggle is local state for now (no provider wired yet).
 * The breadcrumb is a render slot so each page can supply its own.
 */

interface TopBarProps {
  /** Optional breadcrumb content rendered in the center of the bar */
  breadcrumb?: React.ReactNode;
}

export function TopBar({ breadcrumb }: TopBarProps) {
  const [darkMode, setDarkMode] = useState(false);

  const toggleDark = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-4 border-b border-border bg-card px-4",
        "sticky top-0 z-40",
      )}
    >
      {/* Left — logo (mobile) / breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
        {breadcrumb ?? (
          <span className="truncate font-medium text-foreground">tailor</span>
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1">
        {/* ⌘K trigger */}
        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 text-xs text-muted-foreground md:flex"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] leading-none">
            ⌘K
          </kbd>
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDark}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          className="h-8 w-8"
        >
          {darkMode ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </Button>

        {/* Avatar placeholder — wired to auth in M6 */}
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            "bg-spruce-100 text-xs font-semibold text-spruce-700",
            "dark:bg-[hsl(var(--accent))] dark:text-[hsl(var(--accent-foreground))]",
            "transition-colors duration-120 hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          )}
          aria-label="Account menu"
        >
          {/* Monogram placeholder — replaced with real user initials in M6 */}
          <span aria-hidden>?</span>
        </button>
      </div>
    </header>
  );
}
