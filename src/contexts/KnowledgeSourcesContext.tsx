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
import type { KnowledgeSource } from "@/types/knowledge-types";

// ============================================================================
// Types
// ============================================================================

interface KnowledgeSourcesContextType {
  /** All knowledge sources for this dataset */
  sources: KnowledgeSource[];
  /** Total count of knowledge sources */
  count: number;
  /** Total number of parts across all sources */
  totalParts: number;
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
  workflowId: string;
  children: ReactNode;
}

export function KnowledgeSourcesProvider({ workflowId, children }: KnowledgeSourcesProviderProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchSources = useCallback(async () => {
    if (!workflowId) return;
    try {
      const result = await knowledgeSourceService.list(workflowId);
      setSources(result);
      setHasLoaded(true);
    } catch (error) {
      console.error("[KnowledgeSourcesContext] Error fetching sources:", error);
      setHasLoaded(true); // Mark loaded even on error to unblock consumers
    }
  }, [workflowId]);

  // Initial fetch + listen for updates
  useEffect(() => {
    fetchSources();

    const handleUpdate = ({ workflowId: updatedId }: { workflowId: string }) => {
      if (updatedId === workflowId) {
        fetchSources();
      }
    };

    emitter.on("vllora_knowledge_source_updated", handleUpdate);
    return () => {
      emitter.off("vllora_knowledge_source_updated", handleUpdate);
    };
  }, [workflowId, fetchSources]);

  // Derived state
  const count = sources.length;
  const totalParts = sources.flatMap((s) => s.parts).length;

  const value: KnowledgeSourcesContextType = {
    sources,
    count,
    totalParts,
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
