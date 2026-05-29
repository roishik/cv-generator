# Active Context

## Current Focus
M2 complete: Editorial Studio design system implemented — tokens, typography, app shell, styleguide, CV paper wrapper.

## Recent Changes
- [BUILD-START: wf:wf-20260529-m2-design]
- Implemented full Editorial Studio tokens in globals.css (Tailwind v4 @theme)
- Added Fraunces (variable serif) + Inter fonts via next/font/google
- Built authenticated app shell: (app)/layout.tsx, NavRail, TopBar
- Created shared primitives: PageHeader, Section, EmptyState, LoadingSkeletons, CvPaper, PreviewFrame
- Built comprehensive /styleguide page showing all tokens + components
- Fixed dialog.tsx: React.ElementRef → React.ComponentRef
- Updated landing page with Editorial Studio tokens
- pnpm typecheck, lint, build all pass

## Next Steps
1. M3: Render engine — Sidebar.tsx, Clean.tsx, themes, css.ts, render.ts, self-hosted fonts
2. M4: PDF + auto-fit (browser-pool, render-pdf, measure, fit, qa)
3. M5: Database + RLS (docker-compose, Drizzle schema, migrations, RLS policies)

## Decisions
- [BUILD-START: wf:wf-20260529-scaffold01]

## Learnings

## References
- Plan: planning/04-master-plan.md
- Architecture: planning/03-architecture.md
- UX: planning/02-ux-design-spec.md

## Blockers

## Session Settings
AUTO_PROCEED: true

## Last Updated
2026-05-29
