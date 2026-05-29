/**
 * Navigation items for the authenticated app shell.
 * Kept in a plain module (no JSX) so it can be imported by both
 * the nav-rail (sidebar) and any mobile tab-bar without pulling in
 * React/client overhead in the layout server component.
 */
export type NavItem = {
  label: string;
  href: string;
  /** Lucide icon name — resolved by the consuming component */
  icon: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Tailor", href: "/tailor", icon: "Wand2" },
  { label: "Documents", href: "/documents", icon: "FileText" },
  { label: "Profile", href: "/knowledge-base", icon: "User" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];
