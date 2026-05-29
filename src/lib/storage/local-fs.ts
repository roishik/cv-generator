/**
 * LocalFsStorage — writes blobs under `STORAGE_LOCAL_DIR` (default ./storage).
 *
 * Directory layout:
 *   <STORAGE_LOCAL_DIR>/<objectKey>
 *
 * Object keys include the userId prefix (`uploads/{userId}/{uuid}.pdf`) so
 * path traversal is stopped by the `sanitizeKey` guard below.
 *
 * "Signed URLs" for local storage are HMAC tokens consumed by
 * `/api/files/[token]` (see `token.ts`). The route handler resolves the token
 * → key, checks that the key's userId prefix matches the authed session, and
 * streams the file via this adapter.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getEnv } from "@/env";
import type { Storage, StorageObject, SignedUrl } from "./storage";
import { mintToken } from "./token";

/** Prevent path-traversal in object keys. */
function sanitizeKey(key: string): string {
  // Resolve to a canonical relative path; reject any attempt to escape the root.
  const normalized = path.posix.normalize(key);
  // Reject absolute paths and any path starting with ".." (traversal attempt).
  if (
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.startsWith("/")
  ) {
    throw new Error(`storage: invalid key "${key}"`);
  }
  // Also reject the un-normalized key if it contained ".." segments anywhere.
  if (key.split("/").includes("..") || key.split(path.sep).includes("..")) {
    throw new Error(`storage: invalid key "${key}"`);
  }
  return normalized;
}

export class LocalFsStorage implements Storage {
  private readonly root: string;
  private readonly signingSecret: string;
  private readonly baseUrl: string;

  /**
   * @param root           Absolute or relative path to the storage root directory.
   * @param signingSecret  STORAGE_SIGNING_SECRET — used to mint HMAC tokens.
   * @param baseUrl        App base URL used to build the `/api/files/[token]` URL.
   *                       Defaults to `http://localhost:3000`.
   */
  constructor(root: string, signingSecret: string, baseUrl = "http://localhost:3000") {
    this.root = path.resolve(root);
    this.signingSecret = signingSecret;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private filePath(key: string): string {
    const safe = sanitizeKey(key);
    return path.join(this.root, safe);
  }

  async put(obj: StorageObject): Promise<string> {
    const filePath = this.filePath(obj.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, obj.data);
    return obj.key;
  }

  async get(key: string): Promise<Buffer> {
    const filePath = this.filePath(key);
    if (!existsSync(filePath)) {
      throw new Error(`storage: object not found: ${key}`);
    }
    return readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.filePath(key);
    if (existsSync(filePath)) {
      await rm(filePath, { force: true });
    }
  }

  async getSignedUrl(key: string, ttlSeconds = 3600): Promise<SignedUrl> {
    const safe = sanitizeKey(key);
    const token = mintToken(this.signingSecret, safe, ttlSeconds);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    return {
      url: `${this.baseUrl}/api/files/${encodeURIComponent(token)}`,
      expiresAt,
    };
  }
}

/**
 * Singleton factory — lazily creates a LocalFsStorage from env vars.
 * Import `getStorage()` in server code; tests can use the constructor directly.
 */
let _storage: LocalFsStorage | undefined;

export function getStorage(): LocalFsStorage {
  if (!_storage) {
    const env = getEnv();
    const baseUrl = env.NEXTAUTH_URL ?? "http://localhost:3000";
    _storage = new LocalFsStorage(env.STORAGE_LOCAL_DIR, env.STORAGE_SIGNING_SECRET, baseUrl);
  }
  return _storage;
}

/** Reset the singleton (for tests). */
export function resetStorage(): void {
  _storage = undefined;
}
