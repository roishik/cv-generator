"use client";

/**
 * DocumentList — renders a grid of tailored CV cards.
 * Each card shows: label, template badge, date, status, and actions.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getDownloadUrl } from "@/app/(app)/tailor/actions";

interface VersionSummary {
  id: string;
  version: number;
  templateId: string;
  label: string | null;
  createdAt: string;
  hasArtifact: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template badge
// ─────────────────────────────────────────────────────────────────────────────

function TemplateBadge({ templateId }: { templateId: string }) {
  const label = templateId === "sidebar" ? "Type 1 · Sidebar" : "Type 2 · Clean";
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Document card thumbnail placeholder
// ─────────────────────────────────────────────────────────────────────────────

function CvThumbnail({ templateId }: { templateId: string }) {
  const isSidebar = templateId === "sidebar";
  return (
    <div
      className={cn(
        "flex aspect-[3/4] w-full items-center justify-center rounded-t-md overflow-hidden",
        isSidebar ? "bg-[#323B4C]" : "bg-white border-b border-border",
      )}
      aria-hidden
    >
      {isSidebar ? (
        <div className="flex w-full h-full">
          <div className="w-[28%] h-full bg-[#323B4C] flex flex-col items-center pt-3 gap-1.5 px-1">
            <div className="w-7 h-7 rounded-full bg-white/20" />
            <div className="w-full space-y-1 mt-2 px-1">
              {[70, 55, 65, 50].map((w, i) => (
                <div key={i} className="h-1 rounded-full bg-white/20" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
          <div className="flex-1 h-full bg-white flex flex-col pt-3 px-2 gap-1.5">
            <div className="h-2 w-4/5 rounded bg-[#323B4C]/20" />
            <div className="h-1.5 w-3/5 rounded bg-[#323B4C]/10" />
            <div className="mt-1 space-y-1">
              {[80, 65, 70, 60, 75].map((w, i) => (
                <div key={i} className="h-1 rounded bg-gray-200" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full h-full bg-white p-3 flex flex-col gap-1.5">
          <div className="text-center space-y-1 mb-2">
            <div className="h-2 w-2/3 mx-auto rounded bg-gray-900/20" />
            <div className="h-1.5 w-1/2 mx-auto rounded bg-gray-400/30" />
          </div>
          <div className="space-y-1">
            {[100, 80, 90, 70, 85, 75, 65].map((w, i) => (
              <div key={i} className="h-1 rounded bg-gray-200" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single card
// ─────────────────────────────────────────────────────────────────────────────

function DocumentCard({ version, onDelete }: { version: VersionSummary; onDelete: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const formattedDate = new Date(version.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const label = version.label ?? `CV v${version.version}`;

  function handleDownload() {
    if (!version.hasArtifact) {
      toast.error("No PDF artifact yet — open in workspace to generate one.");
      return;
    }
    startTransition(async () => {
      try {
        const { url } = await getDownloadUrl(version.id);
        // Trigger download.
        const a = document.createElement("a");
        a.href = url;
        a.download = `${label.replace(/\s+/g, "-")}.pdf`;
        a.click();
      } catch (e) {
        toast.error((e as Error).message ?? "Download failed");
      }
    });
  }

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-shadow duration-120 hover:shadow-md focus-within:shadow-md"
      aria-label={`CV: ${label}`}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden rounded-t-xl">
        <CvThumbnail templateId={version.templateId} />

        {/* PDF badge */}
        {version.hasArtifact && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-spruce-600 px-2 py-0.5 text-[10px] font-medium text-white shadow-xs">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            PDF ready
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13px] font-semibold text-foreground">
              {label}
            </h3>
            <p className="text-[11px] text-muted-foreground">{formattedDate}</p>
          </div>

          {/* Actions menu */}
          <div className="relative">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-border bg-card p-1 shadow-md"
                >
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-foreground hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                    onClick={() => { setMenuOpen(false); handleDownload(); }}
                    disabled={isPending}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download PDF
                  </button>
                  <button
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
                    onClick={() => { setMenuOpen(false); onDelete(version.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <TemplateBadge templateId={version.templateId} />

        {/* CTA buttons */}
        <div className="mt-auto flex gap-2 pt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="flex-1 text-[12px]"
          >
            <Link href={`/workspace/${version.id}`} aria-label={`Open ${label} in workspace`}>
              <ExternalLink className="mr-1.5 h-3 w-3" aria-hidden />
              Open
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-[12px]"
            onClick={handleDownload}
            disabled={isPending || !version.hasArtifact}
            aria-label={`Download ${label} as PDF`}
            title={!version.hasArtifact ? "No PDF yet — open in workspace first" : undefined}
          >
            <Download className="mr-1.5 h-3 w-3" aria-hidden />
            PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// List container
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentListProps {
  versions: VersionSummary[];
}

export function DocumentList({ versions: initial }: DocumentListProps) {
  const [versions, setVersions] = useState(initial);

  function handleDelete(id: string) {
    // Optimistic remove.
    setVersions((prev) => prev.filter((v) => v.id !== id));
    toast("Document removed", {
      action: {
        label: "Undo",
        onClick: () => setVersions(initial),
      },
    });
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="list"
      aria-label="Tailored CVs"
    >
      {versions.map((v) => (
        <div key={v.id} role="listitem">
          <DocumentCard version={v} onDelete={handleDelete} />
        </div>
      ))}
    </div>
  );
}
