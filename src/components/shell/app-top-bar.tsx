/**
 * AppTopBar — server component wrapper around TopBar.
 *
 * Reads the Auth.js session server-side, extracts user initials,
 * and passes them to the TopBar (client component) for rendering
 * the user avatar and sign-out button.
 */

import { auth } from "@/lib/auth/config";
import { TopBar } from "./top-bar";

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "??";
}

export async function AppTopBar() {
  const session = await auth();
  const user = session?.user;
  const initials = getInitials(user?.name, user?.email);

  return (
    <TopBar
      userInitials={initials}
      userName={user?.name ?? user?.email ?? undefined}
    />
  );
}
