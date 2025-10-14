'use client'
import { ReactNode, createContext, useContext } from "react";
import { RunDTO, Span } from "@/types/common-type";
export type RunDetailContextType = ReturnType<typeof runDetails>;

export interface Hierarchy {
    root: Span,
    children: Hierarchy[]
}
export const constructHierarchy = (props: {
    spans: Span[],
    rootSpan: Span,
    isDisplayGraph?: boolean
}): Hierarchy => {
    const { spans, rootSpan, isDisplayGraph } = props;
    let root = rootSpan;

    if (!root) {
        throw new Error("No root span found");
    }
    let rootSpanId = root.span_id;
    const spansNotRoot = spans.filter(span => span.span_id !== rootSpanId);
    let childSpans = spansNotRoot.filter(span => span.parent_span_id === rootSpanId);

    if (!childSpans.length) {
        return { root, children: [] };
    }
    let childrenSpan = childSpans.map(currentChild => {
        return constructHierarchy({ spans: spansNotRoot, rootSpan: currentChild, isDisplayGraph })
    })
    return { root, children: childrenSpan };
}

export const convertToHierarchy = (props: {
    spans: Span[],
    isDisplayGraph?: boolean
}): Record<string, Hierarchy> => {
    const { spans, isDisplayGraph } = props;
    const originRootSpans = spans
        .sort((a, b) => a.start_time_us - b.start_time_us)
        .filter(span => span.parent_span_id === null || span.parent_span_id === "0" || span.parent_span_id === "" || span.parent_span_id === undefined || span.parent_span_id === "")
    let rootSpans = originRootSpans && originRootSpans.length > 0 ? originRootSpans : (spans && spans.length > 0 ? [spans.sort((a, b) => a.start_time_us - b.start_time_us)[0]] : [])
    const hierarchies: Record<string, Hierarchy> = rootSpans.reduce((acc, span) => {
        acc[span.span_id] = constructHierarchy({ spans: spans, rootSpan: span, isDisplayGraph: isDisplayGraph });
        return acc;
    }, {} as Record<string, Hierarchy>);
    return hierarchies;
}
export const RunDetailContext = createContext<RunDetailContextType | null>(null);
function runDetails(props: {
    runId: string,
    projectId: string,
    spans: Span[],
    run?: RunDTO
}) {
    const { runId, projectId, spans } = props;

    const originRootSpans = spans
        .sort((a, b) => a.start_time_us - b.start_time_us)
        .filter(span => span.parent_span_id === null || span.parent_span_id === "0")
    let rootSpans = originRootSpans && originRootSpans.length > 0 ? originRootSpans : (spans && spans.length > 0 ? [spans.sort((a, b) => a.start_time_us - b.start_time_us)[0]] : [])
    const hierarchies: Record<string, Hierarchy> = convertToHierarchy({ spans: spans, isDisplayGraph: false });
    return {
        runId,
        projectId,
        spans,
        rootSpans,
        hierarchies
    }
}
export function RunDetailProvider({ children, runId, projectId, spans, run }: { children: ReactNode, runId: string, projectId: string, spans: Span[], run?: RunDTO }) {
    const value = runDetails({ runId, projectId, spans, run });
    return <RunDetailContext.Provider value={value}>{children}</RunDetailContext.Provider>;
}
export function RunDetailConsumer() {
    const value = useContext(RunDetailContext);
    if (value === null) {
        throw new Error("RunDetailContext must be used within a RunDetailProvider");
    }
    return value;
}
