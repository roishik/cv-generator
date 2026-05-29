"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wand2,
  FileText,
  User,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

// Icon lookup — keeps the icon name in nav-items.ts as a plain string
// so the server-safe module stays JSX-free.
const ICONS = {
  LayoutDashboard,
  Wand2,
  FileText,
  User,
  Settings,
} as const;

type IconName = keyof typeof ICONS;

export function NavRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-card py-4",
        // Transition for future collapsible behaviour
        "transition-all duration-180",
      )}
    >
      {/* Logo mark */}
      <div className="mb-6 px-5">
        <span className="font-serif text-lg font-semibold tracking-tight text-foreground">
          tailor
        </span>
      </div>

      {/* Nav items */}
      <ul className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon as IconName];
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-120",
                  "hover:bg-secondary hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isActive
                    ? "bg-spruce-100 text-spruce-700 dark:bg-[hsl(var(--accent))] dark:text-[hsl(var(--accent-foreground))]"
                    : "text-muted-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors duration-120",
                      isActive
                        ? "text-spruce-600 dark:text-[hsl(var(--accent-foreground))]"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                    aria-hidden
                  />
                )}
                {item.label}
                {/* Active indicator */}
                {isActive && (
                  <span
                    className="ml-auto h-4 w-0.5 rounded-full bg-spruce-600 dark:bg-[hsl(var(--primary))]"
                    aria-hidden
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
