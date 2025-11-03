'use client'
import { ReactNode, createContext, useContext, useMemo } from "react";
import { RunDTO, Span } from "@/types/common-type";
import { buildSpanHierarchy } from "@/utils/span-hierarchy";
export type RunDetailContextType = ReturnType<typeof useRunDetails>;

export interface Hierarchy {
    root: Span,
    children: Hierarchy[]
}

export const RunDetailContext = createContext<RunDetailContextType | null>(null);
function useRunDetails(props: {
    runId: string,
    projectId: string,
    spansByRunId: Span[],
    run?: RunDTO
}) {
    const { runId, projectId, spansByRunId } = props;

    // Memoize hierarchy building - this is the most expensive operation
    const hierarchies = useMemo(() => {
        return buildSpanHierarchy(spansByRunId);
    }, [spansByRunId]);

    // Memoize root spans calculation
    const rootSpans = useMemo(() => {
        if (!spansByRunId || spansByRunId.length === 0) return [];
        const sorted = [...spansByRunId].sort((a, b) => a.start_time_us - b.start_time_us);
        return sorted.length > 0 ? sorted : [sorted[0]];
    }, [spansByRunId]);

    // Memoize time calculations
    const { startTime, endTime, totalDuration } = useMemo(() => {
        if (!spansByRunId || spansByRunId.length === 0) {
            return { startTime: 0, endTime: 0, totalDuration: 0 };
        }
        const start = Math.min(...spansByRunId.map(span => span.start_time_us));
        const end = Math.max(...spansByRunId.filter(span => span.finish_time_us !== undefined).map(span => span.finish_time_us || 0));
        return { startTime: start, endTime: end, totalDuration: end - start };
    }, [spansByRunId]);

    return {
        runId,
        projectId,
        spansByRunId,
        rootSpans,
        hierarchies,
        startTime,
        endTime,
        totalDuration
    }
}
export function RunDetailProvider({ children, runId, projectId, spansByRunId, run }: { children: ReactNode, runId: string, projectId: string, spansByRunId: Span[], run?: RunDTO }) {
    const value = useRunDetails({ runId, projectId, spansByRunId, run });
    return <RunDetailContext.Provider value={value}>{children}</RunDetailContext.Provider>;
}
export function RunDetailConsumer() {
    const value = useContext(RunDetailContext);
    if (value === null) {
        throw new Error("RunDetailContext must be used within a RunDetailProvider");
    }
    return value;
}
