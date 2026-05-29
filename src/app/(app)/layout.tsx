import { NavRail } from "@/components/shell/nav-rail";
import { TopBar } from "@/components/shell/top-bar";

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
 * Auth guard is a stub here — wired in M6 with requireSession().
 * CV preview pane (when rendered) always uses .cv-paper wrapper.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
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
