import { getOwnerSql } from "@/lib/db/client";

export type AdminRangeDays = 7 | 30 | 90;

export interface AdminAnalyticsSummary {
  days: AdminRangeDays;
  start: Date;
  end: Date;
  overview: {
    totalUsers: number;
    newUsers: number;
    activeUsers: number;
    uploads: number;
    failedUploads: number;
    tailoredVersions: number;
    aiCalls: number;
    aiErrors: number;
    downloads: number;
    clicks: number;
    sessions: number;
    totalTimeMs: number;
    warningEvents: number;
    errorEvents: number;
    cvWarningCount: number;
  };
  funnel: {
    uploads: number;
    profiles: number;
    jobDescriptions: number;
    tailoredVersions: number;
    pdfArtifacts: number;
    downloads: number;
  };
  providers: ProviderBreakdown[];
  screens: ScreenBreakdown[];
  actions: ActionBreakdown[];
  issues: IssueBreakdown[];
  topUsers: TopUserRow[];
  uploadStats: UploadStatRow[];
  trends: TrendRow[];
}

export interface ProviderBreakdown {
  provider: string;
  kind: string;
  calls: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  avgLatencyMs: number;
  lastSeenAt: Date | null;
}

export interface ScreenBreakdown {
  path: string;
  views: number;
  uniqueUsers: number;
  totalTimeMs: number;
  clicks: number;
}

export interface ActionBreakdown {
  action: string;
  kind: string;
  count: number;
  lastSeenAt: Date | null;
}

export interface IssueBreakdown {
  kind: string;
  status: string;
  detail: string;
  count: number;
  lastSeenAt: Date | null;
}

export interface TopUserRow {
  email: string;
  name: string | null;
  joinedAt: Date;
  events: number;
  uploads: number;
  versions: number;
  aiCalls: number;
  exports: number;
  errors: number;
  lastActiveAt: Date | null;
}

export interface UploadStatRow {
  mimeType: string;
  status: string;
  count: number;
  avgByteSize: number;
}

export interface TrendRow {
  day: Date;
  pageViews: number;
  activeUsers: number;
  tailors: number;
  errors: number;
  totalTimeMs: number;
}

export function parseAdminDays(value: string | string[] | undefined): AdminRangeDays {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "7" || raw === "30" || raw === "90") return Number(raw) as AdminRangeDays;
  return 30;
}

export async function getAdminAnalyticsSummary(
  days: AdminRangeDays,
): Promise<AdminAnalyticsSummary> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const sql = getOwnerSql();

  const [
    overviewRows,
    funnelRows,
    providerRows,
    screenRows,
    actionRows,
    issueRows,
    topUserRows,
    uploadRows,
    trendRows,
  ] = await Promise.all([
    sql`
      WITH active_users AS (
        SELECT user_id FROM usage_events WHERE created_at >= ${start}
        UNION
        SELECT user_id FROM resume_uploads WHERE created_at >= ${start}
        UNION
        SELECT user_id FROM cv_documents WHERE created_at >= ${start}
      )
      SELECT
        (SELECT count(*)::int FROM users) AS total_users,
        (SELECT count(*)::int FROM users WHERE created_at >= ${start}) AS new_users,
        (SELECT count(DISTINCT user_id)::int FROM active_users) AS active_users,
        (SELECT count(*)::int FROM resume_uploads WHERE created_at >= ${start}) AS uploads,
        (SELECT count(*)::int FROM resume_uploads WHERE created_at >= ${start} AND status = 'failed') AS failed_uploads,
        (SELECT count(*)::int FROM cv_documents WHERE created_at >= ${start} AND kind = 'tailored') AS tailored_versions,
        (SELECT count(*)::int FROM usage_events WHERE created_at >= ${start} AND kind IN ('extract', 'tailor', 'edit_profile')) AS ai_calls,
        (SELECT count(*)::int FROM usage_events WHERE created_at >= ${start} AND kind IN ('extract', 'tailor', 'edit_profile') AND status = 'error') AS ai_errors,
        (SELECT count(*)::int FROM usage_events WHERE created_at >= ${start} AND kind = 'download_pdf' AND status = 'ok') AS downloads,
        (SELECT count(*)::int FROM usage_events WHERE created_at >= ${start} AND kind = 'ui_click') AS clicks,
        (SELECT count(DISTINCT meta->>'sessionId')::int FROM usage_events WHERE created_at >= ${start} AND kind IN ('page_view', 'screen_time')) AS sessions,
        (SELECT coalesce(sum(latency_ms), 0)::int FROM usage_events WHERE created_at >= ${start} AND kind = 'screen_time') AS total_time_ms,
        (SELECT count(*)::int FROM usage_events WHERE created_at >= ${start} AND status = 'warning') AS warning_events,
        (SELECT count(*)::int FROM usage_events WHERE created_at >= ${start} AND status = 'error') AS error_events,
        (SELECT coalesce(sum(jsonb_array_length(warnings)), 0)::int FROM cv_documents WHERE created_at >= ${start} AND kind = 'tailored') AS cv_warning_count
    `,
    sql`
      SELECT
        (SELECT count(*)::int FROM resume_uploads WHERE created_at >= ${start}) AS uploads,
        (SELECT count(*)::int FROM knowledge_bases WHERE created_at >= ${start}) AS profiles,
        (SELECT count(*)::int FROM job_descriptions WHERE created_at >= ${start}) AS job_descriptions,
        (SELECT count(*)::int FROM cv_documents WHERE created_at >= ${start} AND kind = 'tailored') AS tailored_versions,
        (SELECT count(*)::int FROM artifacts WHERE created_at >= ${start}) AS pdf_artifacts,
        (SELECT count(*)::int FROM usage_events WHERE created_at >= ${start} AND kind = 'download_pdf' AND status = 'ok') AS downloads
    `,
    sql`
      SELECT
        coalesce(provider, 'unknown') AS provider,
        kind,
        count(*)::int AS calls,
        count(*) FILTER (WHERE status = 'error')::int AS errors,
        coalesce(sum(prompt_tokens), 0)::int AS prompt_tokens,
        coalesce(sum(completion_tokens), 0)::int AS completion_tokens,
        coalesce(avg(latency_ms), 0)::int AS avg_latency_ms,
        max(created_at) AS last_seen_at
      FROM usage_events
      WHERE created_at >= ${start}
        AND kind IN ('extract', 'tailor', 'edit_profile')
      GROUP BY provider, kind
      ORDER BY calls DESC, provider ASC
      LIMIT 20
    `,
    sql`
      SELECT
        coalesce(meta->>'path', 'unknown') AS path,
        count(*) FILTER (WHERE kind = 'page_view')::int AS views,
        count(DISTINCT user_id)::int AS unique_users,
        coalesce(sum(latency_ms) FILTER (WHERE kind = 'screen_time'), 0)::int AS total_time_ms,
        count(*) FILTER (WHERE kind = 'ui_click')::int AS clicks
      FROM usage_events
      WHERE created_at >= ${start}
        AND kind IN ('page_view', 'screen_time', 'ui_click')
      GROUP BY path
      ORDER BY total_time_ms DESC, views DESC
      LIMIT 15
    `,
    sql`
      SELECT
        coalesce(meta->>'action', kind) AS action,
        kind,
        count(*)::int AS count,
        max(created_at) AS last_seen_at
      FROM usage_events
      WHERE created_at >= ${start}
        AND kind IN (
          'ui_click',
          'upload_resume',
          'extract_profile',
          'tailor_cv',
          'rerender_cv',
          'download_pdf',
          'provider_key_saved',
          'provider_key_deleted',
          'provider_selected',
          'profile_saved',
          'profile_ai_edit',
          'version_restored',
          'version_deleted'
        )
      GROUP BY action, kind
      ORDER BY count DESC, last_seen_at DESC
      LIMIT 20
    `,
    sql`
      SELECT
        kind,
        status,
        coalesce(nullif(meta->>'reason', ''), nullif(meta->>'errorType', ''), 'unspecified') AS detail,
        count(*)::int AS count,
        max(created_at) AS last_seen_at
      FROM usage_events
      WHERE created_at >= ${start}
        AND status IN ('error', 'warning')
      GROUP BY kind, status, detail
      ORDER BY count DESC, last_seen_at DESC
      LIMIT 20
    `,
    sql`
      WITH event_agg AS (
        SELECT
          user_id,
          count(*)::int AS events,
          count(*) FILTER (WHERE kind IN ('extract', 'tailor', 'edit_profile'))::int AS ai_calls,
          count(*) FILTER (WHERE kind = 'download_pdf' AND status = 'ok')::int AS exports,
          count(*) FILTER (WHERE status = 'error')::int AS errors,
          max(created_at) AS last_event_at
        FROM usage_events
        WHERE created_at >= ${start}
        GROUP BY user_id
      ),
      upload_agg AS (
        SELECT user_id, count(*)::int AS uploads, max(created_at) AS last_upload_at
        FROM resume_uploads
        WHERE created_at >= ${start}
        GROUP BY user_id
      ),
      doc_agg AS (
        SELECT user_id, count(*)::int AS versions, max(created_at) AS last_doc_at
        FROM cv_documents
        WHERE created_at >= ${start} AND kind = 'tailored'
        GROUP BY user_id
      )
      SELECT
        users.email,
        users.name,
        users.created_at AS joined_at,
        coalesce(event_agg.events, 0)::int AS events,
        coalesce(upload_agg.uploads, 0)::int AS uploads,
        coalesce(doc_agg.versions, 0)::int AS versions,
        coalesce(event_agg.ai_calls, 0)::int AS ai_calls,
        coalesce(event_agg.exports, 0)::int AS exports,
        coalesce(event_agg.errors, 0)::int AS errors,
        nullif(
          greatest(
            coalesce(event_agg.last_event_at, 'epoch'::timestamptz),
            coalesce(upload_agg.last_upload_at, 'epoch'::timestamptz),
            coalesce(doc_agg.last_doc_at, 'epoch'::timestamptz)
          ),
          'epoch'::timestamptz
        ) AS last_active_at
      FROM users
      LEFT JOIN event_agg ON event_agg.user_id = users.id
      LEFT JOIN upload_agg ON upload_agg.user_id = users.id
      LEFT JOIN doc_agg ON doc_agg.user_id = users.id
      WHERE users.created_at >= ${start}
        OR event_agg.user_id IS NOT NULL
        OR upload_agg.user_id IS NOT NULL
        OR doc_agg.user_id IS NOT NULL
      ORDER BY last_active_at DESC NULLS LAST, users.created_at DESC
      LIMIT 15
    `,
    sql`
      SELECT
        mime_type,
        status,
        count(*)::int AS count,
        coalesce(avg(byte_size), 0)::int AS avg_byte_size
      FROM resume_uploads
      WHERE created_at >= ${start}
      GROUP BY mime_type, status
      ORDER BY count DESC
      LIMIT 12
    `,
    sql`
      SELECT
        date_trunc('day', created_at) AS day,
        count(*) FILTER (WHERE kind = 'page_view')::int AS page_views,
        count(DISTINCT user_id)::int AS active_users,
        count(*) FILTER (WHERE kind IN ('tailor', 'tailor_cv'))::int AS tailors,
        count(*) FILTER (WHERE status = 'error')::int AS errors,
        coalesce(sum(latency_ms) FILTER (WHERE kind = 'screen_time'), 0)::int AS total_time_ms
      FROM usage_events
      WHERE created_at >= ${start}
      GROUP BY day
      ORDER BY day ASC
    `,
  ]);

  const overview = (overviewRows as unknown as Array<Record<string, unknown>>)[0] ?? {};
  const funnel = (funnelRows as unknown as Array<Record<string, unknown>>)[0] ?? {};

  return {
    days,
    start,
    end,
    overview: {
      totalUsers: num(overview["total_users"]),
      newUsers: num(overview["new_users"]),
      activeUsers: num(overview["active_users"]),
      uploads: num(overview["uploads"]),
      failedUploads: num(overview["failed_uploads"]),
      tailoredVersions: num(overview["tailored_versions"]),
      aiCalls: num(overview["ai_calls"]),
      aiErrors: num(overview["ai_errors"]),
      downloads: num(overview["downloads"]),
      clicks: num(overview["clicks"]),
      sessions: num(overview["sessions"]),
      totalTimeMs: num(overview["total_time_ms"]),
      warningEvents: num(overview["warning_events"]),
      errorEvents: num(overview["error_events"]),
      cvWarningCount: num(overview["cv_warning_count"]),
    },
    funnel: {
      uploads: num(funnel["uploads"]),
      profiles: num(funnel["profiles"]),
      jobDescriptions: num(funnel["job_descriptions"]),
      tailoredVersions: num(funnel["tailored_versions"]),
      pdfArtifacts: num(funnel["pdf_artifacts"]),
      downloads: num(funnel["downloads"]),
    },
    providers: (providerRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      provider: str(row["provider"]),
      kind: str(row["kind"]),
      calls: num(row["calls"]),
      errors: num(row["errors"]),
      promptTokens: num(row["prompt_tokens"]),
      completionTokens: num(row["completion_tokens"]),
      avgLatencyMs: num(row["avg_latency_ms"]),
      lastSeenAt: dateOrNull(row["last_seen_at"]),
    })),
    screens: (screenRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      path: str(row["path"]),
      views: num(row["views"]),
      uniqueUsers: num(row["unique_users"]),
      totalTimeMs: num(row["total_time_ms"]),
      clicks: num(row["clicks"]),
    })),
    actions: (actionRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      action: str(row["action"]),
      kind: str(row["kind"]),
      count: num(row["count"]),
      lastSeenAt: dateOrNull(row["last_seen_at"]),
    })),
    issues: (issueRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      kind: str(row["kind"]),
      status: str(row["status"]),
      detail: str(row["detail"]),
      count: num(row["count"]),
      lastSeenAt: dateOrNull(row["last_seen_at"]),
    })),
    topUsers: (topUserRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      email: str(row["email"]),
      name: nullableStr(row["name"]),
      joinedAt: dateOrNull(row["joined_at"]) ?? new Date(0),
      events: num(row["events"]),
      uploads: num(row["uploads"]),
      versions: num(row["versions"]),
      aiCalls: num(row["ai_calls"]),
      exports: num(row["exports"]),
      errors: num(row["errors"]),
      lastActiveAt: dateOrNull(row["last_active_at"]),
    })),
    uploadStats: (uploadRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      mimeType: str(row["mime_type"]),
      status: str(row["status"]),
      count: num(row["count"]),
      avgByteSize: num(row["avg_byte_size"]),
    })),
    trends: (trendRows as unknown as Array<Record<string, unknown>>).map((row) => ({
      day: dateOrNull(row["day"]) ?? new Date(0),
      pageViews: num(row["page_views"]),
      activeUsers: num(row["active_users"]),
      tailors: num(row["tailors"]),
      errors: num(row["errors"]),
      totalTimeMs: num(row["total_time_ms"]),
    })),
  };
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function str(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
