import { BaseSpanUIDetailsDisplay } from "../.."
import { Badge } from "@/components/ui/badge";
import { ADKInfoUIDisplay } from "./adk-ui";
import { OpenAIInfoUIDisplay } from "./openai-ui";
import { CrewAIInfoUIDisplay } from "./crewai-ui";
import { LangchainInfoUIDisplay } from "./langchain-ui";
import { AgnoInfoUIDisplay } from "./agno-ui";
import { Span } from "@/types/common-type";
import { getClientSDKDisplayName, getClientSDKName, isAgentSpan } from "@/utils/graph-utils";
export const ClientActivityUIDetailsDisplay = ({ span }: { span: Span }) => {
    let clientSDKDisplayName = getClientSDKDisplayName(span);
    let clientSDKName = getClientSDKName(span);
    let isAgent = isAgentSpan(span);

    return (
        <BaseSpanUIDetailsDisplay>
            {/* Header section with model info and status */}
            <div className="flex flex-row justify-end gap-2 p-2 px-0 border-b border-border text-xs">
                <div className="flex items-center gap-2">
                    {/* Agent tag */}
                    {isAgent && (
                        <div className="flex items-center gap-2">
                            <Badge className="px-2 py-1 rounded-md text-xs bg-[#1a1a1a] text-[#ec4899] border border-[#ec4899]">Agent</Badge>
                        </div>
                    )}
                    {/* Client SDK tag */}
                    <div className="flex items-center gap-2">
                        <Badge className="px-2 py-1 rounded-md text-xs bg-[#1a1a1a] text-teal-500 border border-teal-800">{clientSDKDisplayName}</Badge>
                    </div>
                </div>


            </div>
            {clientSDKName === 'adk' && <ADKInfoUIDisplay span={span} />}
            {clientSDKName === 'openai' && <OpenAIInfoUIDisplay span={span} />}
            {clientSDKName === 'crewai' && <CrewAIInfoUIDisplay span={span} />}
            {clientSDKName === 'langchain' && <LangchainInfoUIDisplay span={span} />}
            {clientSDKName === 'agno' && <AgnoInfoUIDisplay span={span} />}
        </BaseSpanUIDetailsDisplay>
    );
}