/**
 * TraceAnalysisContext
 *
 * Manages trace analysis state for the trace-informed curriculum feature.
 * Provides per-topic trace metrics, grader dimensions, and seed query data
 * to child components (topics view, grader view, records view).
 *
 * Only populated when the workflow has trace analysis results (combined mode).
 * Returns null/empty for PDF-only or trace-only workflows.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type {
  TraceAnalysisResult,
  TopicTraceMetrics,
  GraderDimension,
} from "@/types/dataset-types";
import { getTraceAnalysis } from "@/services/finetune-api";
import { toast } from "sonner";

// ============================================================================
// Hook
// ============================================================================

function useTraceAnalysis({ workflowId }: { workflowId: string }) {
  const [traceAnalysis, setTraceAnalysis] = useState<TraceAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasTraces, setHasTraces] = useState(false);

  const loadTraceAnalysis = useCallback(async () => {
    if (!workflowId) return;
    setIsLoading(true);
    try {
      const result = await getTraceAnalysis(workflowId);
      setTraceAnalysis(result);
      setHasTraces(result !== null);
    } catch {
      // 404 or network error — no trace analysis available (normal for PDF-only)
      setTraceAnalysis(null);
      setHasTraces(false);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadTraceAnalysis();
  }, [loadTraceAnalysis]);

  /** Get trace metrics for a specific topic (normalized name matching). */
  const getTopicMetrics = useCallback(
    (topicId: string): TopicTraceMetrics | null => {
      if (!traceAnalysis?.priority) return null;
      const normalized = topicId.toLowerCase().replace(/_/g, "-").trim();
      const metrics = traceAnalysis.priority[normalized];
      return metrics ?? null;
    },
    [traceAnalysis],
  );

  /** Get all grader dimensions from trace analysis. */
  const graderDimensions: readonly GraderDimension[] =
    traceAnalysis?.graderHints?.dimensions ?? [];

  /** Get seed queries for a specific topic. */
  const getSeedQueries = useCallback(
    (topicId: string): readonly string[] => {
      if (!traceAnalysis?.prompts?.seedQueries) return [];
      const normalized = topicId.toLowerCase().replace(/_/g, "-").trim();
      return traceAnalysis.prompts.seedQueries[normalized] ?? [];
    },
    [traceAnalysis],
  );

  /** Refresh trace analysis data from the gateway. */
  const refresh = useCallback(async () => {
    await loadTraceAnalysis();
    if (hasTraces) {
      toast.success("Trace analysis refreshed");
    }
  }, [loadTraceAnalysis, hasTraces]);

  return {
    traceAnalysis,
    isLoading,
    hasTraces,
    getTopicMetrics,
    graderDimensions,
    getSeedQueries,
    refresh,
  };
}

// ============================================================================
// Context
// ============================================================================

export type TraceAnalysisContextType = ReturnType<typeof useTraceAnalysis>;

const TraceAnalysisContext = createContext<TraceAnalysisContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface TraceAnalysisProviderProps {
  children: ReactNode;
  workflowId: string;
}

export function TraceAnalysisProvider({
  children,
  workflowId,
}: TraceAnalysisProviderProps) {
  const value = useTraceAnalysis({ workflowId });
  return (
    <TraceAnalysisContext.Provider value={value}>
      {children}
    </TraceAnalysisContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function TraceAnalysisConsumer() {
  const context = useContext(TraceAnalysisContext);
  if (context === undefined) {
    throw new Error("TraceAnalysisConsumer must be used within a TraceAnalysisProvider");
  }
  return context;
}
