/**
 * LucyDatasetAssistant
 *
 * Lucy AI assistant sidebar for the datasets page.
 * Handles chat with dataset-specific context and quick actions.
 */

import { useMemo, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { Plus, Loader2, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DistriMessage } from "@distri/core";
import { useDistriConnection } from "@/providers/DistriProvider";
import { ProviderKeysConsumer } from "@/contexts/ProviderKeysContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { useDatasetAgentChat } from "@/hooks/useDatasetAgentChat";
import {
  LucyChat,
  LucyProviderCheck,
  LucyDefaultToolRenderer,
  LucyAvatar,
} from "@/components/agent/lucy-agent";
import type { QuickAction } from "@/components/agent/lucy-agent/LucyWelcome";
import { setDatasetContext, clearDatasetContext } from "@/lib/distri-dataset-tools";
import { cn } from "@/lib/utils";

// Dataset-specific quick actions for Lucy
const DATASET_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "list-datasets",
    icon: "📋",
    label: "List all my datasets",
  },
  {
    id: "create-dataset",
    icon: "➕",
    label: "Create a new dataset",
  },
  {
    id: "analyze-current",
    icon: "🔍",
    label: "Analyze current dataset",
  },
  {
    id: "suggest-topics",
    icon: "🗂",
    label: "Suggest topics for records",
  },
  {
    id: "find-duplicates",
    icon: "🔄",
    label: "Find duplicate records",
  },
  {
    id: "export-dataset",
    icon: "📤",
    label: "Export this dataset",
  },
];

export function LucyDatasetAssistant() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Get dataset ID from URL params (for detail page)
  const { datasetId: selectedDatasetId } = useParams<{ datasetId: string }>();

  const { datasets } = DatasetsConsumer();
  const {
    selectedRecordIds,
    searchQuery,
    sortConfig,
    expandedDatasetIds,
  } = DatasetsUIConsumer();

  // Derive current dataset from datasets list and URL param
  const currentDataset = useMemo(() => {
    if (!selectedDatasetId) return null;
    const dataset = datasets.find(d => d.id === selectedDatasetId);
    return dataset ? { id: dataset.id, name: dataset.name } : null;
  }, [datasets, selectedDatasetId]);

  // Lucy agent state
  const { isConnected, reconnect } = useDistriConnection();
  const { providers, loading: providersLoading } = ProviderKeysConsumer();
  const {
    agent,
    agentLoading,
    selectedThreadId,
    tools,
    messages,
    handleNewChat,
  } = useDatasetAgentChat();

  const isOpenAIConfigured = useMemo(() => {
    const openaiProvider = providers.find(p => p.name.toLowerCase() === "openai");
    return openaiProvider?.has_credentials ?? false;
  }, [providers]);

  const toolRenderers = useMemo(
    () => ({
      default: LucyDefaultToolRenderer,
    }),
    []
  );

  // Attach rich dataset context to messages before sending
  const handleBeforeSendMessage = useCallback(
    async (message: DistriMessage): Promise<DistriMessage> => {
      const ctx = {
        page: "datasets",
        current_view: selectedDatasetId ? "detail" : "list",
        current_dataset_id: selectedDatasetId,
        current_dataset_name: currentDataset?.name,
        datasets_count: datasets.length,
        dataset_names: datasets.map(d => ({ id: d.id, name: d.name })),
        selected_records_count: selectedRecordIds.size,
        selected_record_ids: selectedRecordIds.size > 0 ? [...selectedRecordIds] : undefined,
        search_query: searchQuery || undefined,
        sort_config: sortConfig,
        expanded_dataset_ids: expandedDatasetIds.size > 0 ? [...expandedDatasetIds] : undefined,
      };

      const contextText = `Context:\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``;
      const contextPart = { part_type: "text" as const, data: contextText };

      return { ...message, parts: [contextPart, ...message.parts] };
    },
    [datasets, selectedDatasetId, currentDataset, selectedRecordIds, searchQuery, sortConfig, expandedDatasetIds]
  );

  // Keep the context store updated for composite tools to read from
  useEffect(() => {
    setDatasetContext({
      page: "datasets",
      current_view: selectedDatasetId ? "detail" : "list",
      current_dataset_id: selectedDatasetId ?? undefined,
      current_dataset_name: currentDataset?.name,
      datasets_count: datasets.length,
      dataset_names: datasets.map(d => ({ id: d.id, name: d.name })),
      selected_records_count: selectedRecordIds.size,
      selected_record_ids: selectedRecordIds.size > 0 ? [...selectedRecordIds] : undefined,
      search_query: searchQuery || undefined,
      sort_config: sortConfig ?? { field: "timestamp", direction: "desc" },
      expanded_dataset_ids: expandedDatasetIds.size > 0 ? [...expandedDatasetIds] : undefined,
    });

    return () => {
      clearDatasetContext();
    };
  }, [datasets, selectedDatasetId, currentDataset, selectedRecordIds, searchQuery, sortConfig, expandedDatasetIds]);

  // Render chat content (always mounted to preserve state)
  const chatContent = (
    <>
      {providersLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Checking configuration...
            </span>
          </div>
        </div>
      ) : !isOpenAIConfigured ? (
        <LucyProviderCheck onReady={reconnect} />
      ) : agentLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Loading assistant...
            </span>
          </div>
        </div>
      ) : isConnected && agent ? (
        <LucyChat
          threadId={selectedThreadId}
          agent={agent}
          externalTools={tools}
          initialMessages={messages}
          beforeSendMessage={handleBeforeSendMessage}
          toolRenderers={toolRenderers}
          quickActions={DATASET_QUICK_ACTIONS}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Connecting to assistant...
            </span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex-shrink-0 border-r border-border flex flex-col min-h-0 bg-background transition-all duration-200",
        isCollapsed ? "w-14" : "w-[384px]"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b shrink-0 transition-all duration-200",
        isCollapsed ? "flex-col py-3 gap-3" : "justify-between px-4 py-3"
      )}>
        {isCollapsed ? (
          // Collapsed header
          <>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsCollapsed(false)}
                    className="flex items-center justify-center hover:bg-muted/50 rounded-lg p-1.5 transition-colors"
                  >
                    <LucyAvatar size="sm" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand Lucy Assistant</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsCollapsed(false)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        ) : (
          // Expanded header
          <>
            <div className="flex items-center gap-2.5">
              <LucyAvatar size="sm" />
              <span className="font-semibold text-sm">Lucy Assistant</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wide">
                Beta
              </span>
            </div>
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleNewChat}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New Chat</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setIsCollapsed(true)}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Collapse</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </>
        )}
      </div>

      {/* Chat Content - hidden when collapsed but stays mounted */}
      <div className={cn(
        "flex-1 flex flex-col min-h-0 overflow-hidden transition-all duration-200",
        isCollapsed && "hidden"
      )}>
        {chatContent}
      </div>
    </div>
  );
}
