import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Landing page (public).
 *
 * Art direction: "Editorial Studio" — warm paper-white, ink text, spruce accent.
 * No personal data. No stock photos. No purple gradients.
 */
export default function LandingPage() {
  return (
    <main className="paper-grain flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <nav className="flex h-14 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-sm md:px-10">
        <span className="font-serif text-lg font-semibold tracking-tight text-foreground">
          tailor
        </span>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/sign-in">Get started</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center md:px-10">
        <div className="max-w-2xl space-y-6">
          <h1 className="font-serif text-[42px] font-bold leading-[1.1] tracking-tight text-foreground md:text-[56px]">
            One résumé.
            <br />
            Tailored to every role.
          </h1>
          <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Paste a job description. Tailor rewrites from your real experience —
            truthfully — and renders a one-page, designer CV.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild className="min-w-[180px]">
              <Link href="/sign-in">Continue with Google</Link>
            </Button>
            <p className="text-[12px] text-muted-foreground">
              No résumé fabrication.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-secondary px-6 py-14 md:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="mb-8 text-center text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
            How it works
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Upload your resume",
                body: "Drop a PDF or paste text. We build a structured knowledge base from your real experience.",
              },
              {
                step: "02",
                title: "Paste a job description",
                body: "We select and rephrase your most relevant experience — truthfully — for that specific role.",
              },
              {
                step: "03",
                title: "Export a designer CV",
                body: "A one-page PDF in your chosen design, fit-checked and pixel-accurate.",
              },
            ].map(({ step, title, body }) => (
              <Card key={step} className="border-0 bg-card shadow-sm">
                <CardHeader className="pb-2">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {step}
                  </p>
                  <CardTitle className="text-[15px]">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-[13px] leading-5">
                    {body}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-14 md:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-[14px]">Deterministic</CardTitle>
                <CardDescription className="text-[13px]">
                  Parse, render, PDF, auto-fit — pure code. LLM used for
                  exactly 2 reasoning calls.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-[14px]">Truthful</CardTitle>
                <CardDescription className="text-[13px]">
                  The AI selects and rephrases from your knowledge base. It
                  never invents experience.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-[14px]">BYOK</CardTitle>
                <CardDescription className="text-[13px]">
                  Bring your own API key. Anthropic, OpenAI, or Google. Keys
                  AES-256-GCM encrypted.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="font-serif text-sm font-medium text-foreground">
            tailor
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/styleguide"
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Style guide
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
