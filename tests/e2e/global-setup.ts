/**
 * Playwright global setup.
 *
 * Ensures:
 *   1. Docker Postgres is up and healthy.
 *   2. Migrations and seed are applied.
 *   3. The Next.js dev server is NOT started here — that's handled by playwright.config.ts
 *      webServer config using TEST_PORT.
 *
 * Run order: global-setup → webServer starts → tests → global-teardown.
 */

import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function run(cmd: string): void {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", env: { ...process.env } });
}

async function waitForPostgres(maxMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      execSync(
        `docker compose exec -T db pg_isready -U postgres -d cvgen`,
        { cwd: ROOT, stdio: "pipe" },
      );
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  throw new Error("Postgres did not become healthy within 60 s");
}

export default async function globalSetup() {
  console.log("[e2e global-setup] Starting Postgres …");
  run("docker compose up -d db");
  await waitForPostgres();

  console.log("[e2e global-setup] Running migrations …");
  run("pnpm db:migrate");

  console.log("[e2e global-setup] Seeding demo users …");
  run("pnpm db:seed");

  console.log("[e2e global-setup] DB ready.");
}
