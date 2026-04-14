/**
 * PipelineAnalysisContext
 *
 * Loads and caches the shared pipeline analysis (analysis.json).
 * This is the single source of truth between agent and user —
 * the agent writes it, the UI displays it verbatim, the agent reads it back.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiClient, handleApiResponse } from "@/lib/api-client";
import type {
  PipelineAnalysis,
  SectionAnalysis,
  SectionId,
} from "@/types/pipeline-analysis-types";

// =============================================================================
// Hook
// =============================================================================

function usePipelineAnalysisLogic(workflowId: string | null) {
  const [analysis, setAnalysis] = useState<PipelineAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAnalysis = useCallback(async () => {
    if (!workflowId) return;
    setIsLoading(true);
    try {
      const response = await apiClient(
        `/finetune/workflows/${workflowId}`,
        { method: "GET" },
      );
      const workflow = await handleApiResponse<Record<string, unknown>>(response);
      // analysis.json is stored as pipeline_analysis on the workflow
      const rawAnalysis = workflow.pipeline_analysis;
      if (rawAnalysis) {
        const parsed: PipelineAnalysis =
          typeof rawAnalysis === "string" ? JSON.parse(rawAnalysis) : rawAnalysis;
        setAnalysis(parsed);
      } else {
        setAnalysis(null);
      }
    } catch {
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  const getSection = useCallback(
    (sectionId: SectionId): SectionAnalysis | null => {
      return analysis?.sections?.[sectionId] ?? null;
    },
    [analysis],
  );

  const hasAnalysis = analysis !== null && Object.keys(analysis.sections ?? {}).length > 0;

  return {
    analysis,
    isLoading,
    hasAnalysis,
    getSection,
    refresh: loadAnalysis,
  };
}

// =============================================================================
// Context
// =============================================================================

export type PipelineAnalysisContextType = ReturnType<typeof usePipelineAnalysisLogic>;

const PipelineAnalysisContext = createContext<PipelineAnalysisContextType | undefined>(undefined);

export function PipelineAnalysisProvider({
  children,
  workflowId,
}: {
  children: ReactNode;
  workflowId: string | null;
}) {
  const value = usePipelineAnalysisLogic(workflowId);
  return (
    <PipelineAnalysisContext.Provider value={value}>
      {children}
    </PipelineAnalysisContext.Provider>
  );
}

export function PipelineAnalysisConsumer() {
  const context = useContext(PipelineAnalysisContext);
  if (context === undefined) {
    throw new Error("PipelineAnalysisConsumer must be used within PipelineAnalysisProvider");
  }
  return context;
}
