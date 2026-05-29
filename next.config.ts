import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node.js runtime only — PDF path needs Chromium + fs + crypto (never Edge)
  // Individual routes declare: export const runtime = 'nodejs'
  // pdf-parse and pdfjs-dist use a web-worker that Next.js/Turbopack can't bundle
  // for SSR; mark them as external so they're required() at runtime instead.
  serverExternalPackages: [
    "playwright-core",
    "@playwright/browser-chromium",
    "pdf-parse",
    "pdfjs-dist",
  ],
  experimental: {
    // Allows importing server-only modules in Server Components
  },
};

export default nextConfig;
