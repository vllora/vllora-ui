import { useState, useCallback } from 'react';
import { Span } from '@/types/common-type';

export interface RunMap {
  [key: string]: Span[];
}

/**
 * Updates the detail_span_id URL query param
 */
function updateDetailSpanIdInUrl(newValue: string | null) {
  const currentParams = new URLSearchParams(window.location.search);
  if (newValue) {
    currentParams.set('detail_span_id', newValue);
  } else {
    currentParams.delete('detail_span_id');
  }
  const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

export function useSpanDetails() {
  const [loadingSpansById, setLoadingSpansById] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  // Initialize from URL if available (for browser refresh)
  const [detailSpanId, setDetailSpanIdState] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('detail_span_id');
  });

  // Wrap setDetailSpanId to also update URL
  const setDetailSpanId = useCallback((newValue: string | null) => {
    setDetailSpanIdState(newValue);
    updateDetailSpanIdInUrl(newValue);
  }, []);

  return {
    loadingSpansById,
    selectedRunId,
    setSelectedRunId,
    selectedSpanId,
    setSelectedSpanId,
    detailSpanId,
    setDetailSpanId,
    setLoadingSpansById
  };
}
