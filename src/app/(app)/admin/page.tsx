import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  Clock,
  Download,
  FileText,
  MousePointerClick,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminUser } from "@/lib/admin/auth";
import {
  getAdminAnalyticsSummary,
  parseAdminDays,
  type AdminAnalyticsSummary,
} from "@/lib/admin/analytics";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin — Tailor",
};

type AdminPageProps = {
  searchParams?: Promise<{ days?: string | string[] | undefined }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const admin = await requireAdminUser();
  const params = (await searchParams) ?? {};
  const days = parseAdminDays(params.days);

  let summary: AdminAnalyticsSummary;
  try {
    summary = await getAdminAnalyticsSummary(days);
  } catch (e) {
    return (
      <div className="mx-auto max-w-[1280px] p-6 md:p-8">
        <PageHeader
          heading="Admin"
          subheading="Analytics dashboard"
          actions={<Badge variant="outline">{admin.email}</Badge>}
        />
        <div className="border-destructive/30 bg-destructive/10 mt-8 rounded-md border p-4">
          <p className="text-destructive text-sm font-medium">Could not load analytics.</p>
          <p className="text-muted-foreground mt-1 text-[13px]">{(e as Error).message}</p>
        </div>
      </div>
    );
  }

  const avgSessionSeconds =
    summary.overview.sessions > 0
      ? summary.overview.totalTimeMs / summary.overview.sessions / 1000
      : 0;
  const aiErrorRate =
    summary.overview.aiCalls > 0 ? (summary.overview.aiErrors / summary.overview.aiCalls) * 100 : 0;
  const gaConfigured = !!process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"];

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          eyebrow="Admin"
          heading="Product analytics"
          subheading={`${formatDate(summary.start)} - ${formatDate(summary.end)} · signed in as ${admin.email}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={gaConfigured ? "success" : "outline"}>
            GA4 {gaConfigured ? "enabled" : "not configured"}
          </Badge>
          <RangePicker active={days} />
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Overview metrics">
        <MetricCard
          icon={Users}
          label="Active users"
          value={formatNumber(summary.overview.activeUsers)}
          detail={`${formatNumber(summary.overview.totalUsers)} total · ${formatNumber(summary.overview.newUsers)} new`}
        />
        <MetricCard
          icon={Upload}
          label="Resume uploads"
          value={formatNumber(summary.overview.uploads)}
          detail={`${formatNumber(summary.overview.failedUploads)} failed`}
        />
        <MetricCard
          icon={FileText}
          label="Versions created"
          value={formatNumber(summary.overview.tailoredVersions)}
          detail={`${formatNumber(summary.funnel.pdfArtifacts)} PDFs rendered`}
        />
        <MetricCard
          icon={Brain}
          label="AI calls"
          value={formatNumber(summary.overview.aiCalls)}
          detail={`${formatPercent(aiErrorRate)} error rate`}
        />
        <MetricCard
          icon={Clock}
          label="Avg session"
          value={formatDuration(avgSessionSeconds)}
          detail={`${formatNumber(summary.overview.sessions)} sessions tracked`}
        />
        <MetricCard
          icon={MousePointerClick}
          label="Clicks"
          value={formatNumber(summary.overview.clicks)}
          detail={`${formatNumber(clicksPerSession(summary))} per session`}
        />
        <MetricCard
          icon={Download}
          label="Downloads"
          value={formatNumber(summary.overview.downloads)}
          detail="Successful PDF requests"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Issues"
          value={formatNumber(summary.overview.errorEvents)}
          detail={`${formatNumber(summary.overview.warningEvents + summary.overview.cvWarningCount)} warnings`}
        />
      </section>

      <section className="border-border bg-card rounded-md border p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionTitle icon={Activity} title="Product funnel" />
          <Badge variant="outline">{days} days</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          {[
            ["Uploads", summary.funnel.uploads],
            ["Profiles", summary.funnel.profiles],
            ["Job descriptions", summary.funnel.jobDescriptions],
            ["Tailored versions", summary.funnel.tailoredVersions],
            ["PDF artifacts", summary.funnel.pdfArtifacts],
            ["Downloads", summary.funnel.downloads],
          ].map(([label, value]) => (
            <div key={label} className="border-border bg-background rounded-md border p-3">
              <p className="text-muted-foreground text-[11px] font-medium uppercase">{label}</p>
              <p className="text-foreground mt-1 text-2xl font-semibold">
                {formatNumber(Number(value))}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DataSection icon={Brain} title="AI providers">
          <Table
            empty="No AI usage yet."
            headers={["Provider", "Use", "Calls", "Errors", "Tokens", "Avg latency"]}
            rows={summary.providers.map((row) => [
              providerLabel(row.provider),
              row.kind,
              formatNumber(row.calls),
              row.errors > 0 ? (
                <Badge key="errors" variant="destructive">
                  {row.errors}
                </Badge>
              ) : (
                "0"
              ),
              formatNumber(row.promptTokens + row.completionTokens),
              `${formatNumber(Math.round(row.avgLatencyMs / 1000))}s`,
            ])}
          />
        </DataSection>

        <DataSection icon={AlertTriangle} title="Errors and warnings">
          <Table
            empty="No tracked issues in this range."
            headers={["Type", "Status", "Detail", "Count", "Last seen"]}
            rows={summary.issues.map((row) => [
              row.kind,
              <Badge key="status" variant={row.status === "error" ? "destructive" : "warning"}>
                {row.status}
              </Badge>,
              row.detail,
              formatNumber(row.count),
              formatDateTime(row.lastSeenAt),
            ])}
          />
        </DataSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <DataSection icon={Clock} title="Screens by attention">
          <Table
            empty="Screen analytics will appear after users visit the app."
            headers={["Screen", "Views", "Users", "Time", "Clicks"]}
            rows={summary.screens.map((row) => [
              <code key="path" className="text-[12px]">
                {row.path}
              </code>,
              formatNumber(row.views),
              formatNumber(row.uniqueUsers),
              formatDuration(row.totalTimeMs / 1000),
              formatNumber(row.clicks),
            ])}
          />
        </DataSection>

        <DataSection icon={MousePointerClick} title="Actions and clicks">
          <Table
            empty="No action analytics yet."
            headers={["Action", "Event", "Count", "Last seen"]}
            rows={summary.actions.map((row) => [
              row.action,
              row.kind,
              formatNumber(row.count),
              formatDateTime(row.lastSeenAt),
            ])}
          />
        </DataSection>
      </div>

      <DataSection icon={Activity} title="Daily trend">
        <TrendBars rows={summary.trends} />
      </DataSection>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <DataSection icon={Users} title="Top users">
          <Table
            empty="No active users in this range."
            headers={[
              "User",
              "Events",
              "Uploads",
              "Versions",
              "AI",
              "Exports",
              "Errors",
              "Last active",
            ]}
            rows={summary.topUsers.map((row) => [
              <div key="user" className="min-w-[180px]">
                <p className="text-foreground font-medium">{row.email}</p>
                <p className="text-muted-foreground text-[11px]">
                  {row.name ?? "No name"} · joined {formatDate(row.joinedAt)}
                </p>
              </div>,
              formatNumber(row.events),
              formatNumber(row.uploads),
              formatNumber(row.versions),
              formatNumber(row.aiCalls),
              formatNumber(row.exports),
              row.errors > 0 ? (
                <Badge key="errors" variant="destructive">
                  {row.errors}
                </Badge>
              ) : (
                "0"
              ),
              formatDateTime(row.lastActiveAt),
            ])}
          />
        </DataSection>

        <DataSection icon={Upload} title="Upload formats">
          <Table
            empty="No uploads in this range."
            headers={["MIME type", "Status", "Count", "Avg size"]}
            rows={summary.uploadStats.map((row) => [
              <code key="mime" className="text-[12px]">
                {row.mimeType}
              </code>,
              row.status,
              formatNumber(row.count),
              formatBytes(row.avgByteSize),
            ])}
          />
        </DataSection>
      </div>

      <section className="border-border bg-secondary/50 rounded-md border p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="text-primary mt-0.5 h-4 w-4" aria-hidden />
          <div>
            <p className="text-foreground text-sm font-semibold">Privacy-safe event collection</p>
            <p className="text-muted-foreground mt-1 max-w-4xl text-[13px] leading-5">
              The dashboard stores aggregate metadata: provider IDs, statuses, timings, counts,
              normalized paths, MIME types, and size buckets. It intentionally avoids resume text,
              job descriptions, generated CV content, API keys, raw filenames, and uploaded file
              contents.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function RangePicker({ active }: { active: number }) {
  return (
    <div className="border-border bg-card inline-flex rounded-md border p-0.5">
      {[7, 30, 90].map((days) => (
        <Button
          key={days}
          asChild
          size="sm"
          variant={active === days ? "default" : "ghost"}
          className="h-7 px-3"
        >
          <Link href={`/admin?days=${days}`}>{days}d</Link>
        </Button>
      ))}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-border bg-card rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-[11px] font-medium uppercase">{label}</p>
        <Icon className="text-muted-foreground h-4 w-4" aria-hidden />
      </div>
      <p className="text-foreground mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground mt-1 text-[12px]">{detail}</p>
    </div>
  );
}

function DataSection({
  icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-md border p-4">
      <SectionTitle icon={icon} title={title} className="mb-4" />
      {children}
    </section>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  className,
}: {
  icon: LucideIcon;
  title: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon className="text-primary h-4 w-4" aria-hidden />
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
    </div>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-md border border-dashed p-6 text-center text-[13px]">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-[11px] uppercase">
            {headers.map((header) => (
              <th key={header} className="px-2 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-border/70 border-b last:border-0">
              {cells.map((cell, j) => (
                <td key={j} className="text-foreground px-2 py-2 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendBars({ rows }: { rows: AdminAnalyticsSummary["trends"] }) {
  if (rows.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-md border border-dashed p-6 text-center text-[13px]">
        No trend data yet.
      </div>
    );
  }
  const max = Math.max(...rows.map((row) => row.pageViews + row.tailors + row.errors), 1);
  return (
    <div className="flex min-h-[180px] items-end gap-2 overflow-x-auto pb-2">
      {rows.map((row) => {
        const total = row.pageViews + row.tailors + row.errors;
        const height = Math.max(8, Math.round((total / max) * 140));
        return (
          <div key={row.day.toISOString()} className="flex min-w-12 flex-col items-center gap-2">
            <div
              className="bg-secondary flex w-8 items-end rounded-sm"
              style={{ height: 148 }}
              title={`${formatDate(row.day)} · ${total} events`}
            >
              <div
                className="bg-primary w-full rounded-sm"
                style={{ height }}
                aria-label={`${formatDate(row.day)}: ${total} events`}
              />
            </div>
            <span className="text-muted-foreground text-[10px]">
              {row.day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function providerLabel(provider: string): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "google") return "Google";
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "mock") return "Mock";
  return provider;
}

function clicksPerSession(summary: AdminAnalyticsSummary): number {
  if (summary.overview.sessions === 0) return 0;
  return Math.round((summary.overview.clicks / summary.overview.sessions) * 10) / 10;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}m ${rem}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(value: Date | null): string {
  if (!value) return "-";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
