/**
 * HomePage
 *
 * Landing page with two tabs: Finetune Studio and AI Gateway.
 * Each tab is its own component for maintainability.
 */

import { useState } from "react";
import { Sparkles, FlaskConical, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { FinetuneStudioTab } from "./FinetuneStudioTab";
import { GatewayTab } from "./GatewayTab";

// ── Data ──

type HomeTab = "finetune" | "gateway";

const HOME_TABS: {
  tab: HomeTab;
  icon: typeof Sparkles;
  label: string;
  hint: string;
}[] = [
  {
    tab: "finetune",
    icon: FlaskConical,
    label: "Finetune Studio",
    hint: "Build custom AI models",
  },
  {
    tab: "gateway",
    icon: Radio,
    label: "LLM Gateway",
    hint: "Route & monitor 200+ models",
  },
];

// ── Page ──

export function HomePage() {
  const { currentProjectId, isDefaultProject, project_id_from } =
    ProjectsConsumer();
  const [activeTab, setActiveTab] = useState<HomeTab>("finetune");

  // Helper to build project-scoped navigation paths
  const buildPath = (
    path: string,
    extraParams?: Record<string, string>
  ) => {
    const params = new URLSearchParams();
    if (extraParams)
      Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
    if (
      currentProjectId &&
      !isDefaultProject(currentProjectId) &&
      project_id_from === "query_string"
    ) {
      params.set("project_id", currentProjectId);
    }
    const qs = params.toString();
    return `${path}${qs ? "?" + qs : ""}`;
  };

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full">
      {/* Hero area with tab toggle */}
      <div className="relative flex flex-col items-center text-center px-6 pt-[6vh] pb-8">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(var(--theme-500),0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="absolute top-[200px] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(var(--theme-400),0.04)_0%,transparent_60%)] pointer-events-none blur-xl" />

        <div className="relative z-10 flex flex-col items-center w-full">
          {/* Tab toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/20 border border-border/40 mb-8">
            {HOME_TABS.map((tab) => {
              const isActive = activeTab === tab.tab;
              return (
                <button
                  key={tab.tab}
                  onClick={() => setActiveTab(tab.tab)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-6 py-2.5 rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-background shadow-sm"
                      : "hover:bg-background/40"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <tab.icon
                      className={cn(
                        "w-3.5 h-3.5 transition-colors duration-200",
                        isActive
                          ? "text-[rgb(var(--theme-500))]"
                          : "text-muted-foreground/40"
                      )}
                    />
                    <span
                      className={cn(
                        "text-[13px] font-medium transition-colors duration-200",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground/50 hover:text-muted-foreground/80"
                      )}
                    >
                      {tab.label}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] transition-colors duration-200",
                      isActive
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground/25"
                    )}
                  >
                    {tab.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === "finetune" ? (
            <FinetuneStudioTab />
          ) : (
            <GatewayTab buildPath={buildPath} />
          )}
        </div>
      </div>
    </section>
  );
}
