import { BaseSpanUIDetailsDisplay } from ".."
import { Span } from "@/types/common-type";
import { getClientSDKDisplayName } from "@/utils/graph-utils";

interface AgentUIDisplayProps {
    span: Span;
}

export const AgentUIDisplay = ({ span }: AgentUIDisplayProps) => {
    const agentName = getClientSDKDisplayName(span);
    
    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4">
                <span className="text-xs text-muted-foreground">{agentName}</span>
                <span className="text-xs text-muted-foreground">{span.operation_name}</span>
                <span className="text-xs text-muted-foreground">{span.span_id}</span>
                <span className="text-xs text-muted-foreground">{span.parent_span_id}</span>
                <span className="text-xs text-muted-foreground">{span.trace_id}</span>
                <span className="text-xs text-muted-foreground">{span.start_time_us}</span>
            </div>

        </BaseSpanUIDetailsDisplay>
    );
}