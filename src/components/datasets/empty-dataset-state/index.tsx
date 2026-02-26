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
import { Database, FlaskConical, Sparkles, Radio } from "lucide-react";
import { DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import { listSpans, type Span } from "@/services/spans-api";
import { toast } from "sonner";
import { ObjectiveInputTab } from "./ObjectiveInputTab";
import { ApiInitializeTab } from "./ApiInitializeTab";
import type { Trace } from "./LiveTraceFeed";
import { ALL_PROVIDERS } from "../spans-select-table";
import { tryParseJson } from "@/utils/modelUtils";
import { emitter } from "@/utils/eventEmitter";
import { uploadKnowledgeSourceHandler } from "@/lib/distri-finetune-tools/steps/knowledge-sources";
import type { KnowledgeSourceType } from "@/types/dataset-types";
import { LucyAvatar } from "@/components/agent/lucy-agent";

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
    label: "Use existing API calls",
    hint: "Capture & enhance real traces",
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
  const { hasBackendSpans } = DatasetsUIConsumer();
  const { createDataset } = DatasetsConsumer();
  const { projectId, subscribe } = ProjectEventsConsumer();

  // Get initial tab from URL or default to "objective"
  const tabParam = searchParams.get("tab");
  const activeTab: TabType = isValidTab(tabParam) ? tabParam : "objective";

  const [objective, setObjective] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [transition, setTransition] = useState<{ datasetId: string; hasFiles: boolean } | null>(null);

  const handleObjectiveChange = useCallback((value: string) => {
    setObjective(value);
  }, []);

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
        emitter.emit("vllora_plan_generating", { datasetId: dataset.id });

        // Upload files as knowledge sources (processing happens async)
        for (const file of files) {
          const content = await readFileAsBase64(file);
          const type: KnowledgeSourceType = file.type === "application/pdf" ? "pdf" : "text";
          await uploadKnowledgeSourceHandler({
            dataset_id: dataset.id,
            name: file.name,
            type,
            content,
            mime_type: file.type,
          });
        }

        // Emit update so KnowledgeSourcesPanel refreshes
        emitter.emit("vllora_knowledge_source_updated", { datasetId: dataset.id });

        // Show transition screen before navigating
        // With files: 2.5s to let document processing start in background
        // Without files: 800ms brief animation, nothing to process
        setIsCreating(false);
        setTransition({ datasetId: dataset.id, hasFiles: true });
        setTimeout(() => {
          navigate(`/datasets/${dataset.id}?autoGeneratePlan=true`);
        }, 2500);
      } else {
        // Show transition screen before navigating
        setIsCreating(false);
        setTransition({ datasetId: dataset.id, hasFiles: false });
        setTimeout(() => {
          navigate(`/datasets/${dataset.id}`);
        }, 800);
      }
    } catch (error) {
      console.error("Failed to create dataset:", error);
      toast.error("Failed to create experiment");
      setIsCreating(false);
    }
  };

  // Show fallback "Continue" button if transition navigation hasn't happened after 5s
  const [showContinue, setShowContinue] = useState(false);
  useEffect(() => {
    if (!transition) return;
    const timer = setTimeout(() => setShowContinue(true), 5000);
    return () => clearTimeout(timer);
  }, [transition]);

  const handleSkipTransition = useCallback(() => {
    if (!transition) return;
    const url = transition.hasFiles
      ? `/datasets/${transition.datasetId}?autoGeneratePlan=true`
      : `/datasets/${transition.datasetId}`;
    navigate(url);
  }, [transition, navigate]);

  // Show onboarding transition before navigating to dataset detail
  if (transition) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <div className="flex flex-col items-center text-center max-w-md space-y-8">
          {/* Lucy introduction */}
          <LucyAvatar size="lg" animated />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              Meet Lucy, your finetune assistant
            </h2>
            <p className="text-muted-foreground">
              Lucy will guide you through preparing data, evaluating quality, and training your model.
            </p>
          </div>

          {/* Steps overview */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[rgba(var(--theme-500),0.15)] flex items-center justify-center">
                <Database className="w-4 h-4 text-[rgb(var(--theme-500))]" />
              </div>
              <span>Data</span>
            </div>
            <span className="text-border">→</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[rgba(var(--theme-500),0.15)] flex items-center justify-center">
                <FlaskConical className="w-4 h-4 text-[rgb(var(--theme-500))]" />
              </div>
              <span>Evaluation</span>
            </div>
            <span className="text-border">→</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[rgba(var(--theme-500),0.15)] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
              </div>
              <span>Finetune</span>
            </div>
          </div>

          {/* Loading indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--theme-500))] animate-pulse" />
            <span>{transition.hasFiles ? "Processing your documents..." : "Setting up your project..."}</span>
          </div>

          {/* Skip / Continue fallback */}
          {showContinue ? (
            <button
              onClick={handleSkipTransition}
              className="text-sm font-medium text-[rgb(var(--theme-500))] hover:underline"
            >
              Continue to dataset →
            </button>
          ) : (
            <button
              onClick={handleSkipTransition}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    );
  }

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
            New Experiment
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-[2.25rem] leading-[1.15] font-bold tracking-tight text-foreground mb-4">
          From idea to{" "}
          <span className="bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent">
            finetuned model
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-[15px] text-muted-foreground/60">
          Define the vision. We handle the pipeline.
        </p>
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
        className={cn(
          "w-full relative z-10 h-full",
          activeTab === "objective" ? "max-w-[640px]" : "max-w-6xl"
        )}
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
            hasBackendSpans={hasBackendSpans}
            traces={clearedIds.size > 0 ? traces.filter(t => !clearedIds.has(t.traceId)) : traces}
            onClear={() => setClearedIds(new Set(traces.map(t => t.traceId)))}
          />
        )}
      </div>
    </div>
  );
}
