import { notFound } from "next/navigation";
import { TailorWorkspace, type TailorWorkspaceInitial } from "@/components/product/TailorWorkspace";
import type { CvData } from "@/lib/schemas/cv-data";
import type { StructuredDiff } from "@/lib/tailor/diff";
import type { TruthfulnessReport } from "@/lib/ai/truthfulness";
import { describeProvider } from "@/lib/ai/describe-provider";
import { getEnv } from "@/env";

export const metadata = { title: "Workspace — Lapel" };

/**
 * Open an existing tailored version in the persistent split-pane workspace.
 * Loads the tailored CvData + diff + truthfulness + artifact and the user's
 * baseline (for the Baseline↔Tailored toggle).
 */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { getTailoredVersion, getWorkspaceBaseline } = await import("../../tailor/actions");
  const [doc, base] = await Promise.all([
    getTailoredVersion(id).catch(() => null),
    getWorkspaceBaseline().catch(() => null),
  ]);
  if (!doc) notFound();

  const initial: TailorWorkspaceInitial = {
    cvDocumentId: doc.id,
    hasKnowledgeBase: base?.hasKnowledgeBase ?? true,
    baseline: base?.baseline ?? (doc.cvData as CvData),
    tailored: doc.cvData as CvData,
    templateId: doc.templateId,
    diff: (doc.diff as StructuredDiff) ?? null,
    truthfulness: (doc.truthfulness as TruthfulnessReport) ?? null,
    warnings: doc.warnings ?? [],
    hasArtifact: !!doc.artifact,
    artifactId: doc.artifact?.id ?? null,
    serverFits: doc.artifact ? true : null,
    label: doc.label,
    providerLabel: describeProvider(getEnv().AI_PROVIDER).label,
  };

  return (
    <div className="h-full">
      <TailorWorkspace initial={initial} />
    </div>
  );
}
