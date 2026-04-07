/**
 * EmptyDatasetsState
 *
 * Empty state component displayed when no datasets exist.
 * Two modes: Enter Objective (manual) or Initialize via API (automated).
 * Listens for backend spans and shows live trace feed when detected.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sparkles, Radio } from "lucide-react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import { listSpans, type Span } from "@/services/spans-api";
import { toast } from "sonner";
import { ObjectiveInputTab } from "./ObjectiveInputTab";
import { ApiInitializeTab, type Trace } from "./api-initialize-tab";
import { ALL_PROVIDERS } from "../spans-select-table";
import { tryParseJson } from "@/utils/modelUtils";
import { emitter } from "@/utils/eventEmitter";
import { uploadKnowledgeSourceHandler } from "@/lib/distri-finetune-tools/steps/knowledge-sources";
import type { KnowledgeSourceType } from "@/types/dataset-types";
import { FinetuneHero } from "./FinetuneHero";
import { WelcomeFlow, isOnboardingCompleted } from "@/components/onboarding/WelcomeFlow";

type TabType = "objective" | "api";

const isValidTab = (tab: string | null): tab is TabType => {
  return tab === "objective" || tab === "api";
};

const PATHWAYS: { tab: TabType; icon: typeof Sparkles; label: string; hint: string }[] = [
  {
    tab: "objective",
    icon: Sparkles,
    label: "Start from scratch",
    hint: "Just describe what you want",
  },
  {
    tab: "api",
    icon: Radio,
    label: "Route existing calls",
    hint: "Capture and enhance real traces",
  },
];

// Helper to read file as base64
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Transform a Span to a Trace for display
function spanToTrace(span: Span): Trace {
  const date = new Date(span.start_time_us / 1000);
  const time = date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);

  // Extract messages from attribute
  const attr = span.attribute as { input?: string; request?: string };
  const parsed = attr?.input ? tryParseJson(attr.input) : [];
  const msgArray = Array.isArray(parsed) ? parsed : [];

  // Transform messages with truncated content
  const messages = msgArray.map((msg) => ({
    role: msg.role || "unknown",
    content: msg.content,
  }));

  // Extract tools from the full request attribute
  const requestJson = attr?.request ? tryParseJson(attr.request) : null;
  const tools: unknown[] | undefined =
    Array.isArray(requestJson?.tools) && requestJson.tools.length > 0
      ? requestJson.tools
      : undefined;

  return {
    traceId: span.span_id,
    time,
    status: "CAPTURED",
    messages,
    tools,
    startTimeUs: span.start_time_us,
  };
}

export function EmptyDatasetsState() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { createDataset } = DatasetsConsumer();
  const { projectId, subscribe } = ProjectEventsConsumer();

  // Get initial tab from URL or default to "objective"
  const tabParam = searchParams.get("tab");
  const activeTab: TabType = isValidTab(tabParam) ? tabParam : "objective";

  // Support ?objective= and ?autoStart= params from homepage
  const objectiveParam = searchParams.get("objective");
  const autoStartParam = searchParams.get("autoStart");
  const [objective, setObjective] = useState(objectiveParam ?? "");

  // Clean up query params from URL after reading them
  useEffect(() => {
    if (objectiveParam || autoStartParam) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("objective");
        next.delete("autoStart");
        return next;
      }, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isCreating, setIsCreating] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !isOnboardingCompleted());

  const handleObjectiveChange = useCallback((value: string) => {
    setObjective(value);
  }, []);

  if (showWelcome) {
    return (
      <WelcomeFlow
        onComplete={() => setShowWelcome(false)}
        onPickObjective={() => {
          setSearchParams({ tab: "objective" }, { replace: true });
        }}
        onPickDocuments={() => {
          setSearchParams({ tab: "objective" }, { replace: true });
        }}
      />
    );
  }

  // Update URL when tab changes
  const handleTabChange = useCallback((tab: TabType) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  // Real trace feed data from API
  const [traces, setTraces] = useState<Trace[]>([]);
  const tracesRef = useRef<Trace[]>([]);
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());

  // Fetch recent model_call spans
  const fetchTraces = useCallback(async () => {
    if (!projectId) return;

    try {
      const response = await listSpans({
        projectId,
        params: {
          operationNames: ALL_PROVIDERS.join(","),
          limit: 10,
        },
      });

      const newTraces = response.data.map(spanToTrace);
      setTraces(newTraces);
      tracesRef.current = newTraces;
    } catch (error) {
      console.error("Failed to fetch traces:", error);
    }
  }, [projectId]);

  // Fetch traces on mount and when projectId changes
  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Subscribe to span events for real-time updates
  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = subscribe(
      "empty-state-trace-listener",
      () => {
        // Refetch traces when new span events arrive
        setTimeout(() => {
          fetchTraces();
        }, 2000);
      },
      (event) => {
        // Filter for model_call span_end events
        if (event.type === "Custom") {
          const customEvent = event as { event?: { type?: string; operation_name?: string } };
          return (
            customEvent.event?.type === "span_end" &&
            customEvent.event?.operation_name === "model_call"
          );
        }
        return false;
      }
    );

    return unsubscribe;
  }, [projectId, subscribe, fetchTraces]);

  const handleStartFinetune = async (files?: File[]) => {
    if (!objective.trim()) {
      toast.error("Please enter an objective first");
      return;
    }

    setIsCreating(true);
    try {
      // Auto-generate name from the first few words of the objective
      const finalName = objective.trim().split(/\s+/).slice(0, 5).join(" ");

      const dataset = await createDataset(finalName, objective.trim());

      // If files were uploaded, add them as knowledge sources
      if (files && files.length > 0) {
        // Emit generating event immediately so UI shows loading state
        emitter.emit("vllora_plan_generating", { workflowId: dataset.id });

        // Upload files as knowledge sources (processing happens async)
        for (const file of files) {
          const content = await readFileAsBase64(file);
          const type: KnowledgeSourceType = file.type === "application/pdf" ? "pdf" : "text";
          await uploadKnowledgeSourceHandler({
            workflow_id: dataset.id,
            name: file.name,
            type,
            content,
            mime_type: file.type,
          });
        }

        // Emit update so KnowledgeSourcesPanel refreshes
        emitter.emit("vllora_knowledge_source_updated", { workflowId: dataset.id });

        setIsCreating(false);
        navigate(`/finetune/${dataset.id}?autoGeneratePlan=true`);
      } else {
        setIsCreating(false);
        navigate(`/finetune/${dataset.id}`);
      }
    } catch (error) {
      console.error("Failed to create dataset:", error);
      toast.error("Failed to create workflow");
      setIsCreating(false);
    }
  };

  // Auto-start finetuning when arriving from homepage with autoStart=true
  const autoStartTriggered = useRef(false);
  useEffect(() => {
    if (autoStartParam === "true" && objectiveParam && !autoStartTriggered.current) {
      autoStartTriggered.current = true;
      handleStartFinetune();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-start px-6 pb-8 relative overflow-auto">

      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(var(--theme-500),0.08)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute top-[200px] left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(var(--theme-400),0.04)_0%,transparent_60%)] pointer-events-none blur-xl" />

      {/* Hero Section */}
      <div className="flex flex-col items-center text-center relative z-10 pt-[10vh] mb-8 max-w-xl">
        {/* Subtle badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[rgba(var(--theme-500),0.15)] bg-[rgba(var(--theme-500),0.05)] mb-6">
          <Sparkles className="w-3 h-3 text-[rgba(var(--theme-500),0.7)]" />
          <span className="text-[11px] font-medium text-[rgba(var(--theme-500),0.8)] tracking-wide uppercase">
            New Workflow
          </span>
        </div>

        <FinetuneHero />
      </div>

      {/* Pathway Toggle */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/20 border border-border/40 mb-8 relative z-10">
        {PATHWAYS.map((pathway) => {
          const isActive = activeTab === pathway.tab;
          return (
            <button
              key={pathway.tab}
              onClick={() => handleTabChange(pathway.tab)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-5 py-2.5 rounded-lg transition-all duration-200",
                isActive
                  ? "bg-background shadow-sm"
                  : "hover:bg-background/40"
              )}
            >
              <div className="flex items-center gap-1.5">
                <pathway.icon className={cn(
                  "w-3.5 h-3.5 transition-colors duration-200",
                  isActive ? "text-[rgb(var(--theme-500))]" : "text-muted-foreground/40"
                )} />
                <span className={cn(
                  "text-[13px] font-medium transition-colors duration-200",
                  isActive ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground/80"
                )}>
                  {pathway.label}
                </span>
              </div>
              <span className={cn(
                "text-[10px] transition-colors duration-200",
                isActive ? "text-muted-foreground/50" : "text-muted-foreground/25"
              )}>
                {pathway.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div
        className="w-full max-w-[min(56rem,90vw)] relative z-10 h-full"
      >
        {activeTab === "objective" ? (
          <ObjectiveInputTab
            objective={objective}
            onObjectiveChange={handleObjectiveChange}
            onStartFinetune={handleStartFinetune}
            isLoading={isCreating}
          />
        ) : (
          <ApiInitializeTab
            traces={clearedIds.size > 0 ? traces.filter(t => !clearedIds.has(t.traceId)) : traces}
            onClear={() => setClearedIds(new Set(traces.map(t => t.traceId)))}
          />
        )}
      </div>
    </div>
  );
}
