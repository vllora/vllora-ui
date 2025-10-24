import { useState } from 'react';
import { Span } from '@/types/common-type';

export interface RunMap {
  [key: string]: Span[];
}


export function useSpanDetails() {
  const [loadingSpansById, setLoadingSpansById] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [detailSpanId, setDetailSpanId] = useState<string | null>(null);  
 

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
