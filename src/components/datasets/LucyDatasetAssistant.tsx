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
import { uploadKnowledgeSourceHandler } from "@/lib/distri-finetune-tools/steps/knowledge-sources";
import * as knowledgeDB from "@/services/knowledge-sources-db";
import type { KnowledgeSourceType } from "@/types/dataset-types";
import { ProviderKeysConsumer } from "@/contexts/ProviderKeysContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { useFineTuneAgentChat } from "@/hooks/useFineTuneAgentChat";
import {
  LucyChat,
  LucyProviderCheck,
  LucyDefaultToolRenderer,
  LucyAvatar,
  lucyToolRenderers,
} from "@/components/agent/lucy-agent";
import type { QuickAction } from "@/components/agent/lucy-agent/LucyWelcome";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildDatasetAnalysisPrompt } from "./lucy-prompt-utils";

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

  // Get dataset from context (rendered inside DatasetDetailProvider)
  const { dataset: currentDataset, datasetId: selectedDatasetId, isLoading: datasetLoading, records } = DatasetDetailConsumer();

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

  // Store messages ref to check without triggering effect re-runs
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Store workflow ref to use in timeout without adding to dependencies
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;

  // Store records ref to use in timeout without adding to dependencies
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // Track knowledge sources count for guided onboarding
  const [knowledgeSourcesCount, setKnowledgeSourcesCount] = useState(0);
  const knowledgeSourcesCountRef = useRef(knowledgeSourcesCount);
  knowledgeSourcesCountRef.current = knowledgeSourcesCount;

  // Fetch knowledge sources count on mount and when updated
  useEffect(() => {
    if (!selectedDatasetId) return;

    const fetchCount = async () => {
      try {
        const sources = await knowledgeDB.getKnowledgeSourcesByDataset(selectedDatasetId);
        setKnowledgeSourcesCount(sources.length);
      } catch (error) {
        console.error("[LucyDatasetAssistant] Error fetching knowledge sources:", error);
      }
    };

    fetchCount();

    // Listen for updates
    const handleUpdate = ({ datasetId }: { datasetId: string }) => {
      if (datasetId === selectedDatasetId) {
        fetchCount();
      }
    };

    emitter.on("vllora_knowledge_source_updated", handleUpdate);
    return () => {
      emitter.off("vllora_knowledge_source_updated", handleUpdate);
    };
  }, [selectedDatasetId]);

  // Proactive behavior: auto-analyze dataset when viewing it for the first time
  useEffect(() => {
    // Skip if not ready
    if (
      datasetLoading ||
      workflowLoading ||
      agentLoading ||
      !agent ||
      !isConnected ||
      !selectedDatasetId ||
      !currentDataset
    ) {
      return;
    }

    // Skip if we already successfully triggered for this dataset
    if (lastAnalyzedDatasetRef.current === selectedDatasetId) {
      return;
    }

    // Skip if there are already messages (user has interacted)
    // Using ref to avoid re-running effect when messages change
    if (messagesRef.current.length > 0) {
      lastAnalyzedDatasetRef.current = selectedDatasetId;
      return;
    }

    // Capture values for the timeout (in case they change during the delay)
    const promptDataset = currentDataset;
    const targetDatasetId = selectedDatasetId;

    // Use a delay to ensure LucyChat is fully mounted and ready
    // Only mark as analyzed AFTER the trigger fires (prevents race condition with cleanup)
    const timer = setTimeout(() => {
      // Double-check we haven't already triggered and messages are still empty
      if (lastAnalyzedDatasetRef.current !== targetDatasetId && messagesRef.current.length === 0) {
        lastAnalyzedDatasetRef.current = targetDatasetId;
        // Use refs to get latest values at trigger time
        setAutoTriggerPrompt(buildDatasetAnalysisPrompt({
          dataset: promptDataset,
          workflow: workflowRef.current,
          recordCount: recordsRef.current.length,
          knowledgeSourcesCount: knowledgeSourcesCountRef.current,
          hasEvaluator: !!workflowRef.current?.graderConfig,
        }));
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [datasetLoading, workflowLoading, agentLoading, agent, isConnected, selectedDatasetId, currentDataset]);

  // Reset state when dataset changes - always start fresh
  useEffect(() => {
    setAutoTriggerPrompt(null);
    hasSetAutoTriggerRef.current = false;
    lastAnalyzedDatasetRef.current = null;
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
      ...lucyToolRenderers,
    }),
    []
  );

  // Helper to determine knowledge source type from mime type
  const getKnowledgeSourceType = useCallback((mimeType: string, fileName: string): KnowledgeSourceType => {
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('text/') || fileName.match(/\.(txt|md|json|csv)$/)) return 'text';
    return 'text'; // Default to text
  }, []);

  // Attach finetune workflow context to messages before sending
  // Also handles file uploads by creating knowledge sources
  const handleBeforeSendMessage = useCallback(
    async (message: DistriMessage): Promise<DistriMessage> => {
      // Extract text parts, file parts, and image parts separately
      const textParts = message.parts.filter(p => p.part_type === 'text');
      const fileParts = message.parts.filter(p => (p as any).part_type === 'file');
      const imageParts = message.parts.filter(p => p.part_type === 'image');

      // Combine all text parts into one message
      let userText = textParts.map(p => p.data).join('\n') || '';

      // Process file uploads as knowledge sources
      const uploadedFiles: string[] = [];
      const failedFiles: string[] = [];
      if (selectedDatasetId && fileParts.length > 0) {
        // Show processing toast
        const toastId = toast.loading(`Processing ${fileParts.length} file(s)...`, {
          description: 'Extracting content from documents',
        });

        for (const filePart of fileParts) {
          const fileData = (filePart as any).data;
          if (fileData && fileData.data && fileData.name) {
            try {
              const sourceType = getKnowledgeSourceType(fileData.mime_type || '', fileData.name);

              // Update toast with current file
              toast.loading(`Processing: ${fileData.name}`, {
                id: toastId,
                description: 'Extracting text and topics...',
              });

              const result = await uploadKnowledgeSourceHandler({
                dataset_id: selectedDatasetId,
                name: fileData.name,
                type: sourceType,
                content: fileData.data, // base64 content
                mime_type: fileData.mime_type,
              });

              if ((result as any).success) {
                uploadedFiles.push(fileData.name);
                console.log(`[LucyDatasetAssistant] Uploaded knowledge source: ${fileData.name}`);
              } else {
                failedFiles.push(fileData.name);
                console.error(`[LucyDatasetAssistant] Failed to upload ${fileData.name}:`, (result as any).error);
              }
            } catch (error) {
              failedFiles.push(fileData.name);
              console.error(`[LucyDatasetAssistant] Error uploading ${fileData.name}:`, error);
            }
          }
        }

        // Show completion toast
        if (uploadedFiles.length > 0 && failedFiles.length === 0) {
          toast.success(`Processed ${uploadedFiles.length} file(s)`, {
            id: toastId,
            description: uploadedFiles.join(', '),
          });
        } else if (uploadedFiles.length > 0 && failedFiles.length > 0) {
          toast.warning(`Processed ${uploadedFiles.length} file(s), ${failedFiles.length} failed`, {
            id: toastId,
            description: `Success: ${uploadedFiles.join(', ')}`,
          });
        } else {
          toast.error('Failed to process files', {
            id: toastId,
            description: failedFiles.join(', '),
          });
        }

        // Add upload notification and trigger setup plan
        if (uploadedFiles.length > 0) {
          // Emit event to refresh knowledge sources count
          emitter.emit("vllora_knowledge_source_updated", { datasetId: selectedDatasetId });

          // If user didn't type anything, prompt for setup plan
          if (!userText.trim()) {
            userText = `I've uploaded ${uploadedFiles.length} document(s): ${uploadedFiles.join(', ')}. Please use the propose_setup_plan tool to analyze these documents and create a comprehensive setup plan for this dataset. Show me the plan with topic hierarchy, data generation strategy, and evaluation criteria.`;
          } else {
            // User typed something - append the upload notice with tool suggestion
            const uploadNotice = `\n\n[Knowledge sources uploaded: ${uploadedFiles.join(', ')}. Use the propose_setup_plan tool to create a setup plan based on these documents.]`;
            userText += uploadNotice;
          }
        }
      }

      // The prepareMessage function handles context injection
      // Only pass through image parts (file parts have been processed as knowledge sources)
      return prepareMessage(userText, imageParts);
    },
    [prepareMessage, selectedDatasetId, getKnowledgeSourceType]
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
          proactivePrompt="Hi! I'm Lucy, your fine-tuning assistant. I'll help you prepare training data, configure evaluation, and train your model. Let me take a look at your dataset..."
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
