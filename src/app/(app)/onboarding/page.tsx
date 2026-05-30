import { OnboardingWizard } from "@/components/product/OnboardingWizard";
import { describeProvider } from "@/lib/ai/describe-provider";
import { getEnv } from "@/env";

export const metadata = {
  title: "Get started — Tailor",
};

export default function OnboardingPage() {
  return <OnboardingWizard provider={describeProvider(getEnv().AI_PROVIDER)} />;
}
