import { useMemo, useCallback, useEffect } from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { DatasetsUIProvider, DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { useDatasetAgentChat } from "@/hooks/useDatasetAgentChat";
import { Plus, Loader2 } from "lucide-react";
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
import {
  LucyChat,
  LucyProviderCheck,
  LucyDefaultToolRenderer,
  LucyAvatar,
} from "@/components/agent/lucy-agent";
import type { QuickAction } from "@/components/agent/lucy-agent/LucyWelcome";
import { DatasetsListView } from "@/components/datasets/DatasetsListView";
import { DatasetDetailView } from "@/components/datasets/DatasetDetailView";
import { setDatasetContext, clearDatasetContext } from "@/lib/distri-dataset-tools";

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

// Inner component that uses the UI context
function DatasetsPageContent() {
  const { datasets } = DatasetsConsumer();
  const {
    selectedDatasetId,
    currentDataset,
    selectedRecordIds,
    searchQuery,
    sortConfig,
    expandedDatasetIds,
    navigateToDataset,
    navigateToList,
  } = DatasetsUIConsumer();

  // Lucy agent state - using dataset-specific hook
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
  // This ensures tools have access to current context even when not passed through agent chain
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

    // Clear context when leaving the datasets page
    return () => {
      clearDatasetContext();
    };
  }, [datasets, selectedDatasetId, currentDataset, selectedRecordIds, searchQuery, sortConfig, expandedDatasetIds]);

  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground">
      {/* Left Panel - Lucy Chat */}
      <div className="w-[384px] flex-shrink-0 border-r border-border flex flex-col bg-background">
        {/* Lucy Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <LucyAvatar size="sm" />
            <span className="font-semibold text-sm">Lucy Assistant</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wide">
              Beta
            </span>
          </div>
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
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
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
        </div>
      </div>

      {/* Right Panel - Datasets List or Detail View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedDatasetId ? (
          <DatasetDetailView
            datasetId={selectedDatasetId}
            onBack={navigateToList}
            onSelectDataset={navigateToDataset}
          />
        ) : (
          <DatasetsListView onSelectDataset={navigateToDataset} />
        )}
      </div>
    </section>
  );
}

// Main component wrapped with UI provider
export function DatasetsPage() {
  return (
    <DatasetsUIProvider>
      <DatasetsPageContent />
    </DatasetsUIProvider>
  );
}
