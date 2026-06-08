import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentCardGridSkeleton } from "@/components/ui/loading-skeletons";
import { DocumentList } from "@/components/product/DocumentList";

export const metadata = {
  title: "Dashboard — Tailor",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1280px] p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          heading="Dashboard"
          subheading="Your tailored CVs — ready to open, download, or reuse."
        />
        <Button asChild className="shrink-0">
          <Link href="/tailor">+ Tailor a CV</Link>
        </Button>
      </div>

      <div className="mt-8">
        <Suspense fallback={<DocumentCardGridSkeleton count={4} />}>
          <DocumentListContainer />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Server component that fetches tailored CVs.
 * Suspense boundary shows skeletons while fetching.
 */
async function DocumentListContainer() {
  // Dynamic import to avoid breaking build if DB is not running.
  // listTailoredVersions needs DB + auth — we gracefully handle errors.
  let versions: Array<{
    id: string;
    version: number;
    templateId: string;
    label: string | null;
    createdAt: string;
    hasArtifact: boolean;
  }> = [];
  let hasKnowledgeBase = false;

  try {
    const { listTailoredVersions, getWorkspaceBaseline } = await import("../tailor/actions");
    const [versionRows, baseline] = await Promise.all([
      listTailoredVersions(),
      getWorkspaceBaseline(),
    ]);
    versions = versionRows;
    hasKnowledgeBase = baseline.hasKnowledgeBase;
  } catch {
    // DB not running locally or first-run before migrations — show empty state.
    versions = [];
    hasKnowledgeBase = false;
  }

  if (versions.length === 0) {
    if (hasKnowledgeBase) {
      return (
        <EmptyState
          heading="Ready to tailor your first CV"
          description="Your profile is already built. Paste a job description in Tailor to generate your first one-page CV, or upload a newer resume to replace your profile."
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button asChild>
                <Link href="/tailor">Go to Tailor</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/onboarding">Upload a new resume</Link>
              </Button>
            </div>
          }
        />
      );
    }

    return (
      <EmptyState
        heading="Tailor your first CV"
        description="Upload a resume to build your profile, then paste a job description to get a tailored, one-page CV."
        action={
          <Button asChild>
            <Link href="/onboarding">Get started</Link>
          </Button>
        }
      />
    );
  }

  return <DocumentList versions={versions} />;
}
