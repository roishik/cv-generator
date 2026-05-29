import { chromium, type Browser, type Page } from "playwright";

// Reused headless-Chromium browser instance + a small page pool. Node runtime
// only (never Edge). One browser is launched lazily and shared across PDF jobs;
// pages are acquired/released so concurrent renders don't collide.

let browserPromise: Promise<Browser> | null = null;
const idlePages: Page[] = [];
let liveCount = 0;
const MAX_PAGES = Number(process.env.PDF_MAX_CONCURRENCY ?? 3);
const waiters: Array<(p: Page) => void> = [];

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
    browserPromise = chromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
    });
  }
  return browserPromise;
}

/** Acquire a page from the pool (blocks if at max concurrency). */
export async function acquirePage(): Promise<Page> {
  const existing = idlePages.pop();
  if (existing) return existing;
  if (liveCount < MAX_PAGES) {
    liveCount++;
    const browser = await getBrowser();
    return browser.newPage({ viewport: { width: 794, height: 1123 } });
  }
  return new Promise<Page>((resolve) => waiters.push(resolve));
}

/** Return a page to the pool (or hand it to a waiter). */
export function releasePage(page: Page): void {
  const waiter = waiters.shift();
  if (waiter) {
    waiter(page);
    return;
  }
  idlePages.push(page);
}

/** Tear down the browser + pool (tests / graceful shutdown). */
export async function closeBrowser(): Promise<void> {
  for (const p of idlePages.splice(0)) {
    await p.close().catch(() => {});
  }
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
  liveCount = 0;
  waiters.length = 0;
}
