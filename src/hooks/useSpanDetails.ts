import { useState, useCallback, useMemo } from 'react';
import { Span } from '@/types/common-type';

export interface RunMap {
  [key: string]: Span[];
}

interface UseSpanDetailsProps {
  projectId: string;
}

export function useSpanDetails({ projectId }: UseSpanDetailsProps) {
  const [runMap, setRunMap] = useState<RunMap>({});
  const [loadingSpansById, setLoadingSpansById] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [detailSpanId, setDetailSpanId] = useState<string | null>(null);  
  const spansOfSelectedRun = useMemo(() => {
    return selectedRunId ? runMap[selectedRunId] : [];
  }, [selectedRunId, runMap]);

  const detailSpan = useMemo(() => {
    return detailSpanId ? runMap[selectedRunId || '']?.find(span => span.span_id === detailSpanId) : null;
  }, [detailSpanId, selectedRunId, runMap]);

  return {
    runMap,
    setRunMap,
    loadingSpansById,
    selectedRunId,
    setSelectedRunId,
    spansOfSelectedRun,
    selectedSpanId,
    setSelectedSpanId,
    detailSpanId,
    setDetailSpanId,
    detailSpan,
    setLoadingSpansById
  };
}
