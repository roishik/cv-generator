// Shared structured-output plumbing for the real adapters.
// PURE: no DB, no auth.
import type { ZodType } from "zod";
import { SchemaValidationError, type ProviderId } from "./provider";

/**
 * Parse raw JSON text and validate against a zod schema; on failure, run a
 * single bounded repair retry via `repair(errorMessage)`, then hard-error.
 * Never logs the raw output or any key material.
 */
export async function parseWithRepair<T>(
  provider: ProviderId,
  call: "extractProfile" | "tailor",
  schema: ZodType<T>,
  first: string,
  repair: (zodErrorMessage: string) => Promise<string>,
): Promise<T> {
  const attempt = (raw: string): { ok: true; data: T } | { ok: false; msg: string } => {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, msg: "response was not valid JSON" };
    }
    const result = schema.safeParse(json);
    if (result.success) return { ok: true, data: result.data };
    return { ok: false, msg: result.error.message };
  };

  const a1 = attempt(first);
  if (a1.ok) return a1.data;

  const second = await repair(a1.msg);
  const a2 = attempt(second);
  if (a2.ok) return a2.data;

  throw new SchemaValidationError(provider, call, a2.msg);
}
