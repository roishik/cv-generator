import { OnboardingWizard } from "@/components/product/OnboardingWizard";
import { describeProvider } from "@/lib/ai/describe-provider";
import { listProviderKeys } from "@/app/(app)/settings/actions";
import { getEnv } from "@/env";

export const metadata = {
  title: "Get started — Tailor",
};

export default async function OnboardingPage() {
  const provider = describeProvider(getEnv().AI_PROVIDER);
  let keys: Awaited<ReturnType<typeof listProviderKeys>> = [];
  try {
    keys = await listProviderKeys();
  } catch {
    keys = [];
  }
  return <OnboardingWizard provider={provider} initialKeys={keys} />;
}
