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
import { emitter } from "@/utils/eventEmitter";
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

  // Auto-trigger prompt for proactive analysis
  const [autoTriggerPrompt, setAutoTriggerPrompt] = useState<string | null>(null);
  const hasSetAutoTriggerRef = useRef(false);

  // Proactive behavior: when no workflow exists and no messages, auto-trigger analysis
  useEffect(() => {
    // Only set once per dataset session, when everything is loaded
    if (
      hasSetAutoTriggerRef.current ||
      workflowLoading ||
      agentLoading ||
      !agent ||
      !isConnected ||
      !selectedDatasetId
    ) {
      return;
    }

    // If no workflow and no existing messages, auto-trigger analysis
    if (!workflow && messages.length === 0) {
      hasSetAutoTriggerRef.current = true;
      // This will automatically send a message to the agent
      // NOTE: Only ask for analysis - do NOT ask to start workflow or apply changes
      setAutoTriggerPrompt(
        `I just opened the "${currentDataset?.name || 'dataset'}" dataset. Please analyze it and give me an overview of what I have. Do NOT start a workflow or make any changes yet - just show me the analysis and wait for my feedback.`
      );
    } else if (workflow && messages.length === 0) {
      // Workflow exists but no messages - auto-trigger status check
      hasSetAutoTriggerRef.current = true;
      setAutoTriggerPrompt(
        `I'm returning to my fine-tuning workflow for "${currentDataset?.name || 'dataset'}". The workflow is at the "${workflow.currentStep}" step. Please show me the current status and help me continue.`
      );
    }
  }, [workflow, workflowLoading, agentLoading, agent, isConnected, messages.length, selectedDatasetId, currentDataset?.name]);

  // Reset auto-trigger when dataset changes
  useEffect(() => {
    hasSetAutoTriggerRef.current = false;
    setAutoTriggerPrompt(null);
  }, [selectedDatasetId]);

  // Listen for external prompt triggers (e.g., "Generate for topic" button)
  useEffect(() => {
    const handleLucyPrompt = ({ prompt }: { prompt: string }) => {
      // Expand the sidebar if collapsed
      setIsCollapsed(false);
      // Clear first, then set - ensures re-trigger even if same prompt
      setAutoTriggerPrompt(null);
      // Use setTimeout to ensure the clear happens before setting new value
      setTimeout(() => {
        setAutoTriggerPrompt(prompt);
      }, 0);
    };

    emitter.on("vllora_lucy_prompt", handleLucyPrompt);
    return () => {
      emitter.off("vllora_lucy_prompt", handleLucyPrompt);
    };
  }, []);

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
          autoTriggerPrompt={autoTriggerPrompt}
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
