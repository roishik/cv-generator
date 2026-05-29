/**
 * Next.js middleware — session-based route protection.
 *
 * - Unauthenticated requests to any /(app)/... path are redirected to /sign-in.
 * - Already authenticated users hitting /sign-in are redirected to /dashboard.
 * - All other paths (public marketing, API, static) pass through.
 *
 * We deliberately do NOT put the auth check inside the layout here because
 * middleware runs on every request before the React tree, making the redirect
 * faster (no layout render wasted) and more reliable (no Flash of Unauthenticated
 * Content for server-rendered pages).
 */

import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protected path prefixes (these are the URL paths, not the route-group dirs)
const PROTECTED_PREFIXES = ["/dashboard", "/knowledge-base", "/documents", "/tailor", "/settings", "/onboarding"];
// The sign-in page — authenticated users are bounced away
const SIGN_IN_PATH = "/sign-in";

export default auth(function middleware(req: NextRequest & { auth: { user?: { id?: string } } | null }) {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth?.user?.id;

  // Already signed in → redirect away from sign-in page
  if (isAuthenticated && pathname === SIGN_IN_PATH) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Not signed in → redirect protected paths to sign-in
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isAuthenticated && isProtected) {
    const signInUrl = new URL(SIGN_IN_PATH, req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Run on all page routes; skip Next.js internals, static assets, and API auth routes
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
