/**
 * LucySidebar
 *
 * Right sidebar containing the Lucy AI assistant.
 * Extracted from the former LucyDatasetAssistant monolith.
 *
 * Key Features:
 * - Proactive analysis when opening a dataset
 * - Guided finetune workflow (topics → categorize → coverage → grader → dry run → train → deploy)
 * - Workflow state persistence in IndexedDB
 * - Back-and-forth refinement of suggestions
 * - Always visible — no tab switching needed
 */

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { Plus, PanelRightClose, PanelRight, Settings2, Plug, Rocket, BarChart3, TrendingUp, Sparkles, Scale, FlaskConical, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
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
import type { KnowledgeSourceType } from "@/types/dataset-types";
import { ProviderKeysConsumer } from "@/contexts/ProviderKeysContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { PlanConsumer } from "@/contexts/PlanContext";
import { evalJobService, iterationStateService } from "@/services/service-registry";
import { useFineTuneAgentChat } from "@/hooks/useFineTuneAgentChat";
import {
  LucyChat,
  LucyProviderCheck,
  LucyDefaultToolRenderer,
  LucyAvatar,
  lucyToolRenderers,
} from "@/components/agent/lucy-agent";
import { LucyCatchUpCard } from "@/components/agent/lucy-agent/plan-render/LucyCatchUpCard";
import type { QuickAction } from "@/components/agent/lucy-agent/LucyWelcome";
import { DatasetStatusSummary } from "@/components/agent/lucy-agent/DatasetStatusSummary";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildDatasetAnalysisPrompt } from "../lucy-prompt-utils";

// Icon size for quick actions
const QA_ICON = "w-4 h-4";

// All available quick actions (plain language for non-technical users)
const ALL_QUICK_ACTIONS: Record<string, QuickAction> = {
  "start-finetune": { id: "start-finetune", icon: <Rocket className={QA_ICON} />, label: "Start training setup", prompt: "Help me set up fine-tuning for this experiment. Analyze what I have and create a plan." },
  "check-status": { id: "check-status", icon: <BarChart3 className={QA_ICON} />, label: "Check progress", prompt: "What's the current status of my fine-tuning workflow? Summarize where I am and what's next." },
  "analyze-coverage": { id: "analyze-coverage", icon: <TrendingUp className={QA_ICON} />, label: "Check data variety", prompt: "Analyze the topic coverage and balance of my training data. Are there any gaps?" },
  "generate-data": { id: "generate-data", icon: <Sparkles className={QA_ICON} />, label: "Create more examples", prompt: "Generate more synthetic training examples to improve coverage and balance." },
  "configure-grader": { id: "configure-grader", icon: <Scale className={QA_ICON} />, label: "Set up evaluation", prompt: "Help me configure an evaluation grader to score the quality of my training data." },
  "run-dry-run": { id: "run-dry-run", icon: <FlaskConical className={QA_ICON} />, label: "Test before training", prompt: "Run an evaluation on a sample of my data to check quality before training." },
  "start-training": { id: "start-training", icon: <Rocket className={QA_ICON} />, label: "Start training", prompt: "Start the fine-tuning training job with my current experiment configuration." },
};

/** Return context-appropriate quick actions based on workflow state */
function getContextualQuickActions(recordCount: number, hasEvaluator: boolean, jobsCount: number): QuickAction[] {
  if (recordCount === 0) {
    return [ALL_QUICK_ACTIONS["start-finetune"], ALL_QUICK_ACTIONS["generate-data"]];
  }
  if (!hasEvaluator) {
    return [ALL_QUICK_ACTIONS["analyze-coverage"], ALL_QUICK_ACTIONS["configure-grader"], ALL_QUICK_ACTIONS["generate-data"]];
  }
  if (jobsCount === 0) {
    return [ALL_QUICK_ACTIONS["run-dry-run"], ALL_QUICK_ACTIONS["start-training"], ALL_QUICK_ACTIONS["analyze-coverage"]];
  }
  return [ALL_QUICK_ACTIONS["check-status"], ALL_QUICK_ACTIONS["generate-data"], ALL_QUICK_ACTIONS["analyze-coverage"]];
}

// Responsive width: 384px on wide screens, 340px on standard
const SIDEBAR_WIDTH_WIDE = 'w-[384px]';
const SIDEBAR_WIDTH_STANDARD = 'w-[340px]';
const BREAKPOINT_COLLAPSE = 1024;
const BREAKPOINT_WIDE = 1536;

export function LucySidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isPinned, setIsPinned] = useState(() => localStorage.getItem("lucy-sidebar-pinned") === "true");
  const [sidebarWidthClass, setSidebarWidthClass] = useState(SIDEBAR_WIDTH_WIDE);

  // Connection timeout state
  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  const connectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unread message tracking for collapsed sidebar indicator
  const [unreadCount, setUnreadCount] = useState(0);
  const collapsedMessageCountRef = useRef(0);
  const isCollapsedRef = useRef(isCollapsed);
  isCollapsedRef.current = isCollapsed;

  // Unreviewed job results badge
  const [hasUnreviewedResults, setHasUnreviewedResults] = useState(false);

  // Iteration number badge
  const [iterationNumber, setIterationNumber] = useState(0);

  // Active eval job tracking (for live progress card)

  // Persist pin state to localStorage
  const togglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem("lucy-sidebar-pinned", String(next));
      return next;
    });
  }, []);

  // Auto-collapse on narrow viewports (unless pinned), adjust width on resize
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < BREAKPOINT_COLLAPSE && !isPinned) {
        setIsCollapsed(true);
      }
      setSidebarWidthClass(width >= BREAKPOINT_WIDE ? SIDEBAR_WIDTH_WIDE : SIDEBAR_WIDTH_STANDARD);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isPinned]);

  // Get dataset from context
  const { dataset: currentDataset, datasetId: selectedDatasetId, isLoading: datasetLoading, records, activeSection } = DatasetDetailConsumer();
  const { filteredJobs } = FinetuneJobsConsumer();

  // Lucy agent state
  const { isConnected, reconnect } = useDistriConnection();
  const { providers, loading: providersLoading } = ProviderKeysConsumer();
  const { planStatus, executionProgress, isGeneratingPlan, isExecuting } = PlanConsumer();

  // Connection timeout: 15s to detect stalled connections
  useEffect(() => {
    if (isConnected) {
      setConnectionTimedOut(false);
      if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
      return;
    }
    connectionTimerRef.current = setTimeout(() => setConnectionTimedOut(true), 15000);
    return () => { if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current); };
  }, [isConnected]);

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
    catchUpCards,
  } = useFineTuneAgentChat({
    datasetId: selectedDatasetId || '',
    datasetName: currentDataset?.name,
    trainingGoals: currentDataset?.datasetObjective,
    planStatus,
    executionProgress,
  });

  // Track unread messages while sidebar is collapsed
  useEffect(() => {
    if (isCollapsed) {
      collapsedMessageCountRef.current = messages.length;
    } else {
      setUnreadCount(0);
    }
  }, [isCollapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update unread count when messages change while collapsed
  useEffect(() => {
    if (isCollapsedRef.current && messages.length > collapsedMessageCountRef.current) {
      setUnreadCount(messages.length - collapsedMessageCountRef.current);
    }
  }, [messages.length]);

  // Auto-trigger prompt for proactive analysis
  const [autoTriggerPrompt, setAutoTriggerPrompt] = useState<string | null>(null);
  const hasSetAutoTriggerRef = useRef(false);
  const lastAnalyzedDatasetRef = useRef<string | null>(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;

  const recordsRef = useRef(records);
  recordsRef.current = records;

  const planStatusRef = useRef(planStatus);
  planStatusRef.current = planStatus;

  // Knowledge sources from context
  const { count: knowledgeSourcesCount, isProcessing: docsProcessing } = KnowledgeSourcesConsumer();
  const knowledgeSourcesCountRef = useRef(knowledgeSourcesCount);
  knowledgeSourcesCountRef.current = knowledgeSourcesCount;

  const prevDocsProcessingRef = useRef(docsProcessing);
  const pendingDocsPlanTriggerRef = useRef(false);

  // Proactive behavior: auto-analyze dataset when viewing it for the first time
  useEffect(() => {
    if (
      datasetLoading || workflowLoading || agentLoading ||
      !agent || !isConnected || !selectedDatasetId || !currentDataset
    ) return;

    if (lastAnalyzedDatasetRef.current === selectedDatasetId) return;

    if (messagesRef.current.length > 0) {
      lastAnalyzedDatasetRef.current = selectedDatasetId;
      return;
    }

    if (planStatus === 'proposed') {
      lastAnalyzedDatasetRef.current = selectedDatasetId;
      return;
    }

    const targetDatasetId = selectedDatasetId;
    const timer = setTimeout(() => {
      if (lastAnalyzedDatasetRef.current !== targetDatasetId && messagesRef.current.length === 0) {
        lastAnalyzedDatasetRef.current = targetDatasetId;
        // Check if Lucy has previously analyzed this dataset.
        // A workflow at 'not_started' doesn't count — it's auto-created when the dataset
        // is created (with an objective) but hasn't been touched by Lucy yet.
        const wf = workflowRef.current;
        const hasBeenAnalyzed = (wf !== null && wf.currentStep !== 'not_started') ||
          (planStatusRef.current && planStatusRef.current !== 'dismissed');
        if (hasBeenAnalyzed) {
          return;
        }
        // New dataset — trigger Lucy analysis (works for both empty and trace-imported)
        const isEmpty = recordsRef.current.length === 0;
        const prompt = buildDatasetAnalysisPrompt(isEmpty);
        setAutoTriggerPrompt(prompt);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [datasetLoading, workflowLoading, agentLoading, agent, isConnected, selectedDatasetId, currentDataset, planStatus]);

  // Reset state when dataset changes
  useEffect(() => {
    setAutoTriggerPrompt(null);
    hasSetAutoTriggerRef.current = false;
    lastAnalyzedDatasetRef.current = null;
  }, [selectedDatasetId]);

  // Auto-prompt Lucy when document extraction completes
  useEffect(() => {
    const wasProcessing = prevDocsProcessingRef.current;
    prevDocsProcessingRef.current = docsProcessing;

    if (wasProcessing && !docsProcessing && pendingDocsPlanTriggerRef.current) {
      pendingDocsPlanTriggerRef.current = false;

      if (planStatus && planStatus !== 'proposed' && planStatus !== 'dismissed') {
        console.log('[LucySidebar] Documents ready, but plan already active (status:', planStatus, ') — skipping auto-prompt');
        return;
      }

      console.log('[LucySidebar] Documents ready, auto-triggering plan creation');
      emitter.emit("vllora_lucy_prompt", {
        prompt: `My documents have finished processing and are ready. Please analyze them and create a plan now.`,
      });
    }
  }, [docsProcessing, planStatus]);

  // Listen for docs awaiting plan
  useEffect(() => {
    const handleDocsAwaiting = ({ datasetId }: { datasetId: string }) => {
      if (datasetId === selectedDatasetId) {
        console.log('[LucySidebar] Docs awaiting plan — setting pending trigger');
        pendingDocsPlanTriggerRef.current = true;
      }
    };

    emitter.on('vllora_docs_awaiting_plan', handleDocsAwaiting);
    return () => { emitter.off('vllora_docs_awaiting_plan', handleDocsAwaiting); };
  }, [selectedDatasetId]);

  // Check for unreviewed dry run job results (notification badge)
  useEffect(() => {
    if (!selectedDatasetId) {
      setHasUnreviewedResults(false);
      return;
    }

    const checkUnreviewed = async () => {
      try {
        const jobs = await evalJobService.getByDataset(selectedDatasetId);
        const hasUnreviewed = jobs.some(
          (j) => (j.status === 'completed' || j.status === 'failed') && !j.reviewedByAgent
        );
        setHasUnreviewedResults(hasUnreviewed);
      } catch {
        // Non-critical — don't break the sidebar
      }
    };

    checkUnreviewed();

    // Re-check when dry run jobs complete or get reviewed
    const handleJobCompleted = ({ datasetId }: { jobId: string; datasetId: string; verdict: string }) => {
      if (datasetId === selectedDatasetId) setHasUnreviewedResults(true);
    };
    const handleJobReviewed = () => { checkUnreviewed(); };

    emitter.on('vllora_dry_run_job_completed', handleJobCompleted);
    emitter.on('vllora_workflow_updated', handleJobReviewed);
    return () => {
      emitter.off('vllora_dry_run_job_completed', handleJobCompleted);
      emitter.off('vllora_workflow_updated', handleJobReviewed);
    };
  }, [selectedDatasetId]);

  // Track iteration number for sidebar badge
  useEffect(() => {
    if (!selectedDatasetId) {
      setIterationNumber(0);
      return;
    }

    const fetchIteration = async () => {
      try {
        const state = await iterationStateService.get(selectedDatasetId);
        setIterationNumber(state?.iterationNumber ?? 0);
      } catch {
        // Non-critical
      }
    };

    fetchIteration();

    // Re-check when workflow updates (iteration may have advanced)
    const handleWorkflowUpdated = () => { fetchIteration(); };
    emitter.on('vllora_workflow_updated', handleWorkflowUpdated);
    return () => { emitter.off('vllora_workflow_updated', handleWorkflowUpdated); };
  }, [selectedDatasetId]);

  // Auto-prompt Lucy when evaluation completes in background
  useEffect(() => {
    const handleEvalCompleted = ({ datasetId, verdict }: { jobId: string; datasetId: string; verdict: string }) => {
      if (datasetId !== selectedDatasetId) return;

      const msg = verdict === 'FAILED'
        ? 'The evaluation has failed. Please check what went wrong and advise on next steps.'
        : `The evaluation has completed (verdict: ${verdict}). Please analyze the results and tell me what you recommend.`;

      emitter.emit('vllora_lucy_prompt', { prompt: msg });
    };

    emitter.on('vllora_dry_run_job_completed', handleEvalCompleted);
    return () => { emitter.off('vllora_dry_run_job_completed', handleEvalCompleted); };
  }, [selectedDatasetId]);

  // Auto-prompt Lucy when training completes in background
  useEffect(() => {
    const handleTrainingCompleted = ({ datasetId }: { jobId: string; datasetId: string }) => {
      if (datasetId !== selectedDatasetId) return;

      emitter.emit('vllora_lucy_prompt', {
        prompt: 'The fine-tune training job has completed. Please analyze the training results and tell me how it went.',
      });
    };

    emitter.on('vllora_finetune_job_completed', handleTrainingCompleted);
    return () => { emitter.off('vllora_finetune_job_completed', handleTrainingCompleted); };
  }, [selectedDatasetId]);



  // Listen for external prompt triggers (e.g., "Generate for topic" button)
  // In dual-sidebar layout: just expand Lucy sidebar, no tab switching needed
  useEffect(() => {
    const handleLucyPrompt = ({ prompt }: { prompt: string }) => {
      setIsCollapsed(false);
      setAutoTriggerPrompt(null);
      setTimeout(() => { setAutoTriggerPrompt(prompt); }, 0);
    };

    emitter.on("vllora_lucy_prompt", handleLucyPrompt);
    return () => { emitter.off("vllora_lucy_prompt", handleLucyPrompt); };
  }, []);

  const isOpenAIConfigured = useMemo(() => {
    const openaiProvider = providers.find(p => p.name.toLowerCase() === "openai");
    return openaiProvider?.has_credentials ?? false;
  }, [providers]);

  const toolRenderers = useMemo(
    () => ({ default: LucyDefaultToolRenderer, ...lucyToolRenderers }),
    []
  );

  const contextualQuickActions = useMemo(
    () => getContextualQuickActions(records.length, !!currentDataset?.evalScript, filteredJobs.length),
    [records.length, currentDataset?.evalScript, filteredJobs.length]
  );

  // Status summary for previously-analyzed datasets (shown instead of LLM auto-trigger).
  // Also shown when docs are processing so Lucy acknowledges the activity.
  // A workflow at 'not_started' doesn't count — it's auto-created with the dataset.
  const statusSummary = useMemo(() => {
    const hasBeenAnalyzed = (workflow !== null && workflow.currentStep !== 'not_started') ||
      (planStatus && planStatus !== 'dismissed');
    if (!hasBeenAnalyzed && !docsProcessing) return undefined;
    return (
      <DatasetStatusSummary
        recordCount={records.length}
        workflow={workflow}
        hasEvalScript={!!currentDataset?.evalScript}
        jobCount={filteredJobs.length}
        planStatus={planStatus}
        docsProcessing={docsProcessing}
      />
    );
  }, [records.length, workflow, currentDataset?.evalScript, filteredJobs.length, planStatus, docsProcessing]);

  // Build unified catch-up card from structured data (session resume)
  const catchUpCardsNode = useMemo(() => {
    if (!catchUpCards) return undefined;
    return <LucyCatchUpCard data={catchUpCards} />;
  }, [catchUpCards]);

  const getKnowledgeSourceType = useCallback((mimeType: string, fileName: string): KnowledgeSourceType => {
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('text/') || fileName.match(/\.(txt|md|json|csv)$/)) return 'text';
    return 'text';
  }, []);

  // Attach finetune workflow context to messages before sending
  // Also handles file uploads by creating knowledge sources
  const handleBeforeSendMessage = useCallback(
    async (message: DistriMessage): Promise<DistriMessage> => {
      const textParts = message.parts.filter(p => p.part_type === 'text');
      const fileParts = message.parts.filter(p => (p as any).part_type === 'file');
      const imageParts = message.parts.filter(p => p.part_type === 'image');

      let userText = textParts.map(p => p.data).join('\n') || '';

      const uploadedFiles: string[] = [];
      const failedFiles: string[] = [];
      if (selectedDatasetId && fileParts.length > 0) {
        const toastId = toast.loading(`Processing ${fileParts.length} file(s)...`, {
          description: 'Extracting content from documents',
        });

        for (const filePart of fileParts) {
          const fileData = (filePart as any).data;
          if (fileData && fileData.data && fileData.name) {
            try {
              const sourceType = getKnowledgeSourceType(fileData.mime_type || '', fileData.name);
              toast.loading(`Processing: ${fileData.name}`, { id: toastId, description: 'Extracting text and topics...' });

              const result = await uploadKnowledgeSourceHandler({
                dataset_id: selectedDatasetId,
                name: fileData.name,
                type: sourceType,
                content: fileData.data,
                mime_type: fileData.mime_type,
              });

              if ((result as any).success) {
                uploadedFiles.push(fileData.name);
                console.log(`[LucySidebar] Uploaded knowledge source: ${fileData.name}`);
              } else {
                failedFiles.push(fileData.name);
                console.error(`[LucySidebar] Failed to upload ${fileData.name}:`, (result as any).error);
              }
            } catch (error) {
              failedFiles.push(fileData.name);
              console.error(`[LucySidebar] Error uploading ${fileData.name}:`, error);
            }
          }
        }

        if (uploadedFiles.length > 0 && failedFiles.length === 0) {
          toast.success(`Processed ${uploadedFiles.length} file(s)`, { id: toastId, description: uploadedFiles.join(', ') });
        } else if (uploadedFiles.length > 0 && failedFiles.length > 0) {
          toast.warning(`Processed ${uploadedFiles.length} file(s), ${failedFiles.length} failed`, { id: toastId, description: `Success: ${uploadedFiles.join(', ')}` });
        } else {
          toast.error('Failed to process files', { id: toastId, description: failedFiles.join(', ') });
        }

        if (uploadedFiles.length > 0) {
          emitter.emit("vllora_knowledge_source_updated", { datasetId: selectedDatasetId });

          const currentPlanStatus = planStatusRef.current;
          if (currentPlanStatus === "executing") {
            // Mid-workflow: docs will be incorporated in the next round
            pendingDocsPlanTriggerRef.current = false;
            if (!userText.trim()) {
              userText = `I've uploaded ${uploadedFiles.length} document(s): ${uploadedFiles.join(', ')}. Since a plan is currently executing, they'll be incorporated after this round completes.`;
            } else {
              userText += `\n\n[Knowledge sources uploaded: ${uploadedFiles.join(', ')}. Plan is executing — documents will be incorporated after this round.]`;
            }
          } else if (currentPlanStatus === "completed") {
            // Post-workflow: suggest re-analysis
            pendingDocsPlanTriggerRef.current = true;
            if (!userText.trim()) {
              userText = `I've uploaded new document(s): ${uploadedFiles.join(', ')}. Please analyze them and suggest how to incorporate them into my existing dataset.`;
            } else {
              userText += `\n\n[New knowledge sources uploaded: ${uploadedFiles.join(', ')}. Please analyze and suggest integration into the existing dataset.]`;
            }
          } else {
            // No plan or proposed/dismissed: default behavior (auto-plan trigger)
            pendingDocsPlanTriggerRef.current = true;
            if (!userText.trim()) {
              userText = `I've uploaded ${uploadedFiles.length} document(s): ${uploadedFiles.join(', ')}. They are being processed now — I'll let you know when they're ready so you can create a plan.`;
            } else {
              userText += `\n\n[Knowledge sources uploaded: ${uploadedFiles.join(', ')}. Documents are being processed — plan creation will be triggered automatically when extraction completes.]`;
            }
          }
        }
      }

      return prepareMessage(userText, imageParts);
    },
    [prepareMessage, selectedDatasetId, getKnowledgeSourceType]
  );

  // Chat content — always visible in right sidebar
  const chatContent = (
    <>
      {providersLoading ? (
        <LoadingIndicator
          variant="section"
          icon={<Settings2 className="h-6 w-6 text-muted-foreground animate-spin" style={{ animationDuration: '2s' }} />}
          message="Checking configuration..."
          submessage="Verifying API keys and providers"
          className="h-full"
        />
      ) : !isOpenAIConfigured ? (
        <LucyProviderCheck onReady={reconnect} />
      ) : agentLoading ? (
        <LoadingIndicator
          variant="section"
          icon={<div className="opacity-50"><LucyAvatar size="md" /></div>}
          message="Loading Lucy..."
          submessage="Preparing the assistant agent"
          className="h-full"
        />
      ) : isConnected && agent ? (
        <div className="flex flex-col h-full min-h-0">
          <LucyChat
            threadId={threadId}
            agent={agent}
            externalTools={tools}
            initialMessages={messages}
            beforeSendMessage={handleBeforeSendMessage}
            toolRenderers={toolRenderers}
            quickActions={contextualQuickActions}
            proactivePrompt="Hi! I'm Lucy, your fine-tuning assistant. I can help you organize training data, set up evaluation criteria, and run training jobs. What would you like to work on?"
            autoTriggerPrompt={autoTriggerPrompt}
            activeSection={activeSection}
            statusSummary={statusSummary}
            catchUpCards={catchUpCardsNode}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <Plug className={cn("h-6 w-6 text-muted-foreground", !connectionTimedOut && "animate-pulse")} />
          {connectionTimedOut ? (
            <>
              <p className="text-sm font-medium text-foreground">Connection timed out</p>
              <p className="text-xs text-muted-foreground text-center px-6">Could not reach the assistant server. Check your connection and try again.</p>
              <Button variant="outline" size="sm" onClick={() => { setConnectionTimedOut(false); reconnect(); }}>
                Retry
              </Button>
            </>
          ) : (
            <LoadingIndicator variant="progress" message="Connecting..." submessage="Establishing connection to the assistant" />
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "flex-shrink-0 border-l border-border flex flex-col min-h-0 bg-background transition-all duration-200",
        isCollapsed ? "w-14" : sidebarWidthClass
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b shrink-0 transition-all duration-200",
        isCollapsed ? "flex-col py-3 gap-3" : "justify-between px-3 py-2.5"
      )}>
        {isCollapsed ? (
          // Collapsed header — right sidebar (tooltips point left)
          <>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsCollapsed(false)}
                    className="relative flex items-center justify-center hover:bg-muted/50 rounded-lg p-1.5 transition-colors"
                  >
                    <LucyAvatar size="sm" />
                    {!providersLoading && !isOpenAIConfigured && (
                      <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-background" />
                    )}
                    {hasUnreviewedResults && isOpenAIConfigured && (
                      <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-background" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Expand Lucy</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Collapsed activity indicators */}
            {(agentLoading || isGeneratingPlan || isExecuting) && (
              <span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--theme-500))] animate-pulse" />
            )}
            {isExecuting && executionProgress && (
              <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                {executionProgress.current_step}/{executionProgress.total_steps}
              </span>
            )}
            {unreadCount > 0 && !isExecuting && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setIsCollapsed(false)}
                      className="flex items-center justify-center w-5 h-5 rounded-full bg-[rgb(var(--theme-500))] text-white text-[10px] font-bold"
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">{unreadCount} new message{unreadCount !== 1 ? "s" : ""}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsCollapsed(false)}>
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Expand</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        ) : (
          // Expanded header: Lucy label + action buttons
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative">
                <LucyAvatar size="sm" />
                {hasUnreviewedResults && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-background" />
                )}
              </div>
              <span className="text-[13px] font-semibold text-foreground">Lucy</span>
              {iterationNumber > 0 && (
                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                  Iter {iterationNumber}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Start fresh conversation (dataset is preserved)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-7 w-7", isPinned && "text-[rgb(var(--theme-500))]")}
                      onClick={togglePin}
                    >
                      {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{isPinned ? "Unpin sidebar" : "Pin sidebar open"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsCollapsed(true)}>
                      <PanelRightClose className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Collapse</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </>
        )}
      </div>

      {/* Chat content — always mounted, hidden only when collapsed */}
      <div className={cn(
        "flex-1 flex flex-col min-h-0 overflow-hidden transition-all duration-200",
        isCollapsed && "hidden"
      )}>
        {chatContent}
      </div>
    </div>
  );
}
