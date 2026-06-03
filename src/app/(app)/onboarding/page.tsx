import { OnboardingWizard } from "@/components/product/OnboardingWizard";
import { describeProvider } from "@/lib/ai/describe-provider";
import { listProviderKeys } from "@/app/(app)/settings/actions";
import { getEnv } from "@/env";

export const metadata = {
  title: "Get started — Tailor",
};

export default async function OnboardingPage() {
  const provider = describeProvider(getEnv().AI_PROVIDER);
  // A real provider is "ready" when its env is non-mock AND a key is on file
  // (or it's mock, which needs none). Drives the key-aware Step 3.
  let keyReady = provider.isMock;
  if (!provider.isMock) {
    try {
      const keys = await listProviderKeys();
      keyReady = keys.some((k) => k.provider === provider.provider && !!k.last4);
    } catch {
      keyReady = false;
    }
  }
  return <OnboardingWizard provider={provider} keyReady={keyReady} />;
}
