import { Storage as GoogleStorage, type Bucket } from "@google-cloud/storage";
import path from "node:path";
import type { SignedUrl, Storage, StorageObject } from "./storage";

function sanitizeKey(key: string): string {
  const normalized = path.posix.normalize(key);
  if (
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.startsWith("/")
  ) {
    throw new Error(`storage: invalid key "${key}"`);
  }
  if (key.split("/").includes("..") || key.split(path.sep).includes("..")) {
    throw new Error(`storage: invalid key "${key}"`);
  }
  return normalized;
}

export interface GcsStorageBuckets {
  uploads: string;
  artifacts: string;
  photos?: string;
}

/**
 * Cloud Storage adapter (GCS).
 *
 * Keys stay namespaced (`uploads/{userId}/...`, `artifacts/{userId}/...`) so
 * ownership checks remain identical across local and cloud adapters.
 */
export class GcsStorage implements Storage {
  private readonly client: GoogleStorage;
  private readonly buckets: {
    uploads: Bucket;
    artifacts: Bucket;
    photos?: Bucket;
  };

  constructor(
    buckets: GcsStorageBuckets,
    client = new GoogleStorage(),
  ) {
    this.client = client;
    this.buckets = {
      uploads: this.client.bucket(buckets.uploads),
      artifacts: this.client.bucket(buckets.artifacts),
      ...(buckets.photos ? { photos: this.client.bucket(buckets.photos) } : {}),
    };
  }

  private bucketForKey(key: string): Bucket {
    if (key.startsWith("uploads/")) return this.buckets.uploads;
    if (key.startsWith("artifacts/")) return this.buckets.artifacts;
    if (key.startsWith("photos/")) return this.buckets.photos ?? this.buckets.uploads;
    // Fallback to uploads bucket for unknown prefixes.
    return this.buckets.uploads;
  }

  async put(obj: StorageObject): Promise<string> {
    const safe = sanitizeKey(obj.key);
    const bucket = this.bucketForKey(safe);
    await bucket.file(safe).save(obj.data, {
      resumable: false,
      contentType: obj.mimeType,
      metadata: {
        contentType: obj.mimeType,
      },
    });
    return safe;
  }

  async get(key: string): Promise<Buffer> {
    const safe = sanitizeKey(key);
    const bucket = this.bucketForKey(safe);
    const [buf] = await bucket.file(safe).download();
    return buf;
  }

  async delete(key: string): Promise<void> {
    const safe = sanitizeKey(key);
    const bucket = this.bucketForKey(safe);
    await bucket.file(safe).delete({ ignoreNotFound: true });
  }

  async getSignedUrl(key: string, ttlSeconds = 3600): Promise<SignedUrl> {
    const safe = sanitizeKey(key);
    const bucket = this.bucketForKey(safe);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const [url] = await bucket.file(safe).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt * 1000,
    });
    return { url, expiresAt };
  }
}
