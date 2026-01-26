/**
 * DatasetStepper
 *
 * Horizontal stepper showing the dataset preparation checklist.
 * Steps: Extract Data -> Topics & Categorize -> Evaluation Config -> Finetune -> Deployed
 */

import { Check, Database, FolderTree, Settings, Zap, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

const STEPS: StepConfig[] = [
  { id: "extract_data", label: "Extract Data", icon: Database },
  { id: "topics_categorize", label: "Topics & Categorize", icon: FolderTree },
  { id: "evaluation_config", label: "Evaluation Config", icon: Settings },
  { id: "finetune", label: "Finetune", icon: Zap },
  { id: "deployed", label: "Deployed", icon: Rocket },
];

interface DatasetStepperProps {
  /** Which steps are completed */
  completedSteps: Set<DatasetStep>;
  /** Currently active/focused step */
  activeStep?: DatasetStep;
  /** Called when a step is clicked */
  onStepClick?: (step: DatasetStep) => void;
}

export function DatasetStepper({
  completedSteps,
  activeStep,
  onStepClick,
}: DatasetStepperProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-border bg-card/50">
      {STEPS.map((step, index) => {
        const isCompleted = completedSteps.has(step.id);
        const isActive = activeStep === step.id;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step */}
            <button
              onClick={() => onStepClick?.(step.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                isCompleted && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                isActive && !isCompleted && "bg-[rgb(var(--theme-500))]/15 text-[rgb(var(--theme-500))]",
                !isCompleted && !isActive && "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center",
                  isCompleted && "bg-emerald-500 text-white",
                  isActive && !isCompleted && "bg-[rgb(var(--theme-500))] text-white",
                  !isCompleted && !isActive && "border border-muted-foreground/40"
                )}
              >
                {isCompleted ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
              </div>
              <span className="hidden sm:inline">{step.label}</span>
            </button>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 mx-1",
                  isCompleted ? "bg-emerald-500/50" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
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
