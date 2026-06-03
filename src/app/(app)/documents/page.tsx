import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ContentSkeleton } from "@/components/ui/loading-skeletons";
import { VersionHistory } from "@/components/product/VersionHistory";
import type { VersionHistoryItem } from "../tailor/actions";

export const metadata = { title: "Documents — Lapel" };

/**
 * Documents / version history (spec §4.7) — every tailored output + revision,
 * with open / compare / restore / download per version.
 */
export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-[1280px] p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Documents"
          heading="Version history"
          subheading="Every tailored CV and revision — open, compare, restore, or download any version."
        />
        <Button asChild className="shrink-0">
          <Link href="/tailor">+ Tailor a CV</Link>
        </Button>
      </div>

      <div className="mt-8">
        <Suspense fallback={null}>
          <OriginalResumeCard />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<ContentSkeleton rows={6} />}>
          <VersionHistoryContainer />
        </Suspense>
      </div>
    </div>
  );
}

/** The user's original uploaded resume file (raw PDF/DOCX), if any. */
async function OriginalResumeCard() {
  let original: Awaited<
    ReturnType<typeof import("../tailor/actions").getOriginalResume>
  > = null;
  try {
    const { getOriginalResume } = await import("../tailor/actions");
    original = await getOriginalResume();
  } catch {
    original = null;
  }
  if (!original) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Original résumé
          </p>
          <p className="mt-0.5 truncate text-[14px] font-medium text-foreground">
            {original.filename}
          </p>
          <p className="text-[12px] text-muted-foreground">
            The file you uploaded — your profile was extracted from this.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <a href={original.url} target="_blank" rel="noopener noreferrer">
            View original
          </a>
        </Button>
      </div>
    </div>
  );
}

async function VersionHistoryContainer() {
  let versions: VersionHistoryItem[] = [];
  try {
    const { listVersionHistory } = await import("../tailor/actions");
    versions = await listVersionHistory();
  } catch {
    versions = [];
  }

  if (versions.length === 0) {
    return (
      <EmptyState
        heading="Your tailored CVs will live here"
        description="Tailor a CV to a job description and every version you generate or edit is kept here."
        action={
          <Button asChild>
            <Link href="/tailor">Tailor your first CV</Link>
          </Button>
        }
      />
    );
  }

  return <VersionHistory versions={versions} />;
}
