/**
 * Auth.js v5 catch-all route handler.
 * Handles all /api/auth/* requests (sign-in, sign-out, callback, session, etc.)
 */

export const runtime = "nodejs";

import { handlers } from "@/lib/auth/config";

export const { GET, POST } = handlers;
