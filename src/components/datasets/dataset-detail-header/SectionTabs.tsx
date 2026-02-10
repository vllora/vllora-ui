/**
 * SectionTabs
 *
 * Tab navigation for dataset detail sections.
 * Workflow tabs (Records, Evaluator, Jobs) with connected arrow stepper style.
 * Documentation tabs (Docs, Plan, README) on the right.
 */

import { Database, FlaskConical, Sparkles, FileText, FolderOpen, Check, Wand2, type LucideIcon, RocketIcon } from "lucide-react";
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
}

export function SectionTabs({
  activeSection,
  onSectionChange,
  recordsCount = 0,
  hasEvaluator = false,
  jobsCount = 0,
  knowledgeSourcesCount = 0,
  hasPlanActivity = false,
}: SectionTabsProps) {
  // Each tab is independent - completed based on its own criteria
  const getWorkflowStatus = (tabId: DatasetSection): "completed" | "active" | "pending" => {
    if (tabId === activeSection) return "active";

    // Independent completion criteria for each tab
    if (tabId === "records" && recordsCount > 0) return "completed";
    if (tabId === "evaluator" && hasEvaluator) return "completed";
    if (tabId === "jobs" && jobsCount > 0) return "completed";

    return "pending";
  };

  // Tooltip text for each workflow tab based on completion status
  const getTooltipText = (tabId: DatasetSection, status: "completed" | "active" | "pending"): string => {
    const isComplete = status === "completed" || (status === "active" && (
      (tabId === "records" && recordsCount > 0) ||
      (tabId === "evaluator" && hasEvaluator) ||
      (tabId === "jobs" && jobsCount > 0)
    ));

    if (isComplete) {
      if (tabId === "records") return `✓ Complete — ${recordsCount} record${recordsCount !== 1 ? "s" : ""} added`;
      if (tabId === "evaluator") return "✓ Complete — Quality grader configured";
      if (tabId === "jobs") return `✓ Complete — ${jobsCount} job${jobsCount !== 1 ? "s" : ""} created`;
      if (tabId === "deploy") return "✓ Complete — Model deployed";
    }

    if (tabId === "records") return "Add training data records to complete this step";
    if (tabId === "evaluator") return "Configure a quality grader to complete this step";
    if (tabId === "jobs") return "Start a training job to complete this step";
    if (tabId === "deploy") return "Deploy a trained model to complete this step";
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
                  <div className="-mx-px">
                    <ArrowSegment
                      isFirst={isFirst}
                      isLast={isLast}
                      status={status}
                      isActive={isActive}
                      onClick={() => onSectionChange(tab.id)}
                    >
                      {status === "completed" && !isActive ? (
                        <Check className="w-3.5 h-3.5" />
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
