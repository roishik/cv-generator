"use client";

/**
 * VersionHistory — the Documents page detail view (spec §4.7).
 *
 * Left: a timeline list of every tailored version (label, JD, template, date,
 * provenance: generated / restored). Right: the selected version rendered in a
 * true-A4 CvPreview with metadata + actions — Open in workspace, Restore
 * (non-destructive → new version), Download PDF, Rename, Delete. A Compare
 * toggle shows two versions side-by-side.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  Download,
  RotateCcw,
  Trash2,
  Pencil,
  GitCompare,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CvPreview } from "@/components/product/CvPreview";
import { PreviewFrame } from "@/components/ui/cv-paper";
import type { CvData } from "@/lib/schemas/cv-data";
import type { VersionHistoryItem } from "@/app/(app)/tailor/actions";
import {
  getTailoredVersion,
  getDownloadUrl,
  restoreVersion,
  deleteVersion,
  renameVersion,
} from "@/app/(app)/tailor/actions";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function templateLabel(t: string): string {
  return t === "sidebar" ? "Type 1 · Sidebar" : "Type 2 · Clean";
}

export function VersionHistory({ versions: initial }: { versions: VersionHistoryItem[] }) {
  const router = useRouter();
  const [versions, setVersions] = React.useState(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const [compareId, setCompareId] = React.useState<string | null>(null);
  const [comparing, setComparing] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");

  // Lazy cache of loaded CvData per version.
  const [cache, setCache] = React.useState<
    Record<string, { data: CvData; templateId: "sidebar" | "clean"; artifactId: string | null }>
  >({});

  const load = React.useCallback(
    async (id: string) => {
      if (cache[id]) return;
      try {
        const doc = await getTailoredVersion(id);
        if (doc) {
          setCache((c) => ({
            ...c,
            [id]: {
              data: doc.cvData,
              templateId: doc.templateId,
              artifactId: doc.artifact?.id ?? null,
            },
          }));
        }
      } catch {
        /* non-fatal */
      }
    },
    [cache],
  );

  React.useEffect(() => {
    if (selectedId) {
      const id = selectedId;
      queueMicrotask(() => void load(id));
    }
  }, [selectedId, load]);
  React.useEffect(() => {
    if (comparing && compareId) {
      const id = compareId;
      queueMicrotask(() => void load(id));
    }
  }, [comparing, compareId, load]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  async function handleDownload(id: string) {
    const item = versions.find((v) => v.id === id);
    if (!item?.hasArtifact) {
      toast.error("No PDF yet — open in the workspace to generate one.");
      return;
    }
    setPendingId(id);
    try {
      const { url } = await getDownloadUrl(id);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(item.label ?? "tailored-cv").replace(/\s+/g, "-")}.pdf`;
      a.click();
    } catch (e) {
      toast.error((e as Error).message ?? "Download failed.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleRestore(id: string) {
    setPendingId(id);
    try {
      const res = await restoreVersion(id);
      toast.success("Restored as a new version.");
      router.refresh();
      router.push(`/workspace/${res.newId}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Restore failed.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(id: string) {
    const prev = versions;
    setVersions((vs) => vs.filter((v) => v.id !== id));
    if (selectedId === id) setSelectedId(prev.find((v) => v.id !== id)?.id ?? null);
    try {
      await deleteVersion(id);
      toast("Version deleted.", {
        action: { label: "Undo", onClick: () => setVersions(prev) },
      });
    } catch (e) {
      setVersions(prev);
      toast.error((e as Error).message ?? "Delete failed.");
    }
  }

  async function commitRename() {
    if (!selected) return;
    const label = renameValue.trim();
    if (!label) {
      setRenaming(false);
      return;
    }
    try {
      await renameVersion(selected.id, label);
      setVersions((vs) => vs.map((v) => (v.id === selected.id ? { ...v, label } : v)));
      toast.success("Renamed.");
    } catch (e) {
      toast.error((e as Error).message ?? "Rename failed.");
    } finally {
      setRenaming(false);
    }
  }

  const selData = selectedId ? cache[selectedId] : undefined;
  const cmpData = compareId ? cache[compareId] : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Versions list / timeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-foreground">
            {versions.length} version{versions.length === 1 ? "" : "s"}
          </h2>
          <button
            type="button"
            onClick={() => {
              setComparing((c) => !c);
              if (!comparing && !compareId) {
                setCompareId(versions.find((v) => v.id !== selectedId)?.id ?? null);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              comparing ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary",
            )}
            aria-pressed={comparing}
          >
            <GitCompare className="h-3.5 w-3.5" aria-hidden />
            Compare
          </button>
        </div>

        <ul className="space-y-1.5" aria-label="Version timeline">
          {versions.map((v) => {
            const isSelected = selectedId === v.id;
            const isCompare = comparing && compareId === v.id;
            const restored = v.parentId !== null;
            const title =
              v.label ??
              [v.jdTitle, v.jdCompany].filter(Boolean).join(" · ") ??
              `Version ${v.version}`;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (comparing && selectedId && v.id !== selectedId) setCompareId(v.id);
                    else setSelectedId(v.id);
                  }}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : isCompare
                        ? "border-[hsl(var(--ai))] bg-[hsl(var(--ai-bg))]/40"
                        : "border-border hover:border-primary/40",
                  )}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      v{v.version}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{fmtDate(v.createdAt)}</span>
                    <span aria-hidden>·</span>
                    <span>{templateLabel(v.templateId)}</span>
                    {restored && (
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium">
                        restored
                      </span>
                    )}
                    {v.hasArtifact && (
                      <span className="inline-flex items-center gap-0.5 text-spruce-700">
                        <Check className="h-3 w-3" aria-hidden /> PDF
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Detail / preview */}
      <div className="min-w-0">
        {!selected ? (
          <p className="text-[13px] text-muted-foreground">Select a version to preview it.</p>
        ) : (
          <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                {renaming ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename();
                        if (e.key === "Escape") setRenaming(false);
                      }}
                      className="h-8 w-56"
                      aria-label="Version name"
                    />
                    <Button size="icon" variant="ghost" onClick={commitRename} aria-label="Save name">
                      <Check className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setRenaming(false)} aria-label="Cancel rename">
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <h3 className="flex items-center gap-2 truncate text-[15px] font-semibold text-foreground">
                    {selected.label ?? `Version ${selected.version}`}
                    <button
                      type="button"
                      onClick={() => {
                        setRenameValue(selected.label ?? "");
                        setRenaming(true);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Rename version"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </h3>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/workspace/${selected.id}`}>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(selected.id)}
                  disabled={pendingId === selected.id}
                >
                  {pendingId === selected.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(selected.id)}
                  disabled={!selected.hasArtifact || pendingId === selected.id}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(selected.id)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                </Button>
              </div>
            </div>

            {/* Preview(s) */}
            <div className={cn("grid gap-4", comparing && "lg:grid-cols-2")}>
              <div>
                {comparing && (
                  <p className="mb-1.5 text-[11px] font-medium text-primary">
                    {selected.label ?? `Version ${selected.version}`}
                  </p>
                )}
                <PreviewFrame>
                  <div className="w-[794px] max-w-full">
                    {selData ? (
                      <CvPreview data={selData.data} templateId={selData.templateId} />
                    ) : (
                      <PreviewLoading />
                    )}
                  </div>
                </PreviewFrame>
              </div>

              {comparing && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-[hsl(var(--ai))]">
                    {compareId
                      ? versions.find((v) => v.id === compareId)?.label ??
                        `Version ${versions.find((v) => v.id === compareId)?.version}`
                      : "Pick a version to compare"}
                  </p>
                  <PreviewFrame>
                    <div className="w-[794px] max-w-full">
                      {cmpData ? (
                        <CvPreview data={cmpData.data} templateId={cmpData.templateId} />
                      ) : (
                        <PreviewLoading />
                      )}
                    </div>
                  </PreviewFrame>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="flex aspect-[794/1123] w-[794px] max-w-full items-center justify-center bg-white text-[13px] text-gray-400">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
    </div>
  );
}
