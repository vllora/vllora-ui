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
import { Database, FlaskConical, Sparkles } from "lucide-react";
import { DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { ProjectEventsConsumer } from "@/contexts/project-events";
import { listSpans, type Span } from "@/services/spans-api";
import { createSampleDataset, getDefaultSampleDataset } from "@/services/sample-datasets";
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
  const [datasetName, setDatasetName] = useState("");
  const [hasEditedName, setHasEditedName] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [transition, setTransition] = useState<{ datasetId: string; hasFiles: boolean } | null>(null);

  // Auto-generate dataset name suggestion from objective (unless user manually edited)
  const handleObjectiveChange = useCallback((value: string) => {
    setObjective(value);
    if (!hasEditedName) {
      const words = value.trim().split(/\s+/).slice(0, 5).join(" ");
      setDatasetName(words.length > 40 ? words.slice(0, 40) : words);
    }
  }, [hasEditedName]);

  const handleDatasetNameChange = useCallback((value: string) => {
    setDatasetName(value);
    setHasEditedName(true);
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
      // Use user-edited name or fall back to auto-generated from objective
      const finalName = datasetName.trim() || objective.trim().split(/\s+/).slice(0, 5).join(" ");

      const dataset = await createDataset(finalName, objective.trim());

      // If files were uploaded, add them as knowledge sources
      if (files && files.length > 0) {
        // Emit generating event immediately so UI shows loading state
        emitter.emit("vllora_setup_plan_generating", { datasetId: dataset.id });

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
      toast.error("Failed to create dataset");
      setIsCreating(false);
    }
  };

  const handleLoadSample = async () => {
    setIsLoadingSample(true);
    try {
      const sampleConfig = getDefaultSampleDataset();
      const result = await createSampleDataset(sampleConfig);
      toast.success(`Created sample dataset with ${result.recordCount} records`);
      navigate(`/datasets/${result.datasetId}`);
    } catch (error) {
      console.error("Failed to load sample dataset:", error);
      toast.error("Failed to load sample dataset");
    } finally {
      setIsLoadingSample(false);
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
    <div className="flex-1 flex flex-col items-center justify-start pt-16 p-8 relative overflow-auto">

      {/* Header - always centered */}
      <div className="flex flex-col items-center text-center relative z-10 mb-8">
        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-foreground">
          What is the objective of{" "}
          <span className="text-[rgb(var(--theme-500))]">your dataset?</span>
        </h1>
        <p className="text-muted-foreground text-lg">
          Define your goal to let our AI agent optimize your data enhancement strategy.
        </p>
      </div>

      {/* Tab Switcher - always centered */}
      <div className="inline-flex items-center p-1 rounded-full bg-muted/50 border border-border mb-8 relative z-10">
        <button
          onClick={() => handleTabChange("objective")}
          className={cn(
            "px-6 py-2 rounded-full text-sm font-medium transition-all",
            activeTab === "objective"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Enter Objective
        </button>
        <button
          onClick={() => handleTabChange("api")}
          className={cn(
            "px-6 py-2 rounded-full text-sm font-medium transition-all",
            activeTab === "api"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Initialize via API
        </button>
      </div>

      {/* Tab Content - width varies by tab */}
      <div
        className={cn(
          "w-full relative z-10 h-full",
          activeTab === "objective" ? "max-w-3xl" : "max-w-6xl"
        )}
      >
        {activeTab === "objective" ? (
          <ObjectiveInputTab
            objective={objective}
            onObjectiveChange={handleObjectiveChange}
            datasetName={datasetName}
            onDatasetNameChange={handleDatasetNameChange}
            onStartFinetune={handleStartFinetune}
            onLoadSample={handleLoadSample}
            isLoading={isCreating}
            isLoadingSample={isLoadingSample}
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
