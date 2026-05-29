/**
 * /styleguide — Editorial Studio design system showcase.
 *
 * Demonstrates every token (color swatches with hex, type scale,
 * spacing, radii, shadows, motion) and every shared component.
 * The dark/light toggle is handled by the TopBar or by adding
 * ?dark to the URL via the ThemeToggleDemo below.
 *
 * No personal data anywhere.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { CvPaper, PreviewFrame } from "@/components/ui/cv-paper";
import {
  DocumentCardSkeleton,
  ContentSkeleton,
  PageHeaderSkeleton,
} from "@/components/ui/loading-skeletons";
import { StyleguideThemeToggle } from "./theme-toggle";

export const metadata = {
  title: "Style Guide — Tailor",
  description:
    "Editorial Studio design system: tokens, typography, components.",
};

// ── Color swatch data ──────────────────────────────────────────────────────

const PALETTE = [
  { group: "Paper (neutrals)", tokens: [
    { name: "paper-50", hex: "#FBFAF7", label: "App bg (light)", cls: "bg-[#FBFAF7] border border-paper-200" },
    { name: "paper-100", hex: "#F4F2EC", label: "Surfaces, sidebars", cls: "bg-[#F4F2EC]" },
    { name: "paper-200", hex: "#E9E6DD", label: "Hairline borders", cls: "bg-[#E9E6DD]" },
    { name: "paper-300", hex: "#D8D4C8", label: "Stronger borders", cls: "bg-[#D8D4C8]" },
  ]},
  { group: "Ink (text)", tokens: [
    { name: "ink-900", hex: "#1A1B19", label: "Primary text", cls: "bg-[#1A1B19]" },
    { name: "ink-700", hex: "#3C3E3A", label: "Secondary text", cls: "bg-[#3C3E3A]" },
    { name: "ink-500", hex: "#6B6E67", label: "Muted / captions", cls: "bg-[#6B6E67]" },
    { name: "ink-400", hex: "#8E9189", label: "Placeholder", cls: "bg-[#8E9189]" },
  ]},
  { group: "Spruce (primary accent)", tokens: [
    { name: "spruce-700", hex: "#1F4A3D", label: "Pressed / dark", cls: "bg-[#1F4A3D]" },
    { name: "spruce-600", hex: "#256B53", label: "Buttons, links, focus", cls: "bg-[#256B53]" },
    { name: "spruce-500", hex: "#2E8268", label: "Hover / success", cls: "bg-[#2E8268]" },
    { name: "spruce-100", hex: "#DCEBE4", label: "Tint backgrounds", cls: "bg-[#DCEBE4]" },
  ]},
  { group: "Amber (AI / diff state)", tokens: [
    { name: "amber-600", hex: "#B5740F", label: "AI emphasis", cls: "bg-[#B5740F]" },
    { name: "amber-500", hex: "#D98A1A", label: "AI hover", cls: "bg-[#D98A1A]" },
    { name: "amber-100", hex: "#F8ECD4", label: "AI tint bg", cls: "bg-[#F8ECD4] border border-[#E9E6DD]" },
  ]},
  { group: "Semantic", tokens: [
    { name: "destructive", hex: "#B23B2E", label: "Errors", cls: "bg-[#B23B2E]" },
    { name: "destructive-bg", hex: "#F6E0DC", label: "Error bg", cls: "bg-[#F6E0DC] border border-[#E9E6DD]" },
    { name: "info", hex: "#3C5A78", label: "Info", cls: "bg-[#3C5A78]" },
  ]},
  { group: "Dark mode", tokens: [
    { name: "dark-bg", hex: "#181814", label: "Warm charcoal bg", cls: "bg-[#181814]" },
    { name: "dark-surface-1", hex: "#202019", label: "Cards", cls: "bg-[#202019]" },
    { name: "dark-surface-2", hex: "#2A2A22", label: "Raised / popovers", cls: "bg-[#2A2A22]" },
    { name: "dark-border", hex: "#37372E", label: "Hairlines", cls: "bg-[#37372E]" },
    { name: "spruce-dark", hex: "#4FB492", label: "Accent on dark", cls: "bg-[#4FB492]" },
    { name: "amber-dark", hex: "#E0A341", label: "AI accent on dark", cls: "bg-[#E0A341]" },
  ]},
];

// ── Type scale ─────────────────────────────────────────────────────────────

const TYPE_SCALE = [
  {
    name: "display-xl",
    spec: "48/52 · Fraunces 480",
    use: "Marketing hero",
    cls: "font-serif text-[48px] leading-[52px] font-bold",
    sample: "One résumé.",
  },
  {
    name: "display-lg",
    spec: "36/42 · Fraunces 480",
    use: "Page hero, empty-state title",
    cls: "font-serif text-[36px] leading-[42px] font-bold",
    sample: "Tailor your first CV",
  },
  {
    name: "heading-1",
    spec: "24/30 · Inter 600",
    use: "Screen title",
    cls: "font-sans text-2xl font-semibold leading-[30px]",
    sample: "Documents",
  },
  {
    name: "heading-2",
    spec: "18/26 · Inter 600",
    use: "Section title",
    cls: "font-sans text-[18px] font-semibold leading-[26px]",
    sample: "Recent documents",
  },
  {
    name: "heading-3",
    spec: "15/22 · Inter 600",
    use: "Card title",
    cls: "font-sans text-[15px] font-semibold leading-[22px]",
    sample: "Senior PM — Acme",
  },
  {
    name: "body",
    spec: "14/22 · Inter 400",
    use: "Default body",
    cls: "font-sans text-[14px] leading-[22px]",
    sample: "Product leader with 9 years building 0→1 ML-powered products.",
  },
  {
    name: "body-sm",
    spec: "13/20 · Inter 400",
    use: "Secondary",
    cls: "font-sans text-[13px] leading-[20px]",
    sample: "Last tailored 2 days ago · Type 1",
  },
  {
    name: "label",
    spec: "12/16 · Inter 500, +0.02em",
    use: "Form labels, eyebrows",
    cls: "font-sans text-xs font-medium leading-4 tracking-[0.02em]",
    sample: "JOB DESCRIPTION",
  },
  {
    name: "caption",
    spec: "11/16 · Inter 400",
    use: "Meta, timestamps",
    cls: "font-sans text-[11px] leading-4",
    sample: "Saved 3 seconds ago",
  },
  {
    name: "mono-sm",
    spec: "12/18 · Geist Mono 400",
    use: "Keys, counts",
    cls: "font-mono text-xs leading-[18px]",
    sample: "sk-ant-…7Qm",
  },
];

// ── Spacing ────────────────────────────────────────────────────────────────

const SPACING_SCALE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];

// ── Radii ──────────────────────────────────────────────────────────────────

const RADII = [
  { name: "radius-sm", px: "6px", tw: "rounded-[6px]" },
  { name: "radius-md", px: "10px", tw: "rounded-[10px]", note: "default" },
  { name: "radius-lg", px: "14px", tw: "rounded-[14px]" },
  { name: "radius-full", px: "9999px", tw: "rounded-full" },
];

// ── Shadows ────────────────────────────────────────────────────────────────

const SHADOWS = [
  { name: "shadow-xs", value: "0 1px 2px rgba(26,27,25,0.05)", tw: "shadow-xs" },
  { name: "shadow-sm", value: "0 1px 3px / 0 1px 2px", tw: "shadow-sm" },
  { name: "shadow-md", value: "0 4px 12px / 0 2px 4px", tw: "shadow-md" },
  { name: "shadow-lg", value: "0 12px 32px / 0 4px 8px", tw: "shadow-lg" },
  { name: "shadow-paper", value: "0 2px 8px / 0 16px 40px — CV lightbox", tw: "[box-shadow:0_2px_8px_rgba(26,27,25,0.08),0_16px_40px_rgba(26,27,25,0.10)]" },
];

// ──────────────────────────────────────────────────────────────────────────

export default function StyleGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1024px] space-y-20 px-6 py-12 md:px-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-2 font-serif text-[36px] font-bold leading-tight tracking-tight text-foreground">
              Editorial Studio
            </p>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Design system for Tailor — tokens, typography, components.
              Warm paper-white canvas · Spruce green · Amber AI state.
            </p>
          </div>
          <StyleguideThemeToggle />
        </div>

        {/* ── Color tokens ─────────────────────────────────────────────── */}
        <Section title="Color tokens" description="The full Editorial Studio palette.">
          <div className="space-y-8">
            {PALETTE.map((group) => (
              <div key={group.group}>
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {group.group}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {group.tokens.map((t) => (
                    <div key={t.name} className="space-y-1.5">
                      <div
                        className={`h-12 w-full rounded-md ${t.cls}`}
                        title={t.hex}
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {t.name}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {t.hex}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {t.label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Semantic (shadcn) tokens ─────────────────────────────────── */}
        <Section title="Semantic tokens" description="shadcn/ui CSS variable contract — switches on dark mode.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {[
              { name: "background", cls: "bg-background border border-border" },
              { name: "foreground", cls: "bg-foreground" },
              { name: "primary", cls: "bg-primary" },
              { name: "primary-fg", cls: "bg-primary-foreground border border-border" },
              { name: "secondary", cls: "bg-secondary" },
              { name: "muted", cls: "bg-muted" },
              { name: "muted-fg", cls: "bg-muted-foreground" },
              { name: "accent", cls: "bg-accent border border-border" },
              { name: "accent-fg", cls: "bg-accent-foreground" },
              { name: "destructive", cls: "bg-destructive" },
              { name: "border", cls: "bg-border" },
              { name: "card", cls: "bg-card border border-border" },
              { name: "ai", cls: "bg-ai" },
              { name: "ai-bg", cls: "bg-ai-bg border border-border" },
            ].map(({ name, cls }) => (
              <div key={name} className="space-y-1">
                <div className={`h-10 w-full rounded-md ${cls}`} />
                <p className="text-[11px] text-muted-foreground">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Typography ───────────────────────────────────────────────── */}
        <Section
          title="Type scale"
          description="Inter (UI) + Fraunces (display) + system mono. Distinct from CV output fonts."
        >
          <div className="space-y-6 divide-y divide-border">
            {TYPE_SCALE.map((t) => (
              <div
                key={t.name}
                className="flex flex-col gap-1 pt-6 first:pt-0 sm:flex-row sm:items-baseline sm:gap-8"
              >
                <div className="w-32 shrink-0">
                  <p className="text-[11px] font-medium text-foreground">
                    {t.name}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {t.spec}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {t.use}
                  </p>
                </div>
                <p className={`min-w-0 flex-1 text-foreground ${t.cls}`}>
                  {t.sample}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Spacing ──────────────────────────────────────────────────── */}
        <Section
          title="Spacing scale"
          description="4px base. Page gutters: 24 (mobile) / 32 (tablet) / 48 (desktop). Card padding: 20–24."
        >
          <div className="flex flex-wrap items-end gap-4">
            {SPACING_SCALE.map((step) => (
              <div key={step} className="flex flex-col items-center gap-1">
                <div
                  className="bg-spruce-600 dark:bg-primary rounded-sm"
                  style={{ width: step * 4, height: step * 4 }}
                />
                <p className="text-[10px] font-mono text-muted-foreground">
                  {step}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {step * 4}px
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Radius ───────────────────────────────────────────────────── */}
        <Section
          title="Border radius"
          description="Restrained — premium is not super-round. radius-md (10px) is the default."
        >
          <div className="flex flex-wrap gap-6">
            {RADII.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div
                  className={`h-16 w-16 border-2 border-border bg-secondary ${r.tw}`}
                />
                <div className="text-center">
                  <p className="text-[11px] font-medium text-foreground">
                    {r.name}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {r.px}
                  </p>
                  {r.note && (
                    <p className="text-[10px] text-muted-foreground">{r.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Shadows ──────────────────────────────────────────────────── */}
        <Section
          title="Shadows"
          description="Soft, neutral, layered — paper not plastic. Warm rgba tint (ink-900 base)."
        >
          <div className="flex flex-wrap gap-8">
            {SHADOWS.map((s) => (
              <div key={s.name} className="flex flex-col items-center gap-3">
                <div
                  className={`h-20 w-24 rounded-[10px] bg-card ${s.tw}`}
                />
                <div className="max-w-[96px] text-center">
                  <p className="text-[11px] font-medium text-foreground">
                    {s.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {s.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Motion ───────────────────────────────────────────────────── */}
        <Section
          title="Motion principles"
          description="ease-out for entrances, ease-in-out for moves. No bounce/spring on UI chrome."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { name: "fast", dur: "120ms", use: "Hover, press scale", cls: "duration-[120ms]" },
              { name: "base", dur: "180ms", use: "Fade, slide transitions", cls: "duration-[180ms]" },
              { name: "slow", dur: "240ms", use: "Diff highlight settle", cls: "duration-[240ms]" },
            ].map((m) => (
              <Card key={m.name} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[14px]">{m.name} — {m.dur}</CardTitle>
                  <CardDescription className="text-[12px]">{m.use}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={`h-2 w-full rounded-full bg-spruce-100 dark:bg-[hsl(var(--accent))] overflow-hidden`}
                  >
                    <div
                      className={`h-full bg-spruce-600 dark:bg-primary rounded-full transition-all ease-out ${m.cls} w-[70%]`}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    cubic-bezier(0.16, 1, 0.3, 1) · prefers-reduced-motion: off
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-dashed border-border bg-secondary p-4">
            <p className="text-[12px] text-muted-foreground">
              <strong className="text-foreground">prefers-reduced-motion:</strong>{" "}
              all transitions and animations are reduced to instant + opacity-only fades.
              Press-scale: 0.985, never &lt; 0.97.
            </p>
          </div>
        </Section>

        {/* ── Buttons ──────────────────────────────────────────────────── */}
        <Section title="Buttons" description="Primary = solid spruce. Press scale 0.985, 120ms.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">Destructive</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="icon only">✦</Button>
            </div>
          </div>
        </Section>

        {/* ── Inputs ───────────────────────────────────────────────────── */}
        <Section title="Inputs">
          <div className="max-w-sm space-y-3">
            <Input placeholder="Default input" />
            <Input placeholder="Disabled input" disabled />
            <Input type="email" placeholder="email@example.com" />
          </div>
        </Section>

        {/* ── Cards ────────────────────────────────────────────────────── */}
        <Section title="Cards" description="Pure white floating on paper bg. shadow-sm.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Supporting description.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Card content. Cards float on the paper background with hairline borders.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Action</Button>
              </CardFooter>
            </Card>

            <Card className="border-spruce-100 bg-spruce-100 dark:border-[hsl(var(--accent))] dark:bg-[hsl(var(--accent)/0.3)]">
              <CardHeader>
                <CardTitle className="text-[13px] font-medium uppercase tracking-[0.06em]">
                  Accent tint card
                </CardTitle>
                <CardDescription>spruce-100 background — used for active/selected states.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Used for active selections, success states, feature highlights.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ── Skeleton ─────────────────────────────────────────────────── */}
        <Section
          title="Skeletons"
          description="Skeletons, not spinners. Shaped to the final layout, shimmer ≤ 180ms."
        >
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Generic rows
              </p>
              <ContentSkeleton rows={5} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Page header
              </p>
              <PageHeaderSkeleton />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Document card
              </p>
              <DocumentCardSkeleton className="max-w-[220px]" />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Pulse skeleton
              </p>
              <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-32 w-full rounded-[10px]" />
              </div>
            </div>
          </div>
        </Section>

        {/* ── PageHeader ───────────────────────────────────────────────── */}
        <Section title="PageHeader" description="Screen-level headings. heading-1 (24/30 Inter 600).">
          <div className="space-y-6 divide-y divide-border">
            <PageHeader
              heading="Documents"
              subheading="Your tailored CVs and version history."
              actions={<Button size="sm">+ Tailor a CV</Button>}
            />
            <div className="pt-6">
              <PageHeader
                eyebrow="Settings"
                heading="API keys"
                subheading="Connect your AI provider to start tailoring."
              />
            </div>
          </div>
        </Section>

        {/* ── EmptyState ───────────────────────────────────────────────── */}
        <Section
          title="EmptyState"
          description="Fraunces headline + description + one action. Never clip-art."
        >
          <div className="space-y-4">
            <EmptyState
              heading="No documents yet"
              description="Upload a resume and we'll build your profile."
              action={<Button>Upload resume</Button>}
            />
            <EmptyState
              heading="Tailor your first CV"
              description="Paste a job description to get a tailored, one-page CV from your profile."
              action={<Button>Start tailoring</Button>}
            />
          </div>
        </Section>

        {/* ── Diff states ──────────────────────────────────────────────── */}
        <Section
          title="Diff highlight states"
          description="Amber underline = added/rewritten. Strike = removed. Color never alone — paired with underline/icon."
        >
          <div className="space-y-3 rounded-lg border border-border bg-card p-5 font-mono text-[13px] leading-6">
            <p>
              Led the{" "}
              <span className="diff-added">
                0→1 launch of an LLM developer platform, growing to 40,000 MAU
              </span>{" "}
              in 14 months.
            </p>
            <p>
              <span className="diff-removed">
                Managed product roadmap for the analytics suite.
              </span>
            </p>
            <p>
              Defined the API roadmap;{" "}
              <span className="diff-added">
                cut time-to-first-call from 30 min to under 5.
              </span>
            </p>
          </div>
          <div className="mt-3 flex gap-4 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-sm bg-[#F8ECD4] underline decoration-[#B5740F]" />
              <span className="text-muted-foreground">Added / rewritten</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-4 rounded-sm bg-[#F6E0DC]" />
              <span className="text-muted-foreground">Removed</span>
            </span>
          </div>
        </Section>

        {/* ── CV Paper convention ──────────────────────────────────────── */}
        <Section
          title=".cv-paper wrapper"
          description="The CV preview surface is ALWAYS white paper regardless of app theme. Dark mode: lightbox framing, white paper inside."
        >
          <PreviewFrame className="max-w-lg">
            <CvPaper className="px-8 py-6">
              <div className="space-y-3">
                <div className="border-b-2 border-[#323B4C] pb-2">
                  <p className="font-['Lato',sans-serif] text-[22px] font-black uppercase tracking-[0.01em] text-[#323B4C]">
                    Dana Whitfield
                  </p>
                  <p className="font-['Lato',sans-serif] text-[11px] uppercase tracking-[0.2em] text-[#323B4C]">
                    Senior Product Manager · AI Platforms
                  </p>
                </div>
                <p className="font-['Lato',sans-serif] text-[11px] leading-[1.65] text-[#737373]">
                  Product leader with 9 years building 0→1 ML-powered products.
                  Shipped a developer platform to 40k MAU.
                </p>
                <p className="text-[10px] text-[#999] italic">
                  ↑ Always white (#ffffff), always light-scheme. Never dark.
                </p>
              </div>
            </CvPaper>
          </PreviewFrame>
        </Section>

        {/* ── App shell preview ────────────────────────────────────────── */}
        <Section
          title="App shell"
          description="Nav rail (240px) + top bar (48px) + content area. Nav rail is collapsible in future iterations."
        >
          <div className="overflow-hidden rounded-[10px] border border-border">
            {/* Mini top bar */}
            <div className="flex h-10 items-center gap-4 border-b border-border bg-card px-3">
              <span className="font-serif text-sm font-semibold text-foreground">tailor</span>
              <span className="flex-1 text-xs text-muted-foreground">Dashboard</span>
              <div className="flex items-center gap-1.5">
                <div className="h-5 rounded border border-border bg-secondary px-1.5 text-[9px] text-muted-foreground flex items-center">⌘K</div>
                <div className="h-6 w-6 rounded-full bg-spruce-100 dark:bg-[hsl(var(--accent))] text-[9px] font-semibold text-spruce-700 dark:text-[hsl(var(--accent-foreground))] flex items-center justify-center">?</div>
              </div>
            </div>
            {/* Body */}
            <div className="flex h-48">
              {/* Nav rail */}
              <div className="flex w-[180px] shrink-0 flex-col border-r border-border bg-card py-3">
                {[
                  { label: "Home", active: true },
                  { label: "Tailor", active: false },
                  { label: "Documents", active: false },
                  { label: "Profile", active: false },
                  { label: "Settings", active: false },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between px-3 py-1.5 text-[11px] font-medium ${
                      item.active
                        ? "bg-spruce-100 text-spruce-700 dark:bg-[hsl(var(--accent))] dark:text-[hsl(var(--accent-foreground))]"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                    {item.active && (
                      <span className="h-3 w-0.5 rounded-full bg-spruce-600 dark:bg-primary" />
                    )}
                  </div>
                ))}
              </div>
              {/* Content */}
              <div className="flex-1 bg-background p-4">
                <div className="mb-3 h-5 w-24 rounded bg-muted" />
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Toast / sonner ───────────────────────────────────────────── */}
        <Section
          title="Toast (sonner)"
          description="Bottom-right, compact, ink-on-paper. Success uses spruce check. Auto-dismiss 4s."
        >
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 shadow-md">
              <span className="h-2 w-2 rounded-full bg-spruce-600" />
              <span className="text-[13px] font-medium text-foreground">Tailored and fit to one page.</span>
            </div>
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 shadow-md">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-[13px] font-medium text-foreground">Connection failed. Try again.</span>
              <button className="ml-2 text-[11px] text-muted-foreground underline">Retry</button>
            </div>
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 shadow-md">
              <span className="h-2 w-2 rounded-full bg-ai" />
              <span className="text-[13px] font-medium text-foreground">Bullet removed.</span>
              <button className="ml-2 text-[11px] font-medium text-primary underline">Undo</button>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
