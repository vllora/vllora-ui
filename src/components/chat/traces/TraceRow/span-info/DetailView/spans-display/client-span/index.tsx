import { BaseSpanUIDetailsDisplay } from "../.."
import { Badge } from "@/components/ui/badge";
import { Span } from "@/types/common-type";
import { getClientSDKDisplayName } from "@/utils/graph-utils";
export const ClientActivityUIDetailsDisplay = ({ span }: { span: Span }) => {
    let clientSDKDisplayName = getClientSDKDisplayName(span);

    return (
        <BaseSpanUIDetailsDisplay>
            {/* Header section with model info and status */}
            <div className="flex flex-row justify-end gap-2 p-2 px-0 border-b border-border text-xs">
                <div className="flex items-center gap-2">
                    {/* Client SDK tag */}
                    <div className="flex items-center gap-2">
                        <Badge className="px-2 py-1 rounded-md text-xs bg-[#1a1a1a] text-teal-500 border border-teal-800">{clientSDKDisplayName}</Badge>
                    </div>
                </div>
            </div>
            
        </BaseSpanUIDetailsDisplay>
    );
}