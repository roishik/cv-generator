/**
 * Upload validation: MIME type (magic-byte sniff), size limits, extension allowlist.
 *
 * PURE: no DB, no auth, no network. Safe to call server-side in a Route Handler
 * before any storage write.
 */

import { z } from "zod";

/** Maximum allowed upload size (8 MB). */
export const MAX_BYTE_SIZE = 8 * 1024 * 1024;

/** Allowed MIME types (canonical, post-sniff). */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Extension → canonical MIME (used when the browser-supplied MIME is unreliable). */
const EXT_TO_MIME: Record<string, AllowedMimeType> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
};

/**
 * Magic-byte signatures for sniffing MIME without trusting the Content-Type header.
 * We sniff only PDF and DOCX (Office Open XML = zip); TXT has no magic bytes.
 */
const MAGIC: Array<{ bytes: number[]; mime: AllowedMimeType }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf" }, // %PDF
  {
    bytes: [0x50, 0x4b, 0x03, 0x04],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }, // PK zip (DOCX)
];

/**
 * Sniff the MIME type from the first 4 bytes.
 * Returns undefined if no magic signature matches (caller should fall back to
 * the extension-derived MIME for TXT, or reject the file).
 */
export function sniffMime(buffer: Buffer): AllowedMimeType | undefined {
  for (const { bytes, mime } of MAGIC) {
    if (bytes.every((b, i) => buffer[i] === b)) return mime;
  }
  return undefined;
}

/**
 * Derive the canonical MIME type for an upload given the filename.
 * Uses magic-byte sniff first; falls back to extension mapping.
 *
 * @throws if neither sniff nor extension produces an allowed MIME.
 */
export function resolveAllowedMime(
  buffer: Buffer,
  filename: string,
): AllowedMimeType {
  // Magic-byte sniff (reliable for PDF + DOCX).
  const sniffed = sniffMime(buffer);
  if (sniffed) return sniffed;

  // Extension fallback (for plain-text .txt uploads).
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const fromExt = EXT_TO_MIME[ext];
  if (fromExt) return fromExt;

  throw new Error(
    `unsupported file type (allowed: .pdf, .docx, .txt). Got: "${filename}"`,
  );
}

/**
 * Zod schema for the upload request fields (validated before any DB write).
 * Used by both the Route Handler and the server action.
 */
export const UploadRequestSchema = z.object({
  /** Raw file bytes. */
  buffer: z.instanceof(Buffer),
  /** Original filename (for storage path + display). */
  filename: z.string().min(1).max(256),
  /** MIME type claimed by the browser (informational — we sniff to confirm). */
  claimedMimeType: z.string().optional(),
});

export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export interface UploadValidationResult {
  ok: true;
  mimeType: AllowedMimeType;
}

export interface UploadValidationError {
  ok: false;
  error: string;
}

/**
 * Validate an upload buffer/filename and return the resolved MIME type.
 * Does NOT throw — returns a discriminated union so the caller can choose how
 * to surface the error (HTTP 415, action result, etc.).
 */
export function validateUpload(
  buffer: Buffer,
  filename: string,
): UploadValidationResult | UploadValidationError {
  if (buffer.byteLength > MAX_BYTE_SIZE) {
    return {
      ok: false,
      error: `file too large (max ${MAX_BYTE_SIZE / 1024 / 1024} MB, got ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
    };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, error: "file is empty" };
  }
  try {
    const mimeType = resolveAllowedMime(buffer, filename);
    return { ok: true, mimeType };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
