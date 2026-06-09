export const DEFAULT_ADMIN_EMAIL = "roishik10@gmail.com";

export function parseAdminEmails(raw: string | undefined): Set<string> {
  const source = raw?.trim() ? raw : DEFAULT_ADMIN_EMAIL;
  return new Set(
    source
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(
  email: string | null | undefined,
  raw = process.env["AUTH_ADMIN_EMAILS"],
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.trim().toLowerCase());
}
