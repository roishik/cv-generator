import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * Editorial Studio typefaces
 *
 * - Inter      → UI / body / controls (neutral, legible at small sizes)
 * - Fraunces   → Display / brand / large headings (variable serif, warm, premium)
 * - Mono       → ui-monospace / system stack (API keys, counts, shortcuts — used rarely)
 *
 * These are the APP fonts — distinct from the CV output fonts (Lato / Source Sans 3).
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  // Fraunces is a variable font.
  // Must use weight: 'variable' when specifying axes.
  weight: "variable",
  style: ["normal", "italic"],
  // SOFT axis = soft/optical setting for the editorial warm look
  axes: ["SOFT"],
});

export const metadata: Metadata = {
  title: "Tailor — AI-powered CV generator",
  description:
    "Tailor your CV for every job with AI. Design fidelity, one-page guarantee, BYOK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex min-h-full flex-col bg-background text-foreground"
        // Browser extensions (Grammarly, etc.) inject attributes like
        // data-gr-ext-installed onto <body> before React hydrates, causing a
        // harmless attribute-mismatch warning. Suppress it on <body> too
        // (the flag only covers the element it's set on, not descendants).
        suppressHydrationWarning
      >
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
