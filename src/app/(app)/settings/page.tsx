import { PageHeader } from "@/components/ui/page-header";
import { ByokKeysPanel } from "@/components/product/ByokKeysPanel";
import { listProviderKeys } from "./actions";
import { describeProvider } from "@/lib/ai/describe-provider";
import { getEnv } from "@/env";

export const metadata = {
  title: "Settings — Tailor",
};

export default async function SettingsPage() {
  const keys = await listProviderKeys();
  const provider = describeProvider(getEnv().AI_PROVIDER);

  return (
    <div className="mx-auto max-w-[768px] p-6 md:p-8">
      <PageHeader
        heading="Settings"
        subheading="Manage your API keys, appearance, and account."
      />

      <div className="mt-8 space-y-10">
        {/* BYOK */}
        <section>
          <h2 className="mb-1 text-[15px] font-semibold text-foreground">
            API Keys
          </h2>
          <p className="mb-5 text-[13px] text-muted-foreground">
            Bring your own AI key. Keys are encrypted at rest with AES-256-GCM
            and never logged or returned in plaintext.
          </p>
          <ByokKeysPanel initialKeys={keys} provider={provider} />
        </section>
      </div>
    </div>
  );
}
