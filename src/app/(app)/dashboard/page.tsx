import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = {
  title: "Dashboard — Tailor",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1280px] p-6 md:p-8">
      <PageHeader
        heading="Dashboard"
        subheading="Your tailored CVs and quick actions."
      />

      <div className="mt-8">
        <EmptyState
          heading="Tailor your first CV"
          description="Upload a resume to build your profile, then paste a job description to get a tailored, one-page CV."
          action={
            <Button asChild>
              <Link href="/tailor">Start tailoring</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
