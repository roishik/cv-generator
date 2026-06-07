import { TailorWorkspace, type TailorWorkspaceInitial } from "@/components/product/TailorWorkspace";
import { describeProvider } from "@/lib/ai/describe-provider";
import { getEnv } from "@/env";

export const metadata = { title: "Tailor — Lapel" };

/**
 * The "new tailor" entry. Loads the user's baseline CvData so the preview is
 * never blank, then hands off to the persistent split-pane workspace.
 */
export default async function TailorPage() {
  let initial: TailorWorkspaceInitial = {
    cvDocumentId: null,
    hasKnowledgeBase: false,
    baseline: null,
    tailored: null,
    templateId: "sidebar",
    diff: null,
    truthfulness: null,
    warnings: [],
    fitAssessment: null,
    hasArtifact: false,
    artifactId: null,
    serverFits: null,
    label: "Untitled draft",
    providerLabel: describeProvider(getEnv().AI_PROVIDER).label,
  };

  try {
    const { getWorkspaceBaseline } = await import("./actions");
    const b = await getWorkspaceBaseline();
    initial = {
      ...initial,
      hasKnowledgeBase: b.hasKnowledgeBase,
      baseline: b.baseline,
      templateId: b.templateId,
    };
  } catch {
    // DB unavailable / first run — render the empty workspace gracefully.
  }

  return (
    <div className="h-full">
      <TailorWorkspace initial={initial} />
    </div>
  );
}
