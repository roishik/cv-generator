import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Landing page (public).
 *
 * Art direction: "Editorial Studio" — warm paper-white, ink text, spruce accent.
 * Design: hero + how-it-works + two designs + BYOK feature + footer.
 * No personal data. No stock photos. No purple gradients. No sparkles.
 */
export default function LandingPage() {
  return (
    <main className="paper-grain flex min-h-screen flex-col bg-background">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-sm md:px-10">
        <span className="font-serif text-lg font-semibold tracking-tight text-foreground">
          tailor
        </span>
        <nav aria-label="Site navigation" className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/sign-in">Get started</Link>
          </Button>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-24 text-center md:py-32"
        aria-labelledby="hero-heading"
      >
        {/* Subtle background gradient: warm white → paper */}
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, hsl(159 47% 28% / 0.06), transparent)",
          }}
          aria-hidden
        />

        <div className="mx-auto max-w-2xl space-y-7">
          {/* Eyebrow */}
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            One-page. Designer. Truthful.
          </p>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="font-serif text-[44px] font-semibold leading-[1.08] tracking-tight text-foreground md:text-[60px]"
          >
            One résumé.
            <br />
            <span className="text-spruce-600 dark:text-primary">
              Tailored to every role.
            </span>
          </h1>

          {/* Sub-copy */}
          <p className="mx-auto max-w-[480px] text-[16px] leading-relaxed text-muted-foreground">
            Paste a job description. Tailor rewrites from your real experience —
            truthfully — and renders a one-page, designer CV in seconds.
          </p>

          {/* CTA cluster */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild className="min-w-[200px] text-[15px]">
              <Link href="/sign-in">Continue with Google</Link>
            </Button>
            <p className="text-[12px] text-muted-foreground">
              No résumé fabrication. Bring your own AI key.
            </p>
          </div>
        </div>

        {/* Hero visual: CV card mock */}
        <div
          className="mx-auto mt-16 w-full max-w-sm"
          aria-label="Example CV preview"
          aria-hidden
        >
          <HeroCvMock />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section
        className="border-t border-border bg-secondary px-6 py-16 md:px-10"
        aria-labelledby="how-heading"
      >
        <div className="mx-auto max-w-3xl">
          <p
            id="how-heading"
            className="mb-10 text-center font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
          >
            How it works
          </p>
          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3" aria-label="Process steps">
            {[
              {
                n: "01",
                title: "Upload your resume",
                body: "Drop a PDF or paste text. We build a structured knowledge base from your real experience — once.",
              },
              {
                n: "02",
                title: "Paste a job description",
                body: "We select and rephrase your most relevant experience — truthfully — for that specific role. One AI call.",
              },
              {
                n: "03",
                title: "Export a designer CV",
                body: "A one-page PDF in your chosen design. Pixel-accurate A4. Fit-checked before export.",
              },
            ].map(({ n, title, body }) => (
              <li
                key={n}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-xs"
              >
                <span className="font-mono text-[11px] font-medium text-muted-foreground">
                  {n}
                </span>
                <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
                <p className="text-[13px] leading-5 text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Two designs ──────────────────────────────────────────── */}
      <section
        className="px-6 py-16 md:px-10"
        aria-labelledby="designs-heading"
      >
        <div className="mx-auto max-w-3xl">
          <p
            id="designs-heading"
            className="mb-3 text-center font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
          >
            Two designs
          </p>
          <h2 className="mb-8 text-center font-serif text-[28px] font-semibold text-foreground">
            Curated for different contexts
          </h2>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[
              {
                type: "Type 1",
                name: "Sidebar",
                tag: "Tech · Startups · Product · AI/ML",
                desc: "Navy sidebar with a clean timeline — the default, optimized for technical roles.",
                accent: "#323B4C",
                isSidebar: true,
              },
              {
                type: "Type 2",
                name: "Clean",
                tag: "Consulting · Finance · Conservative",
                desc: "Pure single-column McKinsey style — no color blocks, maximum information density.",
                accent: "#111111",
                isSidebar: false,
              },
            ].map(({ type, name, tag, desc, isSidebar }) => (
              <div
                key={type}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
                aria-label={`${type}: ${name} design`}
              >
                <div className="relative aspect-[3/2] overflow-hidden bg-secondary">
                  <DesignPreview isSidebar={isSidebar} />
                </div>
                <div className="p-5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[13px] font-semibold text-foreground">{name}</p>
                    <span className="font-mono text-[10px] text-muted-foreground">{type}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-spruce-600">{tag}</p>
                  <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section
        className="border-t border-border bg-secondary px-6 py-16 md:px-10"
        aria-labelledby="features-heading"
      >
        <div className="mx-auto max-w-3xl">
          <p
            id="features-heading"
            className="mb-10 text-center font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
          >
            Why Tailor
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                title: "Truthful by design",
                body: "The AI selects and rephrases from your knowledge base only. It cannot invent experience, employers, or metrics. An honesty report flags every gap.",
              },
              {
                title: "One-page guarantee",
                body: "A deterministic auto-fit loop tightens spacing and line-heights before suggesting content cuts. You always see a gauge. Export is gated on fit.",
              },
              {
                title: "Bring your own key",
                body: "Your Anthropic, OpenAI, or Google key. Keys encrypted at rest with AES-256-GCM, never logged, never sent to us in plaintext.",
              },
            ].map(({ title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-5 shadow-xs"
              >
                <h3 className="mb-2 text-[14px] font-semibold text-foreground">{title}</h3>
                <p className="text-[13px] leading-5 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="px-6 py-20 text-center md:px-10">
        <div className="mx-auto max-w-lg space-y-5">
          <h2 className="font-serif text-[32px] font-semibold leading-tight text-foreground">
            Ready to stand out?
          </h2>
          <p className="text-[14px] text-muted-foreground">
            Set up your profile once. Tailor for every role in under a minute.
          </p>
          <Button size="lg" asChild className="min-w-[200px]">
            <Link href="/sign-in">Get started — it&apos;s free</Link>
          </Button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="font-serif text-sm font-medium text-foreground">tailor</span>
          <nav
            aria-label="Footer links"
            className="flex items-center gap-4"
          >
            <Link
              href="/sign-in"
              className="text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign in
            </Link>
            <Link
              href="/styleguide"
              className="text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Style guide
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual fragments (no real data — layout-only)
// ─────────────────────────────────────────────────────────────────────────────

/** Hero CV card mock — shows a diff-highlight animation hint */
function HeroCvMock() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border shadow-paper"
      style={{ background: "#fff" }}
    >
      {/* Sidebar template preview */}
      <div className="flex" style={{ minHeight: 260 }}>
        {/* Left sidebar */}
        <div
          className="flex w-[28%] flex-col items-center gap-3 px-3 py-6"
          style={{ background: "#323B4C" }}
        >
          <div className="h-12 w-12 rounded-full bg-white/20" />
          <div className="w-full space-y-1.5">
            {[65, 80, 55, 70].map((w, i) => (
              <div
                key={i}
                className="h-1 rounded-full bg-white/20"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 px-4 py-5 space-y-3">
          {/* Name */}
          <div className="space-y-1">
            <div className="h-2.5 w-3/4 rounded bg-[#323B4C]/25" />
            <div className="h-1.5 w-2/5 rounded bg-[#323B4C]/12" />
          </div>

          {/* Summary — with simulated diff highlight */}
          <div className="space-y-1 mt-1">
            {[
              { w: 90, highlight: false },
              { w: 75, highlight: true },
              { w: 85, highlight: false },
            ].map(({ w, highlight }, i) => (
              <div
                key={i}
                className={`h-1 rounded transition-colors duration-500 ${
                  highlight ? "bg-amber-500/50" : "bg-gray-200"
                }`}
                style={{ width: `${w}%` }}
              />
            ))}
          </div>

          {/* Experience block */}
          <div className="space-y-2 mt-2">
            <div className="h-1.5 w-1/3 rounded bg-[#323B4C]/20" />
            {[80, 70, 75, 65].map((w, i) => (
              <div key={i} className="h-1 rounded bg-gray-200" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between border-t border-border bg-secondary px-4 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          Fit: 94% · one page ✓
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-spruce-100 px-2 py-0.5 font-mono text-[9px] font-medium text-spruce-700">
          tailored
        </span>
      </div>
    </div>
  );
}

/** Mini CV layout preview for the Two Designs section */
function DesignPreview({ isSidebar }: { isSidebar: boolean }) {
  if (isSidebar) {
    return (
      <div className="flex h-full w-full" style={{ minHeight: 160 }}>
        <div
          className="flex w-[28%] flex-col items-center gap-2 px-2 py-4"
          style={{ background: "#323B4C" }}
        >
          <div className="h-8 w-8 rounded-full bg-white/20" />
          {[65, 50, 70, 45].map((w, i) => (
            <div key={i} className="h-1 rounded-full bg-white/20" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex-1 bg-white px-3 py-4 space-y-1.5">
          <div className="h-2 w-3/4 rounded bg-gray-300/60" />
          <div className="h-1.5 w-1/2 rounded bg-gray-200" />
          <div className="mt-2 space-y-1">
            {[80, 65, 75, 60, 70].map((w, i) => (
              <div key={i} className="h-1 rounded bg-gray-200" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-white px-4 py-4 space-y-2" style={{ minHeight: 160 }}>
      <div className="text-center space-y-1 mb-3">
        <div className="h-2.5 w-1/2 mx-auto rounded bg-gray-900/25" />
        <div className="h-1.5 w-1/3 mx-auto rounded bg-gray-400/30" />
        <div className="h-1 w-2/3 mx-auto rounded bg-gray-200" />
      </div>
      {[100, 85, 90, 75, 80, 70, 85].map((w, i) => (
        <div key={i} className="h-1 rounded bg-gray-200" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
