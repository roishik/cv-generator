import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import "./globals.css";

/**
 * Editorial Studio typefaces
 *
 * - Source Sans 3 → UI / body / controls (bundled locally; no build-time fetch)
 * - Georgia       → Display fallback until a local Fraunces file is added
 * - Mono       → ui-monospace / system stack (API keys, counts, shortcuts — used rarely)
 *
 * These are the APP fonts — distinct from the CV output fonts (Lato / Source Sans 3).
 */
const sourceSans = localFont({
  src: "../../public/fonts/SourceSans3-Variable.woff2",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tailor — AI-powered CV generator",
  description: "Tailor your CV for every job with AI. Design fidelity, one-page guarantee, BYOK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="bg-background text-foreground flex min-h-full flex-col"
        // Browser extensions (Grammarly, etc.) inject attributes like
        // data-gr-ext-installed onto <body> before React hydrates, causing a
        // harmless attribute-mismatch warning. Suppress it on <body> too
        // (the flag only covers the element it's set on, not descendants).
        suppressHydrationWarning
      >
        {children}
        <Toaster position="bottom-right" />
        <GoogleAnalytics measurementId={process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"]} />
      </body>
    </html>
  );
}
