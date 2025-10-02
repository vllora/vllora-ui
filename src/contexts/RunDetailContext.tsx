import { createContext, useContext, ReactNode, useMemo } from 'react';
import { Span } from '@/services/runs-api';

export interface Hierarchy {
  span: Span;
  children: Hierarchy[];
}

export type RunDetailContextType = ReturnType<typeof useRunDetail>;

const RunDetailContext = createContext<RunDetailContextType | undefined>(undefined);

interface RunDetailProviderProps {
  runId: string;
  projectId: string;
  spans: Span[];
}

/**
 * Build hierarchical structure from flat span array
 */
function buildHierarchy(spans: Span[]): Record<string, Hierarchy> {
  const hierarchies: Record<string, Hierarchy> = {};
  const spanMap: Record<string, Span> = {};

  // Create a map of all spans
  spans.forEach(span => {
    spanMap[span.span_id] = span;
  });

  // Build hierarchy for each span
  spans.forEach(span => {
    const children: Hierarchy[] = [];

    // Find all children of this span
    spans.forEach(potentialChild => {
      if (potentialChild.parent_span_id === span.span_id) {
        if (hierarchies[potentialChild.span_id]) {
          children.push(hierarchies[potentialChild.span_id]);
        } else {
          children.push({
            span: potentialChild,
            children: []
          });
        }
      }
    });

    hierarchies[span.span_id] = {
      span,
      children
    };
  });

  return hierarchies;
}

export function useRunDetail({ runId, projectId, spans }: RunDetailProviderProps) {
  // Build hierarchies from spans
  const hierarchies = useMemo(() => {
    return buildHierarchy(spans);
  }, [spans]);

  // Find root spans (spans without parent_span_id)
  const rootSpans = useMemo(() => {
    return spans.filter(span => !span.parent_span_id || span.parent_span_id === "" || span.parent_span_id === '0');
  }, [spans]);

  console.log("==== useRunDetail rootSpans", rootSpans)
  console.log("==== useRunDetail hierarchies", hierarchies)
  console.log("==== useRunDetail spans", spans)
  return {
    runId,
    projectId,
    spans,
    hierarchies,
    rootSpans,
  };
}

export function RunDetailProvider({
  children,
  runId,
  projectId,
  spans
}: {
  children: ReactNode;
  runId: string;
  projectId: string;
  spans: Span[];
}) {
  const value = useRunDetail({ runId, projectId, spans });
  return <RunDetailContext.Provider value={value}>{children}</RunDetailContext.Provider>;
}

export function RunDetailConsumer() {
  const context = useContext(RunDetailContext);
  if (context === undefined) {
    throw new Error('RunDetailConsumer must be used within a RunDetailProvider');
  }
  return context;
}
