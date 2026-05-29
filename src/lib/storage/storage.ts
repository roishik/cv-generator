/**
 * Storage interface — the single abstraction over binary blob persistence.
 *
 * The LocalFsStorage adapter (local-fs.ts) implements this for local dev.
 * A future SupabaseStorage / S3 adapter will be a drop-in replacement.
 *
 * Object keys are always namespaced: `{userId}/{uuid}.{ext}` so that
 * a future cloud adapter can enforce bucket-level path policies.
 *
 * PURE: no DB, no auth, no network beyond the storage backend.
 */

export interface StorageObject {
  /** The object key (relative path within the bucket/storage root). */
  key: string;
  /** Raw bytes. */
  data: Buffer;
  /** MIME type (informational; stored but not enforced by the adapter). */
  mimeType: string;
}

export interface SignedUrl {
  /** The URL to present to the browser (or to stream from in a route handler). */
  url: string;
  /** Unix epoch (seconds) at which this URL expires. */
  expiresAt: number;
}

export interface Storage {
  /**
   * Persist a binary object.
   * @returns the stored key (same as input key)
   */
  put(obj: StorageObject): Promise<string>;

  /**
   * Retrieve a binary object by key.
   * @throws if the key does not exist
   */
  get(key: string): Promise<Buffer>;

  /**
   * Delete an object by key. No-op if the key does not exist.
   */
  delete(key: string): Promise<void>;

  /**
   * Mint a short-lived access token / signed URL for the given key.
   * The LocalFsStorage returns a local HMAC-signed token served by
   * `/api/files/[token]`. A cloud adapter returns a pre-signed S3/GCS URL.
   *
   * @param key        the object key
   * @param ttlSeconds token lifetime in seconds (default 3600)
   */
  getSignedUrl(key: string, ttlSeconds?: number): Promise<SignedUrl>;
}
