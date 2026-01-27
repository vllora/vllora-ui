/**
 * DatasetStepper
 *
 * Horizontal stepper showing the dataset preparation checklist.
 * Steps: Extract Data -> Topics & Categorize -> Evaluation Config -> Finetune -> Deployed
 *
 * Dependencies:
 * - finetune requires: extract_data, topics_categorize, evaluation_config
 * - deployed requires: finetune
 */

import { Check, Database, FolderTree, Settings, Zap, Rocket, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type DatasetStep =
  | "extract_data"
  | "topics_categorize"
  | "evaluation_config"
  | "finetune"
  | "deployed";

interface StepConfig {
  id: DatasetStep;
  label: string;
  icon: React.ElementType;
  /** Whether this step is required before finetune */
  required?: boolean;
  /** Steps that must be completed before this step is enabled */
  dependencies?: DatasetStep[];
  /** Tooltip when step is incomplete */
  incompleteTooltip: string;
  /** Tooltip when step is complete */
  completeTooltip: string;
}

const STEPS: StepConfig[] = [
  {
    id: "extract_data",
    label: "Extract Data",
    icon: Database,
    required: true,
    incompleteTooltip: "Add data records to your dataset",
    completeTooltip: "Data records added",
  },
  {
    id: "topics_categorize",
    label: "Topics & Categorize",
    icon: FolderTree,
    required: true,
    incompleteTooltip: "Define topic hierarchy for categorization",
    completeTooltip: "Topic hierarchy configured",
  },
  {
    id: "evaluation_config",
    label: "Evaluation Config",
    icon: Settings,
    required: true,
    incompleteTooltip: "Configure evaluation function for scoring",
    completeTooltip: "Evaluation config set",
  },
  {
    id: "finetune",
    label: "Finetune",
    icon: Zap,
    dependencies: ["extract_data", "topics_categorize", "evaluation_config"],
    incompleteTooltip: "Complete required steps to enable finetuning",
    completeTooltip: "Finetune job created",
  },
  {
    id: "deployed",
    label: "Deployed",
    icon: Rocket,
    dependencies: ["finetune"],
    incompleteTooltip: "Complete finetuning to enable deployment",
    completeTooltip: "Model deployed",
  },
];

interface DatasetStepperProps {
  /** Which steps are completed */
  completedSteps: Set<DatasetStep>;
  /** Currently active/focused step */
  activeStep?: DatasetStep;
  /** Called when a step is clicked */
  onStepClick?: (step: DatasetStep) => void;
}

/**
 * Check if a step is enabled based on its dependencies
 */
function isStepEnabled(step: StepConfig, completedSteps: Set<DatasetStep>): boolean {
  if (!step.dependencies || step.dependencies.length === 0) {
    return true;
  }
  return step.dependencies.every((dep) => completedSteps.has(dep));
}

export function DatasetStepper({
  completedSteps,
  activeStep,
  onStepClick,
}: DatasetStepperProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-center px-6 py-4 border-b border-border bg-gradient-to-b from-card/80 to-card/40">
        {STEPS.map((step, index) => {
          const isCompleted = completedSteps.has(step.id);
          const isActive = activeStep === step.id;
          const isEnabled = isStepEnabled(step, completedSteps);
          const showWarning = step.required && !isCompleted;
          const Icon = step.icon;

          const tooltipText = isCompleted
            ? step.completeTooltip
            : isEnabled
              ? step.incompleteTooltip
              : step.incompleteTooltip;

          return (
            <div key={step.id} className="flex items-center">
              {/* Step */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => isEnabled && onStepClick?.(step.id)}
                    disabled={!isEnabled}
                    className={cn(
                      "group relative flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                      isCompleted && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15",
                      isActive && !isCompleted && "bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))] shadow-sm",
                      !isCompleted && !isActive && isEnabled && "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      !isEnabled && "text-muted-foreground/40 cursor-not-allowed"
                    )}
                  >
                    {/* Step number/icon circle */}
                    <div
                      className={cn(
                        "relative w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200",
                        isCompleted && "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
                        isActive && !isCompleted && "bg-[rgb(var(--theme-500))] text-white shadow-sm shadow-[rgb(var(--theme-500))]/30",
                        !isCompleted && !isActive && isEnabled && "bg-muted text-muted-foreground group-hover:bg-muted/80",
                        !isEnabled && "bg-muted/50 text-muted-foreground/40"
                      )}
                    >
                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>

                    {/* Step label */}
                    <span className="hidden sm:inline whitespace-nowrap">{step.label}</span>

                    {/* Warning indicator after label */}
                    {showWarning && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px]">
                  <div className="flex items-start gap-2 text-xs">
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    ) : showWarning ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    ) : null}
                    <span>{tooltipText}</span>
                  </div>
                </TooltipContent>
              </Tooltip>

              {/* Connector */}
              {index < STEPS.length - 1 && (
                <div className="flex items-center mx-1">
                  <div
                    className={cn(
                      "w-6 h-px transition-colors duration-200",
                      isCompleted ? "bg-emerald-500/60" : "bg-border"
                    )}
                  />
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                      isCompleted ? "bg-emerald-500/60" : "bg-border"
                    )}
                  />
                  <div
                    className={cn(
                      "w-6 h-px transition-colors duration-200",
                      completedSteps.has(STEPS[index + 1].id) ? "bg-emerald-500/60" : "bg-border"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/**
 * Helper to compute completed steps from dataset state
 */
export function computeCompletedSteps(params: {
  recordCount: number;
  hasTopicHierarchy: boolean;
  hasEvaluationConfig: boolean;
  hasFinetuneJob: boolean;
  isDeployed: boolean;
}): Set<DatasetStep> {
  const completed = new Set<DatasetStep>();

  if (params.recordCount > 0) {
    completed.add("extract_data");
  }
  if (params.hasTopicHierarchy) {
    completed.add("topics_categorize");
  }
  if (params.hasEvaluationConfig) {
    completed.add("evaluation_config");
  }
  if (params.hasFinetuneJob) {
    completed.add("finetune");
  }
  if (params.isDeployed) {
    completed.add("deployed");
  }

  return completed;
}
