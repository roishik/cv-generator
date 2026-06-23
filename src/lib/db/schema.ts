/**
 * Drizzle table definitions — the single source of DDL for the app.
 *
 * Reproduces the canonical data model from planning/03-architecture.md §3 and
 * planning/04-master-plan.md 1:1:
 *   - Auth.js tables (users, accounts, sessions, verification_token)
 *   - profiles
 *   - knowledge base (knowledge_bases + kb_experiences/education/skills)
 *   - resume_uploads, job_descriptions
 *   - cv_documents (baseline + tailored, versioned), artifacts
 *   - provider_keys (envelope-encrypted BYOK), usage_events
 *
 * `user_id` is denormalized onto every user-owned child table so each RLS
 * policy is a single-column equality check (no joins). The RLS roles/policies
 * themselves are authored in a companion raw-SQL migration that runs AFTER the
 * Drizzle DDL (see drizzle/migrations/0001_rls_policies.sql).
 *
 * NOTE: column names that the Auth.js Drizzle adapter expects are camelCased in
 * the DB (e.g. "userId", "emailVerified", "sessionToken", "providerAccountId").
 */

import {
  bigint,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Postgres `bytea` mapped to Node Buffer (used for encrypted provider keys). */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth.js tables (NextAuth v5 / @auth/drizzle-adapter schema)
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: bigint("expires_at", { mode: "number" }),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    providerUnique: unique("accounts_provider_providerAccountId_key").on(
      t.provider,
      t.providerAccountId,
    ),
    userIdx: index("accounts_user_idx").on(t.userId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionToken: text("sessionToken").notNull().unique(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Per-user profile / settings
// ─────────────────────────────────────────────────────────────────────────────

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  defaultTemplate: text("default_template").notNull().default("sidebar"),
  defaultThemeId: text("default_theme_id").notNull().default("sidebar-default"),
  defaultProvider: text("default_provider"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge base (versioned; one active KB per user)
// ─────────────────────────────────────────────────────────────────────────────

export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    narrative: text("narrative"),
    header: jsonb("header").notNull().default(sql`'{}'::jsonb`),
    contact: jsonb("contact").notNull().default(sql`'{}'::jsonb`),
    languages: jsonb("languages").notNull().default(sql`'[]'::jsonb`),
    // Leadership/impact entries (sidebar-only). Stored as JSON on the KB row,
    // mirroring `languages` — small array, no need for a normalized child table.
    leadership: jsonb("leadership").notNull().default(sql`'[]'::jsonb`),
    sourceUploadId: uuid("source_upload_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userVersionUnique: unique("kb_user_version_key").on(t.userId, t.version),
    userIdx: index("kb_user_idx").on(t.userId),
  }),
);

export const kbExperiences = pgTable(
  "kb_experiences",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    company: text("company").notNull(),
    role: text("role").notNull(),
    period: text("period"),
    location: text("location"),
    bulletsFull: jsonb("bullets_full").notNull().default(sql`'[]'::jsonb`),
    angles: jsonb("angles").notNull().default(sql`'[]'::jsonb`),
    tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kbIdx: index("kb_exp_kb_idx").on(t.knowledgeBaseId, t.ord),
    userIdx: index("kb_exp_user_idx").on(t.userId),
  }),
);

export const kbEducation = pgTable(
  "kb_education",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    institution: text("institution").notNull(),
    degree: text("degree"),
    period: text("period"),
    note: text("note"),
  },
  (t) => ({
    kbIdx: index("kb_edu_kb_idx").on(t.knowledgeBaseId, t.ord),
    userIdx: index("kb_edu_user_idx").on(t.userId),
  }),
);

export const kbSkills = pgTable(
  "kb_skills",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    ord: integer("ord").notNull(),
    value: text("value").notNull(),
    tags: jsonb("tags").notNull().default(sql`'[]'::jsonb`),
  },
  (t) => ({
    kbIdx: index("kb_skill_kb_idx").on(t.knowledgeBaseId, t.category, t.ord),
    userIdx: index("kb_skill_user_idx").on(t.userId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Uploaded resumes (binary lives in Storage; metadata here)
// ─────────────────────────────────────────────────────────────────────────────

export const resumeUploads = pgTable(
  "resume_uploads",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").notNull().default("uploaded"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("uploads_user_idx").on(t.userId),
    shaIdx: index("uploads_sha_idx").on(t.userId, t.sha256),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Job descriptions
// ─────────────────────────────────────────────────────────────────────────────

export const jobDescriptions = pgTable(
  "job_descriptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    company: text("company"),
    rawText: text("raw_text").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("jd_user_idx").on(t.userId, t.sha256),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// CV documents (baseline + tailored, versioned)
// ─────────────────────────────────────────────────────────────────────────────

export const cvDocuments = pgTable(
  "cv_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    parentId: uuid("parent_id"),
    version: integer("version").notNull().default(1),
    templateId: text("template_id").notNull(),
    themeId: text("theme_id").notNull().default("sidebar-default"),
    knowledgeBaseId: uuid("knowledge_base_id").references(() => knowledgeBases.id, {
      onDelete: "set null",
    }),
    kbVersion: integer("kb_version"),
    jobDescriptionId: uuid("job_description_id").references(() => jobDescriptions.id, {
      onDelete: "set null",
    }),
    cvData: jsonb("cv_data").notNull(),
    rationale: jsonb("rationale").notNull().default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings").notNull().default(sql`'[]'::jsonb`),
    diff: jsonb("diff").notNull().default(sql`'{}'::jsonb`),
    truthfulness: jsonb("truthfulness").notNull().default(sql`'{}'::jsonb`),
    /** The LLM's holistic JD↔candidate fit judgment (FitAssessment). Null for
     *  instructions-only runs or legacy rows tailored before fit was persisted. */
    fitAssessment: jsonb("fit_assessment"),
    appliedThemeOverrides: jsonb("applied_theme_overrides"),
    /** Deterministic tailoring cache key — sha256(kbVersion + jdHash + templateId). */
    tailorCacheKey: text("tailor_cache_key"),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("cvdoc_user_idx").on(t.userId, t.createdAt.desc()),
    parentIdx: index("cvdoc_parent_idx").on(t.parentId),
    cacheIdx: index("cvdoc_cache_idx").on(
      t.userId,
      t.knowledgeBaseId,
      t.kbVersion,
      t.jobDescriptionId,
      t.templateId,
    ),
    tailorCacheIdx: index("cvdoc_tailor_cache_idx").on(t.userId, t.tailorCacheKey),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Generated artifacts (PDF refs)
// ─────────────────────────────────────────────────────────────────────────────

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cvDocumentId: uuid("cv_document_id")
      .notNull()
      .references(() => cvDocuments.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    pageCount: integer("page_count").notNull(),
    qa: jsonb("qa").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docIdx: index("artifact_doc_idx").on(t.cvDocumentId),
    userIdx: index("artifact_user_idx").on(t.userId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Provider API keys (envelope-encrypted, BYOK)
// ─────────────────────────────────────────────────────────────────────────────

export const providerKeys = pgTable(
  "provider_keys",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    iv: bytea("iv").notNull(),
    authTag: bytea("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    last4: text("last4"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userProviderUnique: unique("provider_keys_user_provider_key").on(t.userId, t.provider),
    userIdx: index("provider_keys_user_idx").on(t.userId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Usage / audit log
// ─────────────────────────────────────────────────────────────────────────────

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    provider: text("provider"),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull(),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTimeIdx: index("usage_user_time_idx").on(t.userId, t.createdAt.desc()),
  }),
);

/**
 * The user-owned tables that carry a `user_id` and are governed by RLS.
 * Kept in one place so the RLS migration and the test-suite stay in sync.
 */
export const RLS_TABLES = [
  "profiles",
  "knowledge_bases",
  "kb_experiences",
  "kb_education",
  "kb_skills",
  "resume_uploads",
  "job_descriptions",
  "cv_documents",
  "artifacts",
  "provider_keys",
  "usage_events",
] as const;

export const schema = {
  users,
  accounts,
  sessions,
  verificationTokens,
  profiles,
  knowledgeBases,
  kbExperiences,
  kbEducation,
  kbSkills,
  resumeUploads,
  jobDescriptions,
  cvDocuments,
  artifacts,
  providerKeys,
  usageEvents,
};

export type Schema = typeof schema;
