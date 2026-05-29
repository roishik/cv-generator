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

export const metadata = {
  title: "Style Guide — Tailor",
  description: "Component library and design tokens for the Tailor app",
};

export default function StyleGuidePage() {
  return (
    <main className="mx-auto max-w-4xl space-y-16 p-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Style Guide</h1>
        <p className="mt-2 text-muted-foreground">
          Editorial Studio — design tokens and UI components for Tailor.
        </p>
      </div>

      {/* Typography */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">
          Typography
        </h2>
        <div className="space-y-2">
          <h1 className="text-5xl font-bold">Heading 1 — 5xl bold</h1>
          <h2 className="text-4xl font-bold">Heading 2 — 4xl bold</h2>
          <h3 className="text-3xl font-semibold">Heading 3 — 3xl semibold</h3>
          <h4 className="text-2xl font-semibold">Heading 4 — 2xl semibold</h4>
          <h5 className="text-xl font-medium">Heading 5 — xl medium</h5>
          <p className="text-base">Body — base (16px)</p>
          <p className="text-sm text-muted-foreground">
            Small muted — sm muted-foreground
          </p>
          <p className="text-xs">Extra small — xs</p>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">
          Buttons
        </h2>
        <div className="flex flex-wrap gap-3 items-center">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      {/* Inputs */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">
          Inputs
        </h2>
        <div className="max-w-sm space-y-3">
          <Input placeholder="Default input" />
          <Input placeholder="Disabled input" disabled />
          <Input type="email" placeholder="Email input" />
        </div>
      </section>

      {/* Cards */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">
          Cards
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Card description goes here.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Card content with some example text.</p>
            </CardContent>
            <CardFooter>
              <Button size="sm">Action</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feature card</CardTitle>
              <CardDescription>
                Used for feature highlights on the landing page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Muted content example inside a card.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Skeletons */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">
          Skeletons
        </h2>
        <div className="max-w-sm space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </section>

      {/* Color tokens */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight border-b pb-2">
          Color Tokens
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { name: "background", cls: "bg-background border" },
            { name: "foreground", cls: "bg-foreground" },
            { name: "primary", cls: "bg-primary" },
            { name: "primary-fg", cls: "bg-primary-foreground border" },
            { name: "secondary", cls: "bg-secondary" },
            { name: "muted", cls: "bg-muted" },
            { name: "accent", cls: "bg-accent" },
            { name: "destructive", cls: "bg-destructive" },
            { name: "border", cls: "bg-border" },
            { name: "card", cls: "bg-card border" },
          ].map(({ name, cls }) => (
            <div key={name} className="space-y-1">
              <div className={`h-12 rounded-md ${cls}`} />
              <p className="text-xs text-muted-foreground">{name}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
