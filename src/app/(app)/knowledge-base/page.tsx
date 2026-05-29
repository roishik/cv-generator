import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { KnowledgeBaseEditor } from "@/components/product/KnowledgeBaseEditor";
import type { EditableKnowledgeBase } from "./schema";

export const metadata = { title: "Profile — Lapel" };

/**
 * Knowledge-base editor page (spec §4.5) — the durable source of truth.
 * Loads the user's KB into the editable shape; empty state nudges onboarding.
 */
export default async function KnowledgeBasePage() {
  let hasKb = false;
  let data: EditableKnowledgeBase | null = null;

  try {
    const { getKnowledgeBase } = await import("./actions");
    const loaded = await getKnowledgeBase();
    hasKb = loaded.hasKnowledgeBase;
    data = loaded.data;
  } catch {
    hasKb = false;
  }

  return (
    <div className="mx-auto max-w-[900px] p-6 md:p-8">
      <PageHeader
        eyebrow="Profile"
        heading="Knowledge base"
        subheading="The durable, truthful superset of your experience. Tailoring only ever selects from what's here — it never invents."
      />

      <div className="mt-8">
        {hasKb && data ? (
          <KnowledgeBaseEditor initial={data} />
        ) : (
          <EmptyState
            heading="Build your profile first"
            description="Upload a resume and we'll extract your experience into an editable knowledge base."
            action={
              <Button asChild>
                <Link href="/onboarding">Upload a resume</Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
