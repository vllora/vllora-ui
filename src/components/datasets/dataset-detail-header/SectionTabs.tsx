/**
 * SectionTabs
 *
 * Tab navigation for dataset detail sections.
 * Workflow tabs (Records, Evaluator, Jobs) with connected arrow stepper style.
 * Documentation tabs (Docs, Plan, README) on the right.
 */

import { Database, FlaskConical, Sparkles, FileText, FolderOpen, Check, Wand2, Lock, Loader2, type LucideIcon, RocketIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DatasetSection } from "./DatasetUtilityBar";
import { ArrowSegment } from "./ArrowSegment";

interface TabConfig {
  id: DatasetSection;
  label: string;
  icon: LucideIcon;
}

// Workflow-related tabs (plain language for non-technical users)
const WORKFLOW_TABS: TabConfig[] = [
  { id: "records", label: "Data", icon: Database },
  { id: "evaluator", label: "Evaluation", icon: FlaskConical },
  { id: "jobs", label: "Finetune", icon: Sparkles },
  { id: "deploy", label: "Deploy", icon: RocketIcon },
];

// Documentation & setup tabs
const DOCUMENTATION_TABS: TabConfig[] = [
  { id: "docs", label: "Reference Docs", icon: FolderOpen },
  { id: "plan", label: "Setup Plan", icon: Wand2 },
  { id: "readme", label: "Overview", icon: FileText },
];

interface SectionTabsProps {
  activeSection: DatasetSection;
  onSectionChange: (section: DatasetSection) => void;
  recordsCount?: number;
  hasEvaluator?: boolean;
  jobsCount?: number;
  knowledgeSourcesCount?: number;
  hasPlanActivity?: boolean;
  /** Set of tab IDs that currently have background activity */
  processingTabs?: Set<DatasetSection>;
}

export function SectionTabs({
  activeSection,
  onSectionChange,
  recordsCount = 0,
  hasEvaluator = false,
  jobsCount = 0,
  knowledgeSourcesCount = 0,
  hasPlanActivity = false,
  processingTabs = new Set(),
}: SectionTabsProps) {
  // Dependencies:
  //   Data       → no dependencies
  //   Evaluation → no dependencies (can configure, but dry-run needs data)
  //   Finetune   → needs Data + Evaluation
  //   Deploy     → needs Finetune (at least one job)
  const hasData = recordsCount > 0;

  const depsMetFor = (tabId: DatasetSection): boolean => {
    if (tabId === "records") return true;
    if (tabId === "evaluator") return true;
    if (tabId === "jobs") return hasData && hasEvaluator;
    if (tabId === "deploy") return jobsCount > 0;
    return true;
  };

  const isStepComplete = (tabId: DatasetSection): boolean => {
    if (tabId === "records") return hasData;
    if (tabId === "evaluator") return hasEvaluator;
    if (tabId === "jobs") return jobsCount > 0;
    return false;
  };

  const getWorkflowStatus = (tabId: DatasetSection): "completed" | "active" | "pending" | "locked" => {
    if (tabId === activeSection) return "active";
    if (isStepComplete(tabId)) return "completed";
    if (!depsMetFor(tabId)) return "locked";
    return "pending";
  };

  // Tooltip text — shows completion info or what's blocking
  const getTooltipText = (tabId: DatasetSection, status: "completed" | "active" | "pending" | "locked"): string => {
    const complete = isStepComplete(tabId);

    if (complete || (status === "active" && isStepComplete(tabId))) {
      if (tabId === "records") return `✓ ${recordsCount} record${recordsCount !== 1 ? "s" : ""} added`;
      if (tabId === "evaluator") return "✓ Quality grader configured";
      if (tabId === "jobs") return `✓ ${jobsCount} job${jobsCount !== 1 ? "s" : ""} created`;
      if (tabId === "deploy") return "✓ Model deployed";
    }

    if (status === "locked") {
      if (tabId === "jobs") {
        if (!hasData && !hasEvaluator) return "Add training data and set up evaluation first";
        if (!hasData) return "Add training data first";
        return "Set up evaluation first to unlock fine-tuning";
      }
      if (tabId === "deploy") return "Complete a fine-tuning job first to unlock deploy";
    }

    if (tabId === "records") return "Add training data for your model";
    if (tabId === "evaluator") return "Set up a quality grader to score outputs";
    if (tabId === "jobs") return "Start a fine-tuning job";
    if (tabId === "deploy") return "Deploy your fine-tuned model";
    return "";
  };

  return (
    <div className="flex items-center justify-between">
      {/* Workflow tabs - connected arrow stepper */}
      <TooltipProvider delayDuration={300}>
        <div className="grid items-center" style={{ gridTemplateColumns: `repeat(${WORKFLOW_TABS.length}, 1fr)` }}>
          {WORKFLOW_TABS.map((tab, index) => {
            const status = getWorkflowStatus(tab.id);
            const isActive = activeSection === tab.id;
            const isFirst = index === 0;
            const isLast = index === WORKFLOW_TABS.length - 1;
            const Icon = tab.icon;

            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <div>
                    <ArrowSegment
                      isFirst={isFirst}
                      isLast={isLast}
                      status={status}
                      isActive={isActive}
                      isProcessing={processingTabs.has(tab.id)}
                      onClick={() => onSectionChange(tab.id)}
                    >
                      {processingTabs.has(tab.id) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : status === "completed" && !isActive ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : status === "locked" ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                      <span>{tab.label}</span>

                      {/* Records count */}
                      {tab.id === "records" && recordsCount > 0 && (
                        <span
                          className={cn(
                            "ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums",
                            isActive ? "bg-white/20" : "bg-background/50"
                          )}
                        >
                          {recordsCount > 999 ? `${(recordsCount / 1000).toFixed(1)}k` : recordsCount}
                        </span>
                      )}

                      {/* Jobs count */}
                      {tab.id === "jobs" && jobsCount > 0 && (
                        <span
                          className={cn(
                            "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums",
                            isActive ? "bg-white/20" : "bg-background/50"
                          )}
                        >
                          {jobsCount}
                        </span>
                      )}
                    </ArrowSegment>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                  {getTooltipText(tab.id, status)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Documentation tabs */}
      <div className="flex items-center gap-1 pl-4 border-l border-border ml-4">
        {DOCUMENTATION_TABS.map((tab) => {
          const isActive = activeSection === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onSectionChange(tab.id)}
              data-section={tab.id}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                isActive
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>

              {/* Docs count */}
              {tab.id === "docs" && knowledgeSourcesCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-500))] text-[10px] font-medium tabular-nums">
                  {knowledgeSourcesCount}
                </span>
              )}

              {/* Plan activity */}
              {tab.id === "plan" && hasPlanActivity && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[rgb(var(--theme-500))] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[rgb(var(--theme-500))]" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
