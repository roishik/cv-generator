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
 * `requireSession()` redirects to /sign-in if the user is not authenticated.
 * The middleware handles most redirects; the layout is a secondary guard for
 * RSC renders that bypass the middleware matcher (e.g. parallel route segments).
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
