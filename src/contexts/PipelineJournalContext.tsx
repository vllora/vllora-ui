/**
 * PipelineJournalContext
 *
 * Fetches and caches the pipeline journal for the current workflow.
 * Uses the Context + ahooks useRequest pattern per project conventions.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useRequest } from "ahooks";
import { toast } from "sonner";
import { fetchPipelineJournal } from "@/services/pipeline-journal-service";
import type { PipelineJournalEntry } from "@/types/pipeline-journal-types";

// =============================================================================
// Hook
// =============================================================================

export type PipelineJournalContextType = ReturnType<typeof usePipelineJournalLogic>;

function usePipelineJournalLogic(workflowId: string | null) {
  const {
    data: journal,
    loading: isLoading,
    error,
    refresh,
  } = useRequest(
    async () => {
      if (!workflowId) return null;
      return fetchPipelineJournal(workflowId);
    },
    {
      refreshDeps: [workflowId],
      onError: (err) => {
        toast.error(`Failed to load pipeline journal: ${err.message}`);
      },
    },
  );

  const entries: readonly PipelineJournalEntry[] = journal?.entries ?? [];
  const hasJournal = entries.length > 0;

  return {
    journal: journal ?? null,
    entries,
    hasJournal,
    isLoading,
    error: error ?? null,
    refresh,
  } as const;
}

// =============================================================================
// Context
// =============================================================================

const PipelineJournalContext = createContext<PipelineJournalContextType | null>(null);

export function PipelineJournalProvider({
  workflowId,
  children,
}: {
  readonly workflowId: string | null;
  readonly children: ReactNode;
}) {
  const value = usePipelineJournalLogic(workflowId);
  return (
    <PipelineJournalContext.Provider value={value}>
      {children}
    </PipelineJournalContext.Provider>
  );
}

export function PipelineJournalConsumer(): PipelineJournalContextType {
  const ctx = useContext(PipelineJournalContext);
  if (!ctx) {
    throw new Error("PipelineJournalConsumer must be used within PipelineJournalProvider");
  }
  return ctx;
}
