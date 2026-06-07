/**
 * GET /api/files/[token] — stream a local storage file via a signed HMAC token.
 *
 * Node runtime (reads the filesystem).
 * 1. Verify the HMAC token (signature + expiry).
 * 2. Auth check: userId embedded in the key path (`uploads/{userId}/...`) must
 *    match the authenticated session.
 * 3. Stream the file bytes.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { verifyToken } from "@/lib/storage/token";
import { getStorage } from "@/lib/storage/factory";
import { getEnv } from "@/env";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);
  const env = getEnv();
  if (env.STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1. Verify HMAC token.
  let key: string;
  try {
    const payload = verifyToken(env.STORAGE_SIGNING_SECRET, token);
    key = payload.key;
  } catch (e) {
    return NextResponse.json(
      { error: `invalid or expired token: ${(e as Error).message}` },
      { status: 401 },
    );
  }

  // 2. Auth check: the key must start with `uploads/{userId}/` or
  //    `artifacts/{userId}/` matching the authenticated user.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id as string;

  // Key is namespaced: `uploads/{userId}/...` or `artifacts/{userId}/...`
  const keySegments = key.split("/");
  const keyUserId = keySegments[1]; // index 0 = bucket prefix, 1 = userId
  if (keyUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Retrieve and stream the file.
  let fileBuffer: Buffer;
  try {
    const storage = getStorage();
    fileBuffer = await storage.get(key);
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  // Derive a simple content type for the response.
  const ext = key.split(".").pop()?.toLowerCase();
  const contentTypeMap: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain; charset=utf-8",
  };
  const contentType = (ext && contentTypeMap[ext]) ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileBuffer.byteLength),
      // No-cache: tokens are short-lived; re-fetch with a fresh token each time.
      "Cache-Control": "private, no-store",
      // Do not allow inline rendering of uploaded resume files.
      "Content-Disposition": `attachment; filename="${key.split("/").pop() ?? "file"}"`,
    },
  });
}
