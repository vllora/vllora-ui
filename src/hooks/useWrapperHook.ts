import { useCallback, useMemo, useState } from "react";
import { useRunsPagination } from "./useRunsPagination";
import { RunMap, useSpanDetails } from "./useSpanDetails";
import { fetchAllSpansByRunId } from "@/utils/traces";
import { toast } from "sonner";
import { Span } from "@/types/common-type";
import { listSpans } from "@/services/spans-api";
import { useRequest } from "ahooks";
import { RunDTO } from "@/types/common-type";

export const useWrapperHook = (props: {
  threadId?: string;
  projectId: string;
  onRunsLoaded?: (runs: RunDTO[]) => void;
}) => {
  const { threadId, projectId, onRunsLoaded } = props;
  // Use the runs pagination hook
  let runsPaginationState = useRunsPagination({ projectId, threadId, onRunsLoaded });
  // Use the span details hook
  let spanDetailState = useSpanDetails({ projectId });

  const { setLoadingSpansById, selectedRunId, detailSpanId } = spanDetailState;

  const [flattenSpans, setFlattenSpans] = useState<Span[]>([]);
  
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);
  const [hoverSpanId, setHoverSpanId] = useState<string | undefined>(undefined);
  const [collapsedSpans, setCollapsedSpans] = useState<string[]>([]);

  const updateBySpansOfAThread = useCallback((spans: Span[]) => {
    setFlattenSpans(spans);
    // update RunMap
  }, []);

  let runMap = useMemo(() => {
    return flattenSpans.reduce((acc, span) => {
      if (!acc[span.run_id]) {
        acc[span.run_id] = [];
      }
      acc[span.run_id].push(span);
      return acc;
    }, {} as RunMap);
  }, [flattenSpans]);

  const spansOfSelectedRun = useMemo(() => {
    return selectedRunId ? runMap[selectedRunId] : [];
  }, [selectedRunId, runMap]);

  const detailSpan = useMemo(() => {
   let result = detailSpanId
      ? flattenSpans.find(
          (span) => span.span_id === detailSpanId
        )
      : null;
    return result;
  }, [detailSpanId, flattenSpans]);
  // Use ahooks useRequest for fetching conversation spans
  const {
    loading: isLoadingSpans,
    error: loadSpansError,
    run: refreshSpans,
  } = useRequest(
    async () => {
      if (!threadId || !projectId) {
        return [];
      }
      const response = await listSpans({
        projectId,
        params: {
          threadIds: threadId,
          limit: 1000, // Fetch all spans for this thread
          offset: 0,
        },
      });
      return response.data;
    },
    {
      manual: true,
      onError: (err: any) => {
        toast.error("Failed to load conversation spans", {
          description:
            err.message || "An error occurred while loading conversation spans",
        });
      },
      onSuccess: (spans) => {
        updateBySpansOfAThread(spans);
      },
    }
  );

  const updateBySpansOfARun = useCallback((spans: Span[]) => {
    setFlattenSpans((prev) => {
      let newFlattenSpans = [...prev];
      for (let span of spans) {
        let flattenSpanIndex = newFlattenSpans.findIndex(
          (s) => s.span_id === span.span_id
        );
        if (flattenSpanIndex >= 0) {
          newFlattenSpans[flattenSpanIndex] = span;
        } else {
          newFlattenSpans.push(span);
        }
      }
      return newFlattenSpans;
    });
  }, []);
  /**
   * Fetches detailed span data for a specific run when user expands a row
   * Prevents concurrent duplicate requests but allows re-fetching after collapse/expand
   *
   * @param runId - The run ID to fetch spans for
   */
  const fetchSpansByRunId = useCallback(
    async (runId: string) => {
      // Check if already loading this runId to prevent concurrent duplicate requests
      let shouldFetch = true;
      setLoadingSpansById((prev) => {
        if (prev.has(runId)) {
          shouldFetch = false;
          return prev;
        }
        return new Set(prev).add(runId);
      });

      if (!shouldFetch) {
        return;
      }

      try {
        const relatedSpans = await fetchAllSpansByRunId(runId, projectId);
        updateBySpansOfARun(relatedSpans);
      } catch (e: any) {
        toast.error("Failed to fetch span details", {
          description:
            e.message || "An error occurred while fetching span details",
        });
      } finally {
        // Remove from loading set
        setLoadingSpansById((prev) => {
          const newSet = new Set(prev);
          newSet.delete(runId);
          return newSet;
        });
      }
    },
    [projectId]
  );

  return {
    ...spanDetailState,
    ...runsPaginationState,
    runMap,
    fetchSpansByRunId,
    flattenSpans,
    setFlattenSpans,
    hoveredRunId,
    setHoveredRunId,
    isLoadingSpans,
    loadSpansError,
    refreshSpans,
    updateBySpansOfAThread,
    updateBySpansOfARun,
    spansOfSelectedRun,
    detailSpan,
    hoverSpanId,
    setHoverSpanId,
    collapsedSpans,
    setCollapsedSpans,
  };
};
