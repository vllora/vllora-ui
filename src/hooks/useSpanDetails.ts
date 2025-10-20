import { useState, useCallback, useMemo } from 'react';
import { useLatest } from 'ahooks';
import { toast } from 'sonner';
import { fetchAllSpansByRunId } from '@/utils/traces';
import { Span } from '@/types/common-type';

export interface SpanMap {
  [key: string]: Span[];
}

interface UseSpanDetailsProps {
  projectId: string;
}

export function useSpanDetails({ projectId }: UseSpanDetailsProps) {
  const [spanMap, setSpanMap] = useState<SpanMap>({});
  const [loadingSpansById, setLoadingSpansById] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [detailSpanId, setDetailSpanId] = useState<string | null>(null);

  const projectIdRef = useLatest(projectId);

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
        const relatedSpans = await fetchAllSpansByRunId(runId, projectIdRef.current);
        
        setSpanMap((prev) => ({ ...prev, [runId]: relatedSpans }));
      } catch (e: any) {
        console.error('==== Error fetching spans by run id:', e);
        toast.error('Failed to fetch span details', {
          description: e.message || 'An error occurred while fetching span details',
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
    [projectIdRef]
  );

  const spansOfSelectedRun = useMemo(() => {
    return selectedRunId ? spanMap[selectedRunId] : [];
  }, [selectedRunId, spanMap]);

  const detailSpan = useMemo(() => {
    return detailSpanId ? spanMap[selectedRunId || '']?.find(span => span.span_id === detailSpanId) : null;
  }, [detailSpanId, selectedRunId, spanMap]);

  console.log("==== detailSpan", detailSpan);

  return {
    spanMap,
    setSpanMap,
    loadingSpansById,
    fetchSpansByRunId,
    selectedRunId,
    setSelectedRunId,
    spansOfSelectedRun,
    selectedSpanId,
    setSelectedSpanId,
    detailSpanId,
    setDetailSpanId,
    detailSpan,
  };
}
