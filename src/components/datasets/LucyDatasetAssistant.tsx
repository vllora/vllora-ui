/**
 * LucyDatasetAssistant
 *
 * Lucy AI assistant sidebar for the datasets page.
 * Handles finetune workflow guidance with process-focused context.
 *
 * Key Features:
 * - Proactive analysis when opening a dataset
 * - Guided finetune workflow (topics → categorize → coverage → grader → dry run → train → deploy)
 * - Workflow state persistence in IndexedDB
 * - Back-and-forth refinement of suggestions
 */

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
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
import { useFineTuneAgentChat } from "@/hooks/useFineTuneAgentChat";
import {
  LucyChat,
  LucyProviderCheck,
  LucyDefaultToolRenderer,
  LucyAvatar,
} from "@/components/agent/lucy-agent";
import type { QuickAction } from "@/components/agent/lucy-agent/LucyWelcome";
import { cn } from "@/lib/utils";

// Finetune-focused quick actions for Lucy
const FINETUNE_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "start-finetune",
    icon: "🚀",
    label: "Start finetune workflow",
  },
  {
    id: "check-status",
    icon: "📊",
    label: "Check workflow status",
  },
  {
    id: "analyze-coverage",
    icon: "📈",
    label: "Analyze topic coverage",
  },
  {
    id: "generate-data",
    icon: "✨",
    label: "Generate synthetic data",
  },
  {
    id: "configure-grader",
    icon: "⚖️",
    label: "Configure evaluation grader",
  },
  {
    id: "run-dry-run",
    icon: "🧪",
    label: "Run dry run validation",
  },
];

export function LucyDatasetAssistant() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Get dataset ID from URL params (for detail page)
  const { datasetId: selectedDatasetId } = useParams<{ datasetId: string }>();

  const { datasets } = DatasetsConsumer();

  // Derive current dataset from datasets list and URL param
  const currentDataset = useMemo(() => {
    if (!selectedDatasetId) return null;
    const dataset = datasets.find(d => d.id === selectedDatasetId);
    return dataset ? { id: dataset.id, name: dataset.name, datasetObjective: dataset.datasetObjective } : null;
  }, [datasets, selectedDatasetId]);

  // Lucy agent state
  const { isConnected, reconnect } = useDistriConnection();
  const { providers, loading: providersLoading } = ProviderKeysConsumer();

  // Use finetune agent when viewing a specific dataset
  const {
    agent,
    agentLoading,
    threadId,
    tools,
    messages,
    workflow,
    workflowLoading,
    handleNewChat,
    prepareMessage,
  } = useFineTuneAgentChat({
    datasetId: selectedDatasetId || '',
    datasetName: currentDataset?.name,
    trainingGoals: currentDataset?.datasetObjective,
  });

  // Track if we've triggered proactive analysis for this session
  const hasTriggeredProactiveRef = useRef(false);
  const [proactivePrompt, setProactivePrompt] = useState<string | null>(null);

  // Proactive behavior: when no workflow exists and no messages, suggest starting
  useEffect(() => {
    // Only trigger once per session, when everything is loaded
    if (
      hasTriggeredProactiveRef.current ||
      workflowLoading ||
      agentLoading ||
      !agent ||
      !isConnected ||
      !selectedDatasetId
    ) {
      return;
    }

    // If no workflow and no existing messages, trigger proactive analysis
    if (!workflow && messages.length === 0) {
      hasTriggeredProactiveRef.current = true;
      // Set a proactive prompt that will be shown as a suggestion
      setProactivePrompt(
        `I see you've opened the "${currentDataset?.name || 'dataset'}" dataset. Would you like me to analyze it and help you start a fine-tuning workflow?`
      );
    } else if (workflow && messages.length === 0) {
      // Workflow exists but no messages - remind user of current status
      hasTriggeredProactiveRef.current = true;
      setProactivePrompt(
        `Welcome back! Your fine-tuning workflow is currently at the "${workflow.currentStep}" step. Would you like me to show you the status or help you continue?`
      );
    }
  }, [workflow, workflowLoading, agentLoading, agent, isConnected, messages.length, selectedDatasetId, currentDataset?.name]);

  // Reset proactive trigger when dataset changes
  useEffect(() => {
    hasTriggeredProactiveRef.current = false;
    setProactivePrompt(null);
  }, [selectedDatasetId]);

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

  // Attach finetune workflow context to messages before sending
  const handleBeforeSendMessage = useCallback(
    async (message: DistriMessage): Promise<DistriMessage> => {
      // The prepareMessage function handles context injection
      const userText = message.parts.find(p => p.part_type === 'text')?.data || '';
      return prepareMessage(userText);
    },
    [prepareMessage]
  );

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
          threadId={threadId}
          agent={agent}
          externalTools={tools}
          initialMessages={messages}
          beforeSendMessage={handleBeforeSendMessage}
          toolRenderers={toolRenderers}
          quickActions={FINETUNE_QUICK_ACTIONS}
          proactivePrompt={proactivePrompt}
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
