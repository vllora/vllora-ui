/**
 * SectionTabs
 *
 * Tab navigation for dataset detail sections.
 * Workflow tabs (Records, Evaluator, Jobs) with connected arrow stepper style.
 * Documentation tabs (Docs, Plan, README) on the right.
 */

import { Database, FlaskConical, Sparkles, FileText, FolderOpen, Check, Wand2, Lock, Loader2, Circle, ChevronRight, Clock, type LucideIcon, RocketIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import type { DatasetSection } from "./DatasetUtilityBar";
import { ArrowSegment } from "./ArrowSegment";

interface TabConfig {
  id: DatasetSection;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  /** Whether this step is required (true) or can be configured later (false) */
  required?: boolean;
}

// Workflow-related tabs (plain language for non-technical users)
const WORKFLOW_TABS: TabConfig[] = [
  { id: "records", label: "Data", icon: Database, required: true },
  { id: "evaluator", label: "Evaluation", icon: FlaskConical, required: false },
  { id: "jobs", label: "Finetune", icon: Sparkles, required: true },
  { id: "deploy", label: "Deploy", icon: RocketIcon, comingSoon: true },
];

// Documentation & setup tabs
const DOCUMENTATION_TABS: TabConfig[] = [
  { id: "docs", label: "Docs", icon: FolderOpen },
  { id: "plan", label: "Plan", icon: Wand2 },
  { id: "readme", label: "Readme", icon: FileText },
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
  const getTooltipText = (tabId: DatasetSection, status: "completed" | "active" | "pending" | "locked" | "comingSoon"): string => {
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

    if (tabId === "records") return "Required · Add training data for your model";
    if (tabId === "evaluator") return "Optional · Set up a quality grader to score outputs";
    if (tabId === "jobs") return "Required · Start a fine-tuning job";
    if (tabId === "deploy") return "Deploy your fine-tuned model";
    return "";
  };

  // Prerequisites for locked tabs — shown in an actionable popover
  const getPrerequisites = (tabId: DatasetSection): { label: string; completed: boolean; targetTab: DatasetSection }[] => {
    if (tabId === "jobs") {
      return [
        { label: "Add training data", completed: hasData, targetTab: "records" },
        { label: "Set up evaluation", completed: hasEvaluator, targetTab: "evaluator" },
      ];
    }
    if (tabId === "deploy") {
      return [
        { label: "Complete a finetune job", completed: jobsCount > 0, targetTab: "jobs" },
      ];
    }
    return [];
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex items-center justify-between">
      {/* Workflow tabs - connected arrow stepper */}
        <div className="grid items-center" style={{ gridTemplateColumns: `repeat(${WORKFLOW_TABS.length}, 1fr)` }}>
          {WORKFLOW_TABS.map((tab, index) => {
            const status = tab.comingSoon ? "comingSoon" as const : getWorkflowStatus(tab.id);
            const isActive = tab.comingSoon ? false : activeSection === tab.id;
            const isFirst = index === 0;
            const isLast = index === WORKFLOW_TABS.length - 1;
            const Icon = tab.icon;
            const isLockedWithPrereqs = status === "locked" && !tab.comingSoon;

            const segmentContent = (
              <ArrowSegment
                isFirst={isFirst}
                isLast={isLast}
                status={status}
                isActive={isActive}
                isProcessing={!tab.comingSoon && processingTabs.has(tab.id)}
                isOptional={tab.required === false}
                onClick={tab.comingSoon ? () => {} : isLockedWithPrereqs ? () => {} : () => onSectionChange(tab.id)}
              >
                {processingTabs.has(tab.id) ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : status === "completed" && !isActive ? (
                  <Check className="w-3.5 h-3.5" />
                ) : status === "comingSoon" ? (
                  <Clock className="w-3 h-3" />
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
            );

            // Locked tabs with prerequisites → actionable popover
            if (isLockedWithPrereqs) {
              const prereqs = getPrerequisites(tab.id);
              return (
                <Popover key={tab.id}>
                  <PopoverTrigger asChild>
                    <div>{segmentContent}</div>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="center" className="w-56 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Complete to unlock {tab.label}:
                    </p>
                    <div className="space-y-1">
                      {prereqs.map((prereq) => (
                        <button
                          key={prereq.targetTab}
                          onClick={() => onSectionChange(prereq.targetTab)}
                          className={cn(
                            "w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors text-left",
                            prereq.completed
                              ? "text-muted-foreground"
                              : "text-foreground hover:bg-accent"
                          )}
                          disabled={prereq.completed}
                        >
                          {prereq.completed ? (
                            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className={prereq.completed ? "line-through" : ""}>
                            {prereq.label}
                          </span>
                          {!prereq.completed && (
                            <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground" />
                          )}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }

            // All other tabs → simple tooltip
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <div>{segmentContent}</div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                  {tab.comingSoon ? "Deploy is coming soon. Download trained weights from the Finetune tab." : getTooltipText(tab.id, status)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

      {/* Documentation tabs — icon-only with tooltips */}
      <div className="flex items-center gap-1.5 ml-6">
        {DOCUMENTATION_TABS.map((tab) => {
          const isActive = activeSection === tab.id;
          const Icon = tab.icon;
          const isTabProcessing = processingTabs.has(tab.id);

          const tooltipText = isTabProcessing
            ? (tab.id === "plan"
              ? (processingTabs.has("docs") ? "Waiting for document processing..." : "Generating setup plan...")
              : `Processing ${knowledgeSourcesCount} document${knowledgeSourcesCount !== 1 ? "s" : ""}...`)
            : tab.label;

          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSectionChange(tab.id)}
                  data-section={tab.id}
                  className={cn(
                    "relative flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all text-xs",
                    isActive
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    isTabProcessing && "text-[rgb(var(--theme-500))]"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {isTabProcessing && (
                    <Loader2 className="w-3 h-3 animate-spin text-[rgb(var(--theme-500))]" />
                  )}

                  {/* Docs count badge — hidden during processing to avoid overlap with spinner */}
                  {tab.id === "docs" && knowledgeSourcesCount > 0 && !isTabProcessing && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[rgb(var(--theme-500))] text-white text-[9px] font-semibold tabular-nums">
                      {knowledgeSourcesCount}
                    </span>
                  )}

                  {/* Plan activity dot */}
                  {tab.id === "plan" && hasPlanActivity && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[rgb(var(--theme-500))] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[rgb(var(--theme-500))]" />
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {tooltipText}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
    </TooltipProvider>
  );
}
