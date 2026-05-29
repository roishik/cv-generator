import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="max-w-2xl space-y-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-primary">
          Tailor
        </h1>
        <p className="text-xl text-muted-foreground">
          AI-powered CV generator. Design fidelity. One-page guarantee. BYOK.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Button size="lg" asChild>
            <Link href="/sign-in">Get started</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/styleguide">Style guide</Link>
          </Button>
        </div>
      </div>

      <div className="mt-8 grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Deterministic</CardTitle>
            <CardDescription>
              Parse, render, PDF, auto-fit — pure code. LLM used for exactly 2
              reasoning calls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Design + layout + render + PDF + one-page-fit = deterministic
              code. AI only for extraction and tailoring.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Truthful</CardTitle>
            <CardDescription>
              The AI selects and rephrases from your knowledge base. It never
              invents experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Every bullet traces to a real KB entry. Provenance-checked before
              export. No hallucinated metrics.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>BYOK</CardTitle>
            <CardDescription>
              Bring your own API key. Anthropic, OpenAI, or Google. Keys
              AES-256-GCM encrypted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your keys are envelope-encrypted and never logged. Only the last 4
              chars are shown in the UI.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
