/**
 * POST /api/uploads — multipart resume upload.
 *
 * Node runtime (never Edge — needs crypto + fs).
 * Auth-gated: returns 401 if no session.
 * Stores the file via Storage, records in resume_uploads (RLS-scoped).
 *
 * Response:
 *   200 { uploadId, filename, mimeType, byteSize, sha256, textLength }
 *   400 { error }
 *   401 { error }
 *   413 { error }
 */

export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { validateUpload } from "@/lib/parse/validate-upload";
import { getStorage } from "@/lib/storage/factory";
import { withUser } from "@/lib/db/rls";
import { resumeUploads } from "@/lib/db/schema";
import { assertWithinRateLimit, RateLimitError } from "@/lib/ratelimit";
import { recordAnalyticsEventSafe } from "@/lib/analytics/events";
import { byteSizeBucket } from "@/lib/analytics/meta";

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  // 1. Auth check.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id as string;
  const recordUploadEvent = (status: "ok" | "warning" | "error", meta: Record<string, unknown>) =>
    recordAnalyticsEventSafe({
      userId,
      kind: "upload_resume",
      status,
      durationMs: Date.now() - startedAt,
      meta,
    });

  try {
    assertWithinRateLimit({ kind: "upload", userId });
  } catch (e) {
    if (e instanceof RateLimitError) {
      await recordUploadEvent("error", {
        reason: "rate_limit",
        statusCode: 429,
        retryAfterSeconds: e.retryAfterSeconds,
      });
      return NextResponse.json(
        { error: e.message },
        {
          status: 429,
          headers: { "Retry-After": String(e.retryAfterSeconds) },
        },
      );
    }
    throw e;
  }

  // 2. Parse multipart body.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    await recordUploadEvent("error", { reason: "invalid_multipart", statusCode: 400 });
    return NextResponse.json({ error: "invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    await recordUploadEvent("error", { reason: "missing_file", statusCode: 400 });
    return NextResponse.json({ error: 'missing "file" field in multipart body' }, { status: 400 });
  }
  const typedFile = file as File;

  // 3. Read to Buffer.
  const arrayBuffer = await typedFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const byteSize = buffer.byteLength;

  // 4. Validate MIME + size.
  const validation = validateUpload(buffer, typedFile.name);
  if (!validation.ok) {
    const status = validation.error.startsWith("file too large") ? 413 : 415;
    await recordUploadEvent("error", {
      reason: "validation_failed",
      statusCode: status,
      byteSize,
      sizeBucket: byteSizeBucket(byteSize),
    });
    return NextResponse.json({ error: validation.error }, { status });
  }

  const { mimeType } = validation;
  const filename = typedFile.name;

  // 5. Compute SHA-256 of raw bytes (used as the extraction cache key).
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  // 6. Store via Storage adapter.
  const objectKey = `uploads/${userId}/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storage = getStorage();
  try {
    await storage.put({ key: objectKey, data: buffer, mimeType });
  } catch (e) {
    await recordUploadEvent("error", {
      reason: "storage_failed",
      errorType: (e as Error).name,
      mimeType,
      byteSize,
      sizeBucket: byteSizeBucket(byteSize),
    });
    throw e;
  }

  // 7. Record in resume_uploads (RLS-scoped).
  let row: { id: string } | undefined;
  try {
    [row] = await withUser(userId, (tx) =>
      tx
        .insert(resumeUploads)
        .values({
          userId,
          storagePath: objectKey,
          filename,
          mimeType,
          byteSize,
          sha256,
          status: "uploaded",
        })
        .returning({ id: resumeUploads.id }),
    );
  } catch (e) {
    await recordUploadEvent("error", {
      reason: "db_failed",
      errorType: (e as Error).name,
      mimeType,
      byteSize,
      sizeBucket: byteSizeBucket(byteSize),
    });
    throw e;
  }
  if (!row) {
    await recordUploadEvent("error", {
      reason: "db_empty_insert",
      mimeType,
      byteSize,
      sizeBucket: byteSizeBucket(byteSize),
    });
    throw new Error("Upload record was not created");
  }

  await recordUploadEvent("ok", {
    mimeType,
    byteSize,
    sizeBucket: byteSizeBucket(byteSize),
  });

  return NextResponse.json({
    uploadId: row.id,
    filename,
    mimeType,
    byteSize,
    sha256,
  });
}
