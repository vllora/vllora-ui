import { Tabs, TabsContent } from "@/components/ui/tabs";
// import { RenderArray } from "./utils";
import { JsonViewer } from "./JsonViewer";
import { useState } from "react";
import { DatabaseIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getModelFullName } from "@/utils/model-fullname";
import { cn } from "@/lib/utils";
import { SpanUIDetailsDisplay } from "./DetailView";
import { ClientSdkIcon } from "@/components/Icons/ClientSdkIcon";
import { getModelDetailName, getOperationIcon, getOperationIconColor, getSpanTitle } from "../new-timeline/utils";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { getClientSDKName, isAgentSpan, isPromptCachingApplied } from "@/utils/graph-utils";

export const SpanDetailsDisplay = ({ onClose }:
  { onClose?: () => void }) => {
  const [currentTab, setCurrentTab] = useState<string>("details");
  const { spanMap, selectedSpanInfo } = ChatWindowConsumer();
    const spanId = selectedSpanInfo?.spanId;
    const spanOrRunId = selectedSpanInfo?.runId || selectedSpanInfo?.spanId || '';




  // Use the obj directly as the currentSpan since it's already the selected span
  const currentSpan = spanOrRunId ? spanMap[spanOrRunId]?.find(span => span.span_id === spanId) : undefined;
  let relatedSpans = spanOrRunId ? spanMap[spanOrRunId] : spanMap[spanOrRunId];
  if (!currentSpan) {
    return <></>;
  }
  const operationIcon = getOperationIcon({ span: currentSpan, relatedSpans });
  const spanTitle = getSpanTitle({ span: currentSpan, relatedSpans });
  const operationIconColor = getOperationIconColor({ span: currentSpan, relatedSpans });
  const attributes = currentSpan.attribute as any;
  const tool_name: string = attributes && attributes['tool_name'] as string;
  let mcp_template_definition_id = attributes && attributes['mcp_template_definition_id'] as string;

  // get prefix from tool_name
  const prefix = tool_name && tool_name.includes('---') ? tool_name.split('---')[0] : tool_name;
  let logoLink = '';
  const linkReference = ''; //getLinkFromAttribute({ attributes, projectId: params?.projectId as string, mcp_template_definition_id, currentSpan, relatedSpans });
  const modelDetailName = getModelDetailName(currentSpan, relatedSpans);
  // const modelByModelName = cacheModelPrices?.find(model => getModelFullName(model) === modelDetailName);
  const isAgent = currentSpan && isAgentSpan(currentSpan);
  const sdkName = currentSpan && getClientSDKName(currentSpan);
  const isPromptCached = currentSpan && isPromptCachingApplied(currentSpan);

  return (
    <div className="w-full flex flex-col h-full">
      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v)} className="flex flex-col h-full">
        {/* Sticky Header section */}
        <div className="sticky top-0 z-10 flex flex-row items-center p-2 px-4 justify-between w-full bg-[#161616] border-b border-border">
          <div className="flex flex-row items-center gap-4 justify-between w-full">
            <div className="flex items-center gap-2">
              {logoLink ? <img src={logoLink} alt={spanTitle} width={20} height={20} /> : <>
                <div className="relative">
                  <div className={cn("p-1 rounded-full ", operationIconColor)}>
                    {operationIcon}
                  </div>
                  {sdkName && (
                    <div className="absolute -bottom-1 -right-1  bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                      <ClientSdkIcon client_name={sdkName} className="w-2.5 h-2.5" />
                    </div>
                  )}
                  {/* Cache indicator as subscript icon */}
                  {currentSpan.operation_name === 'cache' && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                      <DatabaseIcon className="w-2.5 h-2.5 text-blue-400" />
                    </div>
                  )}
                  {/* Prompt caching indicator as subscript icon */}
                  {isPromptCached && (
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                      <DatabaseIcon className="w-2.5 h-2.5 text-amber-400" />
                    </div>
                  )}
                </div>
              </>}
              {linkReference ? <a
                      href={linkReference}
                      className="text-xs font-medium text-white hover:underline hover:cursor-help"
                    >
                      <h3 className="text-xs font-medium text-white">{spanTitle}</h3>
                    </a> : <h3 className="text-xs font-medium text-white hover:cursor-help">{spanTitle}</h3>}
              {/* {mcp_slug ? <Link
                href={params.projectId ? `/projects/${params.projectId}/mcp-servers/${mcp_slug}/details` : (mcp_template_definition_id ? `/mcp-servers/${mcp_template_definition_id}` : ``)}
                className="text-xs font-medium text-white hover:underline">
                <h3 className="text-xs font-medium text-white">{spanTitle}</h3>
              </Link> : virtual_model_slug ? <Link
                href={params.projectId ? `/projects/${params.projectId}/models/virtual-models/${virtual_model_slug}/edit` : ''}
                className="text-xs font-medium text-white hover:underline">
                <h3 className="text-xs font-medium text-white">{spanTitle}</h3>
              </Link> : <h3 className="text-xs font-medium text-white">{spanTitle}</h3>} */}
            </div>
            {/* <SimpleTabsList>
              <SimpleTabsTrigger value="details" className="text-xs">UI</SimpleTabsTrigger>
              <SimpleTabsTrigger value="json" className="text-xs">JSON</SimpleTabsTrigger>
            </SimpleTabsList> */}
          </div>
          {/* {!isInSidebar && <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full hover:bg-gray-800"
            onClick={onClose}
            aria-label="Close span details"
          >
            <X className="h-4 w-4 text-gray-400" />
          </Button>} */}
        </div>

        {/* Scrollable content container */}
        <div className="flex-1 overflow-y-auto">
          {/* Tabs content */}
          <TabsContent value="json" className="p-2 h-full">
            <JsonViewer data={currentSpan} style={{ fontSize: '10px' }} />
          </TabsContent>
          <TabsContent value="details" className="p-2 h-full">
            <SpanUIDetailsDisplay obj={currentSpan} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
