import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node.js runtime only — PDF path needs Chromium + fs + crypto (never Edge)
  // Individual routes declare: export const runtime = 'nodejs'
  serverExternalPackages: ["playwright-core", "@playwright/browser-chromium"],
  experimental: {
    // Allows importing server-only modules in Server Components
  },
};

export default nextConfig;
