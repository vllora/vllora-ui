/**
 * OtelTracesContext
 *
 * Single source of truth for the OTel GenAI trace browser. Holds the
 * current filter set and the matching traces. Mirrors the
 * KnowledgeSourcesContext pattern (Provider/Consumer/event listener)
 * per docs/state-management-pattern.md.
 *
 * The mock adapter currently powers this context. When the coworker's
 * OTel ingest API ships, only service-registry changes — the context
 * stays identical.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { otelTraceService } from '@/services/service-registry';
import type {
  OtelTrace,
  OtelTraceFilters,
} from '@/types/otel-trace-types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OtelTracesContextType {
  readonly traces: OtelTrace[];
  readonly total: number;
  readonly hasLoaded: boolean;
  readonly loading: boolean;
  readonly filters: OtelTraceFilters;
  readonly availableModels: string[];
  setFilters: (next: OtelTraceFilters) => void;
  patchFilters: (patch: Partial<OtelTraceFilters>) => void;
  clearFilters: () => void;
  refresh: () => void;
}

const EMPTY_FILTERS: OtelTraceFilters = {};

const OtelTracesContext = createContext<OtelTracesContextType | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────────────────────

interface OtelTracesProviderProps {
  readonly initialFilters?: OtelTraceFilters;
  readonly children: ReactNode;
}

export function OtelTracesProvider({ initialFilters, children }: OtelTracesProviderProps) {
  const [filters, setFiltersState] = useState<OtelTraceFilters>(initialFilters ?? EMPTY_FILTERS);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data, loading, run } = useRequest(
    (next: OtelTraceFilters) => otelTraceService.list(next),
    {
      defaultParams: [filters],
      refreshDeps: [],
      onSuccess: () => setHasLoaded(true),
      onError: (error) => {
        setHasLoaded(true);
        console.error('[OtelTracesContext] list failed:', error);
        toast.error('Failed to load traces');
      },
    },
  );

  const { data: models } = useRequest(() => otelTraceService.listModels(), {
    onError: (error) => console.error('[OtelTracesContext] listModels failed:', error),
  });

  const setFilters = useCallback(
    (next: OtelTraceFilters) => {
      setFiltersState(next);
      run(next);
    },
    [run],
  );

  const patchFilters = useCallback(
    (patch: Partial<OtelTraceFilters>) => {
      setFiltersState((prev) => {
        const next = { ...prev, ...patch };
        run(next);
        return next;
      });
    },
    [run],
  );

  const clearFilters = useCallback(() => {
    setFiltersState(EMPTY_FILTERS);
    run(EMPTY_FILTERS);
  }, [run]);

  const refresh = useCallback(() => {
    run(filters);
  }, [filters, run]);

  // Initial fetch on mount in case defaultParams didn't match.
  useEffect(() => {
    run(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<OtelTracesContextType>(
    () => ({
      traces: data?.traces ?? [],
      total: data?.total ?? 0,
      hasLoaded,
      loading,
      filters,
      availableModels: models ?? [],
      setFilters,
      patchFilters,
      clearFilters,
      refresh,
    }),
    [data, hasLoaded, loading, filters, models, setFilters, patchFilters, clearFilters, refresh],
  );

  return <OtelTracesContext.Provider value={value}>{children}</OtelTracesContext.Provider>;
}

// ─── Consumer ────────────────────────────────────────────────────────────────

export function OtelTracesConsumer(): OtelTracesContextType {
  const ctx = useContext(OtelTracesContext);
  if (!ctx) {
    throw new Error('OtelTracesConsumer must be used within OtelTracesProvider');
  }
  return ctx;
}
