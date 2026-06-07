# Google Cloud Deployment Runbook

Project: `tailor-cv-generator`
Region: `europe-west1`
Domain: `tailor.roishikler.com`

## Architecture

- Cloud Run service: `tailor`
- Artifact Registry: `europe-west1-docker.pkg.dev/tailor-cv-generator/tailor`
- Cloud SQL Postgres: `tailor-db`
- Cloud Storage buckets:
  - `tailor-cv-generator-uploads`
  - `tailor-cv-generator-artifacts`
  - `tailor-cv-generator-photos`
- Secret Manager:
  - `DATABASE_URL`
  - `APP_DATABASE_URL`
  - `AUTH_SECRET`
  - `STORAGE_SIGNING_SECRET`
  - `MASTER_KEY_SECRET`
  - `GOOGLE_CLIENT_ID` (manual)
  - `GOOGLE_CLIENT_SECRET` (manual)
  - provider managed keys as needed (`GOOGLE_API_KEY`, etc.)

## Manual Inputs Still Required

1. Google OAuth web client:
   - Authorized redirect URI: `https://tailor.roishikler.com/api/auth/callback/google`
   - Optional local redirect URI: `http://localhost:3000/api/auth/callback/google`
2. DNS for `tailor.roishikler.com` after Cloud Run domain mapping is created.
3. Managed provider key if the free managed extraction/generation tier should be active.

## First Deploy Flow

```bash
gcloud config set project tailor-cv-generator
gcloud config set run/region europe-west1

gcloud builds submit \
  --tag europe-west1-docker.pkg.dev/tailor-cv-generator/tailor/tailor:latest

gcloud run deploy tailor \
  --image europe-west1-docker.pkg.dev/tailor-cv-generator/tailor/tailor:latest \
  --region europe-west1 \
  --service-account tailor-run@tailor-cv-generator.iam.gserviceaccount.com \
  --add-cloudsql-instances tailor-cv-generator:europe-west1:tailor-db \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 5 \
  --timeout 300 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,NEXTAUTH_URL=https://tailor.roishikler.com,AUTH_DEV_LOGIN=false,AI_PROVIDER=google,STORAGE_DRIVER=gcs,GCS_BUCKET_UPLOADS=tailor-cv-generator-uploads,GCS_BUCKET_ARTIFACTS=tailor-cv-generator-artifacts,GCS_BUCKET_PHOTOS=tailor-cv-generator-photos,CLOUD_SQL_CONNECTION_NAME=tailor-cv-generator:europe-west1:tailor-db \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,APP_DATABASE_URL=APP_DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,STORAGE_SIGNING_SECRET=STORAGE_SIGNING_SECRET:latest,MASTER_KEY_SECRET=MASTER_KEY_SECRET:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest
```

## Run Migrations

Use the same image as a Cloud Run Job so migrations connect through the Cloud SQL
Unix socket and never expose Postgres publicly.

```bash
gcloud run jobs create tailor-migrate \
  --image europe-west1-docker.pkg.dev/tailor-cv-generator/tailor/tailor:latest \
  --region europe-west1 \
  --service-account tailor-run@tailor-cv-generator.iam.gserviceaccount.com \
  --add-cloudsql-instances tailor-cv-generator:europe-west1:tailor-db \
  --command pnpm \
  --args db:migrate \
  --set-env-vars NODE_ENV=production,CLOUD_SQL_CONNECTION_NAME=tailor-cv-generator:europe-west1:tailor-db \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,STORAGE_SIGNING_SECRET=STORAGE_SIGNING_SECRET:latest,MASTER_KEY_SECRET=MASTER_KEY_SECRET:latest

gcloud run jobs execute tailor-migrate --region europe-west1 --wait
```

## Domain Mapping

```bash
gcloud run domain-mappings create \
  --service tailor \
  --domain tailor.roishikler.com \
  --region europe-west1

gcloud run domain-mappings describe \
  --domain tailor.roishikler.com \
  --region europe-west1
```

Add the returned DNS records at the DNS provider for `roishikler.com`.

## Private Beta Allowlist

For the first beta, use env-based allowlisting:

```text
AUTH_ALLOWED_EMAILS=you@example.com,friend@example.com
```

Update the Cloud Run service env var when adding testers.

## Known Production Risks

- Upload AV scanning is intentionally deferred for private beta. Uploads are
  size-capped, MIME-sniffed, stored as attachments, and parsed for text only.
  Add ClamAV or object-storage scanning before open sign-up.
- Rate limiting is in-memory and safe only for a single Cloud Run instance.
  Move to Redis/Postgres counters before horizontal scale.
- Cloud SQL `db-f1-micro` is for beta cost control, not high availability.
