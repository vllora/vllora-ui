import { useRef } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { cn } from "@/lib/utils";
import { TimelineContent } from "../../components/TimelineContent";
import { AlertCircle } from "lucide-react";
import { CustomErrorFallback } from "../custom-error-fallback";
import { RunDTO, Span } from "@/types/common-type";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { LoadingState } from "./LoadingState";
import { ProjectsConsumer } from "@/contexts/ProjectContext";

// Main component that uses the above components
export const DetailedRunView: React.FC<{run: RunDTO}> = ({
    run
}) => {
    const {runMap, loadingSpansById, selectedSpanId, setSelectedSpanId, setSelectedRunId, setDetailSpanId, hoverSpanId} = ChatWindowConsumer()
    const {currentProjectId} = ProjectsConsumer()
    const spansByRunId: Span[] = run.run_id ? runMap[run.run_id] || [] : []
    const detailViewRef = useRef<HTMLDivElement>(null);
    if (spansByRunId?.length > 0) {
        
        return (
            <div
                ref={detailViewRef}
                className={cn("flex flex-col gap-3 py-2")}
            >
               

                {/* Execution Timeline Section - Full Width */}
                {spansByRunId.length > 0 && (
                    <div className="overflow-hidden">
                        <div className="overflow-hidden relative">
                            <ErrorBoundary FallbackComponent={CustomErrorFallback}>
                                <TimelineContent
                                    spansByRunId={spansByRunId}
                                    projectId={currentProjectId || ''}
                                    selectedSpanId={selectedSpanId}
                                    hoverSpanId={hoverSpanId}
                                    setSelectedSpanId={setSelectedSpanId}
                                    setSelectedRunId={setSelectedRunId}
                                    setDetailSpanId={setDetailSpanId}
                                />
                            </ErrorBoundary>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Check if we have resolvedSpans but no initialSpans (empty run)
    const isEmptyRun = spansByRunId.length === 0;
    const isLoading = run.run_id && loadingSpansById.has(run.run_id);

    if (isEmptyRun && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-8 px-4 bg-[#0a0a0a] border border-[#262626] rounded-lg mx-4 my-2">
                <div className="flex items-center justify-center w-12 h-12 bg-[#1a1a1a] rounded-full mb-4">
                    <AlertCircle className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-200 mb-2">No Execution Details</h3>
                <p className="text-sm text-gray-400 text-center max-w-md">
                    This run completed successfully but no detailed execution traces were recorded.
                </p>
            </div>
        );
    }

    // Loading state when we don't have resolvedSpans yet
    return <LoadingState />;
}