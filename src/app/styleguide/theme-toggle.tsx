"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Simple light/dark toggle for the styleguide page.
 * Toggles the .dark class on <html> so shadcn dark-mode CSS vars activate.
 */
export function StyleguideThemeToggle() {
  const [dark, setDark] = useState(false);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className="shrink-0 gap-2"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}
