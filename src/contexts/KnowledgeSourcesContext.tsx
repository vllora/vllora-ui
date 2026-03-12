/**
 * KnowledgeSourcesContext
 *
 * Single source of truth for knowledge sources state within a dataset.
 * Eliminates duplicate fetching — previously DatasetDetailContentV2,
 * PlanSection, and the sidebar assistant each independently fetched
 * from knowledgeDB on every vllora_knowledge_source_updated event.
 *
 * Now this context listens once and shares the result.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { emitter } from "@/utils/eventEmitter";
import { knowledgeSourceService } from "@/services/service-registry";
import type { KnowledgeSource } from "@/types/dataset-types";

// ============================================================================
// Types
// ============================================================================

interface KnowledgeSourcesContextType {
  /** All knowledge sources for this dataset */
  sources: KnowledgeSource[];
  /** Total count of knowledge sources */
  count: number;
  /** Number of sources currently processing */
  processingCount: number;
  /** Whether any sources are still processing */
  isProcessing: boolean;
  /** Sources that are currently processing (for per-doc status UI) */
  processingSources: KnowledgeSource[];
  /** Whether the initial fetch from IndexedDB has completed */
  hasLoaded: boolean;
  /** Manually trigger a refresh */
  refreshSources: () => void;
}

// ============================================================================
// Context
// ============================================================================

const KnowledgeSourcesContext = createContext<KnowledgeSourcesContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface KnowledgeSourcesProviderProps {
  datasetId: string;
  children: ReactNode;
}

export function KnowledgeSourcesProvider({ datasetId, children }: KnowledgeSourcesProviderProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchSources = useCallback(async () => {
    if (!datasetId) return;
    try {
      const result = await knowledgeSourceService.getByDataset(datasetId);
      setSources(result);
      setHasLoaded(true);
    } catch (error) {
      console.error("[KnowledgeSourcesContext] Error fetching sources:", error);
      setHasLoaded(true); // Mark loaded even on error to unblock consumers
    }
  }, [datasetId]);

  // Initial fetch + listen for updates
  useEffect(() => {
    fetchSources();

    const handleUpdate = ({ datasetId: updatedId }: { datasetId: string }) => {
      if (updatedId === datasetId) {
        fetchSources();
      }
    };

    emitter.on("vllora_knowledge_source_updated", handleUpdate);
    return () => {
      emitter.off("vllora_knowledge_source_updated", handleUpdate);
    };
  }, [datasetId, fetchSources]);

  // Derived state
  const count = sources.length;
  const processingSources = sources.filter((s) => s.status === "processing");
  const processingCount = processingSources.length;
  const isProcessing = processingCount > 0;

  const value: KnowledgeSourcesContextType = {
    sources,
    count,
    processingCount,
    isProcessing,
    processingSources,
    hasLoaded,
    refreshSources: fetchSources,
  };

  return (
    <KnowledgeSourcesContext.Provider value={value}>
      {children}
    </KnowledgeSourcesContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function KnowledgeSourcesConsumer() {
  const context = useContext(KnowledgeSourcesContext);
  if (context === undefined) {
    throw new Error("KnowledgeSourcesConsumer must be used within a KnowledgeSourcesProvider");
  }
  return context;
}
