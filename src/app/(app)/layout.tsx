import { requireSession } from "@/lib/auth/guards";
import { NavRail } from "@/components/shell/nav-rail";
import { AppTopBar } from "@/components/shell/app-top-bar";
import { AppAnalytics } from "@/components/analytics/app-analytics";
import { auth } from "@/lib/auth/config";
import { isAdminEmail } from "@/lib/admin/admin-emails";

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
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Guard: redirects to /sign-in if not authenticated
  await requireSession();
  const session = await auth();
  const showAdmin = isAdminEmail(session?.user?.email);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppAnalytics />
      <AppTopBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavRail showAdmin={showAdmin} />
        <main id="main-content" className="bg-background flex-1 overflow-y-auto" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
