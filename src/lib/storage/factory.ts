import { getEnv } from "@/env";
import type { Storage } from "./storage";
import { LocalFsStorage } from "./local-fs";
import { GcsStorage } from "./gcs";

let _storage: Storage | undefined;

export function getStorage(): Storage {
  if (_storage) return _storage;
  const env = getEnv();
  if (env.STORAGE_DRIVER === "gcs") {
    const uploads = env.GCS_BUCKET_UPLOADS;
    const artifacts = env.GCS_BUCKET_ARTIFACTS;
    if (!uploads || !artifacts) {
      throw new Error(
        "STORAGE_DRIVER=gcs requires GCS_BUCKET_UPLOADS and GCS_BUCKET_ARTIFACTS.",
      );
    }
    _storage = new GcsStorage({
      uploads,
      artifacts,
      ...(env.GCS_BUCKET_PHOTOS ? { photos: env.GCS_BUCKET_PHOTOS } : {}),
    });
    return _storage;
  }

  // Local (default)
  const baseUrl = env.NEXTAUTH_URL ?? "http://localhost:3000";
  _storage = new LocalFsStorage(
    env.STORAGE_LOCAL_DIR,
    env.STORAGE_SIGNING_SECRET,
    baseUrl,
  );
  return _storage;
}

export function resetStorageFactoryForTests(): void {
  _storage = undefined;
}
