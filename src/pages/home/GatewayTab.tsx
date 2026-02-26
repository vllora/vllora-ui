/**
 * GatewayTab
 *
 * Homepage tab for the AI Gateway product.
 * Shows hero, key features grid, browse models link, and provider setup grid.
 * Card styles, section labels, and spacing harmonize with FinetuneStudioTab.
 */

import { useState } from "react";
import {
  MessageSquare,
  BookOpen,
  ChevronRight,
  Activity,
  Plus,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ProviderKeysConsumer } from "@/contexts/ProviderKeysContext";
import { useProviderModal } from "@/contexts/ProviderModalContext";
import { CustomProviderDialog } from "@/components/settings/CustomProviderDialog";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { CurrentAppConsumer } from "@/lib";

interface GatewayTabProps {
  buildPath: (path: string, extraParams?: Record<string, string>) => string;
}

export function GatewayTab({ buildPath }: GatewayTabProps) {
  const { app_mode } = CurrentAppConsumer();
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-[50vw] mx-auto flex flex-col items-center">
      {/* Hero — mirrors FinetuneHero structure */}
      <div className="flex flex-col items-center text-center mb-10">
        <h1 className="text-[2.25rem] leading-[1.15] font-bold tracking-tight text-foreground mb-4">
          200+ models,{" "}
          <span className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent">
            one API
          </span>
        </h1>
        <p className="text-[15px] text-muted-foreground/60 mb-4">
          Route API calls through 200+ models. Chat, debug, and capture
          training data.
        </p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 text-foreground/50 text-[11px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--theme-500))]" />
          OpenAI-compatible API
        </div>
      </div>

      {/* Key Features — 3 col grid */}
      <div className="w-full space-y-3">
        <span className="text-[11px] font-semibold text-muted-foreground/40 tracking-widest uppercase block text-center">
          Key features
        </span>

        <div className="grid grid-cols-2 gap-3">
          {/* Chat */}
          <button
            onClick={() => navigate(buildPath("/chat"))}
            className="group flex flex-col gap-2.5 px-4 py-4 rounded-xl border border-border/40 bg-card/50 hover:border-[rgba(var(--theme-500),0.3)] hover:bg-[rgba(var(--theme-500),0.04)] transition-all duration-200 text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            </div>
            <div>
              <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors duration-200 block">
                Chat with 200+ Models
              </span>
              <span className="block text-[11px] text-muted-foreground/40 mt-1 leading-relaxed">
                GPT-4, Claude, Gemini — one unified interface.
              </span>
            </div>
          </button>

          {/* API Gateway & Debug */}
          <button
            onClick={() => navigate(buildPath("/chat", { tab: "traces" }))}
            className="group flex flex-col gap-2.5 px-4 py-4 rounded-xl border border-border/40 bg-card/50 hover:border-[rgba(var(--theme-500),0.3)] hover:bg-[rgba(var(--theme-500),0.04)] transition-all duration-200 text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            </div>
            <div>
              <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors duration-200 block">
                API Gateway & Debug
              </span>
              <span className="block text-[11px] text-muted-foreground/40 mt-1 leading-relaxed">
                Route calls, monitor traces, capture data.
              </span>
            </div>
          </button>
        </div>

        {/* Quick links */}
        <div className="flex items-center justify-center gap-2.5 pt-2">
          <button
            onClick={() => navigate(buildPath("/models"))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[rgba(var(--theme-500),0.2)] bg-[rgba(var(--theme-500),0.04)] text-[rgba(var(--theme-500),0.8)] text-[12px] font-medium hover:bg-[rgba(var(--theme-500),0.1)] hover:border-[rgba(var(--theme-500),0.35)] hover:text-[rgb(var(--theme-500))] transition-all duration-300"
          >
            Browse all models
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() =>
              window.open(
                app_mode === "vllora"
                  ? "https://vllora.dev/docs"
                  : "https://docs.langdb.ai/",
                "_blank"
              )
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[rgba(var(--theme-500),0.2)] bg-[rgba(var(--theme-500),0.04)] text-[rgba(var(--theme-500),0.8)] text-[12px] font-medium hover:bg-[rgba(var(--theme-500),0.1)] hover:border-[rgba(var(--theme-500),0.35)] hover:text-[rgb(var(--theme-500))] transition-all duration-300"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Documentation
          </button>
        </div>
      </div>

      {/* Provider Setup */}
      {app_mode === "vllora" && (
        <div className="w-full mt-10">
          <ProviderSetupSection />
        </div>
      )}
    </div>
  );
}

// ── Provider Setup ──

function ProviderSetupSection() {
  const { providers, loading: providersLoading, refetchProviders } =
    ProviderKeysConsumer();
  const { openProviderModal } = useProviderModal();
  const navigate = useNavigate();
  const [customProviderDialogOpen, setCustomProviderDialogOpen] =
    useState(false);

  if (providersLoading) {
    return (
      <div className="space-y-3">
        <span className="text-[11px] font-semibold text-muted-foreground/40 tracking-widest uppercase block">
          Configure your provider
        </span>
        <div className="animate-pulse grid grid-cols-3 gap-3">
          <div className="h-14 bg-muted/20 rounded-xl" />
          <div className="h-14 bg-muted/20 rounded-xl" />
          <div className="h-14 bg-muted/20 rounded-xl" />
        </div>
      </div>
    );
  }

  const predefinedProviders = providers.filter((p) => !p.is_custom);
  const openaiProvider = predefinedProviders.find(
    (p) => p?.name?.toLowerCase() === "openai"
  );
  const langdbProvider = predefinedProviders.find(
    (p) => p?.name?.toLowerCase() === "langdb"
  );
  const otherProviders = predefinedProviders.filter(
    (p) =>
      p?.name &&
      p.name.toLowerCase() !== "openai" &&
      p.name.toLowerCase() !== "langdb"
  );

  const orderedProviders = [openaiProvider, langdbProvider, ...otherProviders]
    .filter((p): p is (typeof providers)[0] => p !== undefined)
    .slice(0, 5);

  const handleProviderClick = (providerName: string) => {
    openProviderModal(providerName, () => {
      refetchProviders();
    });
  };

  return (
    <>
      <CustomProviderDialog
        open={customProviderDialogOpen}
        onOpenChange={setCustomProviderDialogOpen}
        onSuccess={refetchProviders}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground/40 tracking-widest uppercase">
            Configure your provider
          </span>
          <button
            onClick={() => navigate(`/settings?section=providers`)}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors duration-200"
          >
            View all
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {orderedProviders.map((provider) => (
            <button
              key={provider.name}
              onClick={() => handleProviderClick(provider.name)}
              className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-card/50 hover:border-[rgba(var(--theme-500),0.3)] hover:bg-[rgba(var(--theme-500),0.04)] transition-all duration-200 text-left"
            >
              <ProviderIcon
                provider_name={provider.name}
                className="w-5 h-5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors duration-200 block capitalize truncate">
                  {provider.name}
                </span>
                <span
                  className={`block text-[11px] mt-0.5 truncate ${
                    provider.has_credentials
                      ? "text-green-500/60"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {provider.has_credentials ? "Configured" : "Not configured"}
                </span>
              </div>
            </button>
          ))}

          <button
            onClick={() => setCustomProviderDialogOpen(true)}
            className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border/40 bg-card/50 hover:border-[rgba(var(--theme-500),0.3)] hover:bg-[rgba(var(--theme-500),0.04)] transition-all duration-200 text-left"
          >
            <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
              <Plus className="w-3 h-3 text-muted-foreground/60" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-muted-foreground/60 group-hover:text-foreground transition-colors duration-200 block truncate">
                Add Custom
              </span>
              <span className="block text-[11px] text-muted-foreground/40 mt-0.5 truncate">
                Custom endpoint
              </span>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
