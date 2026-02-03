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

  // Derive current dataset from datasets list and URL param (full dataset object for context)
  const currentDataset = useMemo(() => {
    if (!selectedDatasetId) return null;
    return datasets.find(d => d.id === selectedDatasetId) || null;
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
  const lastAnalyzedDatasetRef = useRef<string | null>(null);

  // Proactive behavior: auto-analyze dataset when viewing it for the first time
  useEffect(() => {
    // Skip if not ready
    if (
      workflowLoading ||
      agentLoading ||
      !agent ||
      !isConnected ||
      !selectedDatasetId ||
      !currentDataset
    ) {
      return;
    }

    // Skip if we already analyzed this dataset in this session
    if (lastAnalyzedDatasetRef.current === selectedDatasetId) {
      return;
    }

    // Skip if there are already messages (user has interacted)
    if (messages.length > 0) {
      lastAnalyzedDatasetRef.current = selectedDatasetId;
      return;
    }

    // Mark as analyzed
    lastAnalyzedDatasetRef.current = selectedDatasetId;
    hasSetAutoTriggerRef.current = true;

    // Build contextual prompt based on dataset state
    const buildPrompt = () => {
      const name = currentDataset.name;
      const objective = currentDataset.datasetObjective;
      const hasTopics = !!(currentDataset.topicHierarchy?.hierarchy?.length);
      const hasEvaluator = !!(
        currentDataset.evaluationConfig &&
        ((currentDataset.evaluationConfig.type === 'js' && currentDataset.evaluationConfig.script) ||
         (currentDataset.evaluationConfig.type === 'llm_as_judge' && currentDataset.evaluationConfig.promptTemplate))
      );
      const workflowStep = workflow?.currentStep || 'not_started';

      let prompt = `I'm viewing the dataset "${name}". `;

      if (objective) {
        prompt += `Training objective: "${objective}". `;
      }

      if (hasTopics) {
        prompt += `Has topic hierarchy configured. `;
      }

      if (hasEvaluator) {
        prompt += `Has evaluator configured. `;
      }

      if (workflow && workflowStep !== 'not_started' && workflowStep !== 'completed') {
        prompt += `Workflow is at step: ${workflowStep}. `;
      }

      prompt += `Please analyze the current state and recommend what I should do next.`;

      return prompt;
    };

    // Use a delay to ensure LucyChat is fully mounted and ready
    const timer = setTimeout(() => {
      setAutoTriggerPrompt(buildPrompt());
    }, 300);

    return () => clearTimeout(timer);
  }, [workflow, workflowLoading, agentLoading, agent, isConnected, messages.length, selectedDatasetId, currentDataset]);

  // Reset auto-trigger prompt when dataset changes (allow new analysis)
  useEffect(() => {
    // Clear the prompt but don't reset lastAnalyzedDatasetRef
    // (that's handled in the main effect to allow re-analysis on revisit)
    setAutoTriggerPrompt(null);
    hasSetAutoTriggerRef.current = false;
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
