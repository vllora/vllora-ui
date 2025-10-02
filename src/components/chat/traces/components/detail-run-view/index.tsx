import { useRef } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { cn } from "@/lib/utils";
import { TimelineContent } from "../../components/TimelineContent";
import { AlertCircle, Clock } from "lucide-react";
import { CustomErrorFallback } from "../custom-error-fallback";
import { getSpanName } from "@/components/chat/utils";
import { RunDTO } from "@/services/runs-api";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Span } from "@/services/runs-api";

// Main component that uses the above components
export const DetailedRunView: React.FC<{run: RunDTO}> = ({
    run
}) => {
    const {spanMap} = ChatWindowConsumer()
    const spansByRunId: Span[] = run.run_id ? spanMap[run.run_id] || [] : []
    const detailViewRef = useRef<HTMLDivElement>(null);

    if (spansByRunId?.length > 0) {
        const uniqueNames = new Set(spansByRunId
            .filter(span => !['model_call', 'api_invoke', 'cloud_api_invoke'].includes(span.operation_name))
            .map(span => getSpanName(span))
            .filter(String));
        const uniqueNameCount = uniqueNames.size;

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
                                    rootSpans={spansByRunId}
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

    if (isEmptyRun) {
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
    return (
        <div className="p-4 bg-[#171717]">
            <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-400 animate-spin" />
                    <span className="text-sm text-gray-400">Loading execution details...</span>
                </div>
            </div>
        </div>
    );
}