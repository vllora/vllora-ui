'use client'
import { ReactNode, createContext, useContext } from "react";
import { RunDTO, Span } from "@/types/common-type";
import { buildSpanHierarchy } from "@/utils/span-hierarchy";
export type RunDetailContextType = ReturnType<typeof runDetails>;

export interface Hierarchy {
    root: Span,
    children: Hierarchy[]
}

export const RunDetailContext = createContext<RunDetailContextType | null>(null);
function runDetails(props: {
    runId: string,
    projectId: string,
    spansByRunId: Span[],
    run?: RunDTO
}) {
    const { runId, projectId, spansByRunId } = props;

    const originRootSpans = spansByRunId
        .sort((a, b) => a.start_time_us - b.start_time_us)
    let rootSpans = originRootSpans && originRootSpans.length > 0 ? originRootSpans : (spansByRunId && spansByRunId.length > 0 ? [spansByRunId.sort((a, b) => a.start_time_us - b.start_time_us)[0]] : [])
    const hierarchies: Span[] = buildSpanHierarchy(spansByRunId);

    const startTime = Math.min(...spansByRunId.map(span => span.start_time_us));
    const endTime = Math.max(...spansByRunId.filter(span => span.finish_time_us !== undefined).map(span => span.finish_time_us || 0));
    const totalDuration = endTime - startTime;
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
    const value = runDetails({ runId, projectId, spansByRunId, run });
    return <RunDetailContext.Provider value={value}>{children}</RunDetailContext.Provider>;
}
export function RunDetailConsumer() {
    const value = useContext(RunDetailContext);
    if (value === null) {
        throw new Error("RunDetailContext must be used within a RunDetailProvider");
    }
    return value;
}
