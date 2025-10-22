import { useCallback, useState } from "react";
import { useRunsPagination } from "./useRunsPagination";
import { useSpanDetails } from "./useSpanDetails";
import { fetchAllSpansByRunId } from "@/utils/traces";
import { toast } from "sonner";
import { Span } from "@/types/common-type";
import { listSpans } from "@/services/spans-api";
import { useRequest } from "ahooks";

export const useWrapperHook = (props: {
  threadId?: string;
  projectId: string;
}) => {
  const { threadId, projectId } = props;
  // Use the runs pagination hook
  let runsPaginationState = useRunsPagination({ projectId, threadId });

  // Use the span details hook
  let spanDetailState = useSpanDetails({ projectId });

  const { setLoadingSpansById, setRunMap } = spanDetailState;

  const [flattenSpans, setFlattenSpans] = useState<Span[]>([]);
  const [openTraces, setOpenTraces] = useState<
    { run_id: string; tab: "trace" | "code" }[]
  >([]);
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);

  const updateBySpansOfAThread = useCallback((spans: Span[]) => {
    setFlattenSpans(spans);
    // update RunMap
    setRunMap((prev) => {
      let newRunMap = { ...prev };
      for (let span of spans) {
        let runId = span.run_id;
        if (runId) {
          let spansByRunId = prev[runId];
          if (spansByRunId && spansByRunId.length > 0) {
            let indexBySpanId = spansByRunId.findIndex(
              (s) => s.span_id === span.span_id
            );
            if (indexBySpanId >= 0) {
              spansByRunId[indexBySpanId] = span;
            } else {
              spansByRunId.push(span);
            }
            newRunMap[runId] = [...spansByRunId];
          } else {
            newRunMap[runId] = [span];
          }
        }
      }
      return newRunMap;
    });
  }, []);
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

  const updateBySpansOfARun = useCallback((runId: string, spans: Span[]) => {
    setRunMap((prev) => {
      let newRunMap = { ...prev };
      if (newRunMap[runId]) {
        newRunMap[runId] = spans;
      } else {
        newRunMap[runId] = spans;
      }
      return newRunMap;
    });
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
        updateBySpansOfARun(runId, relatedSpans);
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
    fetchSpansByRunId,
    flattenSpans,
    setFlattenSpans,
    openTraces,
    setOpenTraces,
    hoveredRunId,
    setHoveredRunId,
    isLoadingSpans,
    loadSpansError,
    refreshSpans,
    updateBySpansOfAThread,
    updateBySpansOfARun

  };
};
