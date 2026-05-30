import { requireSession } from "@/lib/auth/guards";
import { NavRail } from "@/components/shell/nav-rail";
import { AppTopBar } from "@/components/shell/app-top-bar";

/**
 * Authenticated app shell layout.
 *
 * Structure:
 *   ┌─ top bar (sticky, full width) ────────────────────────────┐
 *   │                                                            │
 *   ├─ nav rail (240px) ─┬─ page content (flex-1) ─────────────┤
 *   │                    │                                       │
 *   └────────────────────┴───────────────────────────────────────┘
 *
 * `requireSession()` is the primary auth guard for the whole (app) segment:
 * it calls auth() and redirects to /sign-in when there is no valid session.
 * NOTE: a session-token cookie that cannot be decoded (e.g. a stale cookie left
 * over from a previous session-strategy) yields no session here and redirects to
 * /sign-in?callbackUrl=… — re-signing in overwrites the bad cookie and recovers.
 *
 * CV preview pane (when rendered) always uses .cv-paper wrapper.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guard: redirects to /sign-in if not authenticated
  await requireSession();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppTopBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavRail />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto bg-background"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
