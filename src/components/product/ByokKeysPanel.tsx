"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, EyeOff, Trash2, Shield, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { ProviderKeyInfo } from "@/app/(app)/settings/actions";
import {
  saveProviderKey,
  deleteProviderKey,
  setActiveProvider,
} from "@/app/(app)/settings/actions";
import type { ProviderDescription } from "@/lib/ai/describe-provider";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "Begins with sk-ant-…",
    models: ["claude-sonnet-4-6", "claude-opus-4-5", "claude-haiku-3-5"],
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "Begins with sk-…",
    models: ["gpt-5.4", "gpt-4o", "gpt-4o-mini"],
  },
  {
    id: "google",
    label: "Google",
    hint: "Begins with AIza…",
    models: ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "Begins with sk-…",
    models: ["deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
  },
] as const;

type ProviderId = "anthropic" | "openai" | "google" | "deepseek";

// ─────────────────────────────────────────────────────────────────────────────
// Mock active badge
// ─────────────────────────────────────────────────────────────────────────────

function ProviderBadge({
  provider,
  activeKey,
}: {
  provider: ProviderDescription;
  activeKey?: ProviderKeyInfo;
}) {
  const activeMeta = PROVIDERS.find((p) => p.id === activeKey?.provider);
  if (activeMeta && activeKey?.last4) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-spruce-200 bg-spruce-50 p-4"
        role="status"
        aria-label={`${activeMeta.label} provider active`}
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-spruce-600" aria-hidden />
        <div>
          <p className="text-[13px] font-medium text-spruce-700">
            {activeMeta.label} is your active provider
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Tailor uses this key to extract resumes, edit your profile, and tailor CVs.
          </p>
        </div>
      </div>
    );
  }
  if (provider.isMock) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-amber-100 bg-[hsl(var(--ai-bg))] p-4"
        role="status"
        aria-label="Mock provider active"
      >
        <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden />
        <div>
          <p className="text-[13px] font-medium text-ai">Mock provider active</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Running in local dev mode with{" "}
            <code className="font-mono text-[11px]">AI_PROVIDER=mock</code>. No
            real AI calls — deterministic output, zero spend. Add a key below to
            use a real provider.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
      role="status"
      aria-label="Managed free starter provider"
    >
      <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <div>
        <p className="text-[13px] font-medium text-amber-800">
          Free starter uses {provider.name} · {provider.model}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Add your own key below and set it active to keep extracting, editing,
          and tailoring after the included free uses.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider card
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: (typeof PROVIDERS)[number];
  keyInfo: ProviderKeyInfo | undefined;
  onSaved: (info: ProviderKeyInfo) => void;
  onDeleted: (providerId: ProviderId) => void;
  onSetActive: (providerId: ProviderId) => void;
}

function ProviderCard({
  provider,
  keyInfo,
  onSaved,
  onDeleted,
  onSetActive,
}: ProviderCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasSavedKey = !!keyInfo?.last4;

  function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Paste your API key before saving.");
      return;
    }
    startTransition(async () => {
      const result = await saveProviderKey(provider.id, apiKey);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to save key");
      } else {
        toast.success(`${provider.label} key saved and validated`);
        setApiKey("");
        onSaved({
          provider: provider.id,
          last4: apiKey.slice(-4),
          validatedAt: new Date().toISOString(),
          isActive: false,
        });
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProviderKey(provider.id);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to remove key");
      } else {
        toast.success(`${provider.label} key removed`);
        onDeleted(provider.id);
      }
    });
  }

  function handleSetActive() {
    startTransition(async () => {
      const result = await setActiveProvider(provider.id);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to set active provider");
      } else {
        toast.success(`${provider.label} set as active provider`);
        onSetActive(provider.id);
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 transition-shadow duration-120",
        keyInfo?.isActive && "ring-1 ring-primary",
      )}
      aria-label={`${provider.label} API key`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-foreground">
            {provider.label}
          </span>
          {keyInfo?.isActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-spruce-100 px-2 py-0.5 text-[11px] font-medium text-spruce-700">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Active
            </span>
          )}
        </div>

        {hasSavedKey && (
          <div className="flex items-center gap-2">
            {!keyInfo?.isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[12px]"
                onClick={handleSetActive}
                disabled={isPending}
                aria-label={`Set ${provider.label} as active provider`}
              >
                Set active
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              disabled={isPending}
              aria-label={`Remove ${provider.label} key`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {/* Key status / input */}
      {hasSavedKey ? (
        <div className="flex items-center gap-3 rounded-md bg-secondary px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-spruce-600" aria-hidden />
          <code className="font-mono text-[12px] text-muted-foreground">
            ●●●●●●●●●●●●●●●●●●●●{keyInfo?.last4}
          </code>
          {keyInfo?.validatedAt && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              Verified {new Date(keyInfo.validatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider.hint}
              className="pr-10 font-mono text-[13px]"
              aria-label={`${provider.label} API key`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || !apiKey.trim()}
            className="w-full"
            aria-label={`Save and verify ${provider.label} key`}
          >
            {isPending ? "Verifying…" : "Save & verify"}
          </Button>
        </div>
      )}

      {/* Security notice */}
      <div className="mt-3 flex items-start gap-1.5">
        <Shield className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-[11px] leading-4 text-muted-foreground">
          Encrypted at rest · Never logged · Never sent to us in plaintext
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

interface ByokKeysPanelProps {
  initialKeys: ProviderKeyInfo[];
  provider: ProviderDescription;
}

export function ByokKeysPanel({ initialKeys, provider }: ByokKeysPanelProps) {
  const [keys, setKeys] = useState<ProviderKeyInfo[]>(initialKeys);

  function handleSaved(info: ProviderKeyInfo) {
    setKeys((prev) => {
      const without = prev.filter((k) => k.provider !== info.provider);
      return [...without, info];
    });
  }

  function handleDeleted(providerId: ProviderId) {
    setKeys((prev) => prev.filter((k) => k.provider !== providerId));
  }

  function handleSetActive(providerId: ProviderId) {
    setKeys((prev) =>
      prev.map((k) => ({ ...k, isActive: k.provider === providerId })),
    );
  }

  const hasAnyKey = keys.length > 0;
  const activeKey = keys.find((k) => k.isActive);

  return (
    <div className="space-y-4">
      <ProviderBadge provider={provider} activeKey={activeKey} />

      {/* Provider cards */}
      <div className="space-y-3" role="list" aria-label="Configured AI providers">
        {PROVIDERS.map((provider) => (
          <div key={provider.id} role="listitem">
            <ProviderCard
              provider={provider}
              keyInfo={keys.find((k) => k.provider === provider.id)}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onSetActive={handleSetActive}
            />
          </div>
        ))}
      </div>

      {/* Active provider hint */}
      {!hasAnyKey && (
        <p className="text-center text-[12px] text-muted-foreground">
          Add a key above to tailor CVs with a real AI provider.
        </p>
      )}
    </div>
  );
}
