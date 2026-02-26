/**
 * GatewayTab
 *
 * Homepage tab for the AI Gateway product.
 * Shows hero, key features (Chat, API Gateway, Docs), and provider setup.
 */

import { useState } from "react";
import {
  MessageSquare,
  BookOpen,
  ChevronRight,
  Activity,
  Plus,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <>
      {/* Hero */}
      <div className="max-w-xl flex flex-col items-center">
        <h1 className="text-[2.25rem] leading-[1.15] font-bold tracking-tight text-foreground mb-4">
          One interface.{" "}
          <span className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent">
            Every model.
          </span>
        </h1>
        <p className="text-[15px] text-muted-foreground/70 mb-4 max-w-md leading-relaxed">
          Route API calls through 200+ models. Chat, debug, and capture training
          data — all in one place.
        </p>
        <div className="flex items-center gap-1.5 mb-8 text-muted-foreground/50">
          <Radio className="w-3.5 h-3.5" />
          <span className="text-[12px] font-medium">
            OpenAI-compatible API
          </span>
        </div>
        <Button
          onClick={() => navigate(buildPath("/chat"))}
          className="bg-[rgba(var(--theme-500),0.7)] hover:bg-[rgba(var(--theme-500),0.85)] text-white gap-2 px-6 h-10 rounded-xl text-[13px] font-semibold shadow-sm hover:shadow-[0_0_24px_rgba(var(--theme-500),0.2)] transition-all duration-200"
        >
          <MessageSquare className="w-4 h-4" />
          Open Chat
        </Button>
      </div>

      {/* Key Features + Provider Setup (below hero) */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-16 mt-16">
        {/* Key Features */}
        <div>
          <span className="text-[11px] font-semibold text-muted-foreground/40 tracking-widest uppercase block mb-6">
            Key features
          </span>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Chat */}
            <Card
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate(buildPath("/chat"))}
            >
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-sm">Chat with 200+ Models</h3>
                </div>
                <p className="text-[13px] text-muted-foreground/60 leading-relaxed">
                  Talk to GPT-4, Claude, Gemini, and more through a unified
                  interface.
                </p>
              </CardContent>
            </Card>

            {/* API Gateway & Debug */}
            <Card
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate(buildPath("/chat", { tab: "traces" }))}
            >
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <Activity className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-sm">API Gateway & Debug</h3>
                </div>
                <p className="text-[13px] text-muted-foreground/60 leading-relaxed">
                  Route API calls through vLLora. Monitor traces, debug issues,
                  capture training data.
                </p>
              </CardContent>
            </Card>

            {/* Documentation */}
            <Card
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() =>
                window.open(
                  app_mode === "vllora"
                    ? "https://vllora.dev/docs"
                    : "https://docs.langdb.ai/",
                  "_blank"
                )
              }
            >
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <BookOpen className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-sm">Documentation</h3>
                </div>
                <p className="text-[13px] text-muted-foreground/60 leading-relaxed">
                  Guides, API reference, and examples to get the most out of{" "}
                  {app_mode === "vllora" ? "vLLora" : "LangDB"}.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Provider Setup */}
        {app_mode === "vllora" && <ProviderSetupSection />}
      </div>
    </>
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
      <div>
        <h2 className="text-xl font-bold mb-6">Configure your provider</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-muted/50 rounded-lg" />
          <div className="h-16 bg-muted/50 rounded-lg" />
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

      <div>
        <div className="flex flex-row items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Configure your provider</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/settings?section=providers`)}
            className="text-xs"
          >
            View all
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {orderedProviders.map((provider) => (
            <div
              key={provider.name}
              className="border border-border rounded-lg p-3 hover:bg-accent/50 transition-colors cursor-pointer group"
              onClick={() => handleProviderClick(provider.name)}
            >
              <div className="flex items-center gap-3">
                <ProviderIcon
                  provider_name={provider.name}
                  className="w-5 h-5"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm capitalize truncate">
                    {provider.name}
                  </p>
                  <span
                    className={`text-xs ${
                      provider.has_credentials
                        ? "text-green-600 dark:text-green-400"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}
                  >
                    {provider.has_credentials ? "Configured" : "Not configured"}
                  </span>
                </div>
              </div>
            </div>
          ))}
          <div
            className="border border-dashed border-border rounded-lg p-3 hover:bg-accent/50 hover:border-solid transition-colors cursor-pointer group"
            onClick={() => setCustomProviderDialogOpen(true)}
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                <Plus className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  Add Custom
                </p>
                <span className="text-xs text-muted-foreground">
                  Custom endpoint
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
