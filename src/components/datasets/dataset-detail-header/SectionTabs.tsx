/**
 * SectionTabs
 *
 * Arrow-stepper tab navigation for dataset workspace sections.
 * 4 tabs: Data → Evaluation → Fine-tune → Deploy.
 */

import { Database, FlaskConical, Sparkles, Check, Lock, Loader2, Circle, ChevronRight, LayoutDashboard, type LucideIcon, RocketIcon } from "lucide-react";
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
import { ArrowSegment } from "./ArrowSegment";
import type { DatasetSection } from "./DatasetUtilityBar";

interface TabConfig {
  id: DatasetSection;
  label: string;
  icon: LucideIcon;
  /** Whether this step is required (true) or can be configured later (false) */
  required?: boolean;
}

const TABS: TabConfig[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "records", label: "Data", icon: Database, required: true },
  { id: "evaluator", label: "Evaluation", icon: FlaskConical, required: true },
  { id: "jobs", label: "Fine-tune", icon: Sparkles, required: true },
  { id: "deploy", label: "Deploy", icon: RocketIcon },
];

interface SectionTabsProps {
  activeSection: DatasetSection;
  onSectionChange: (section: DatasetSection) => void;
  recordsCount?: number;
  hasEvaluator?: boolean;
  jobsCount?: number;
  /** Set of tab IDs that currently have background activity */
  processingTabs?: Set<DatasetSection>;
}

export function SectionTabs({
  activeSection,
  onSectionChange,
  recordsCount = 0,
  hasEvaluator = false,
  jobsCount = 0,
  processingTabs = new Set(),
}: SectionTabsProps) {
  const hasData = recordsCount > 0;

  const depsMetFor = (tabId: DatasetSection): boolean => {
    if (tabId === "overview") return true;
    if (tabId === "records") return true;
    if (tabId === "evaluator") return true;
    if (tabId === "jobs") return hasData && hasEvaluator;
    if (tabId === "deploy") return jobsCount > 0;
    return true;
  };

  const isStepComplete = (tabId: DatasetSection): boolean => {
    if (tabId === "overview") return false;
    if (tabId === "records") return hasData;
    if (tabId === "evaluator") return hasEvaluator;
    if (tabId === "jobs") return jobsCount > 0;
    return false;
  };

  const getStatus = (tabId: DatasetSection): "completed" | "active" | "pending" | "locked" => {
    if (tabId === activeSection) return "active";
    if (isStepComplete(tabId)) return "completed";
    if (!depsMetFor(tabId)) return "locked";
    return "pending";
  };

  const getTooltipText = (tabId: DatasetSection, status: string): string => {
    if (tabId === "overview") return "Project overview and activity history";
    if (isStepComplete(tabId)) {
      if (tabId === "records") return `${recordsCount} record${recordsCount !== 1 ? "s" : ""} added`;
      if (tabId === "evaluator") return "Evaluation configured";
      if (tabId === "jobs") return `${jobsCount} job${jobsCount !== 1 ? "s" : ""} created`;
      if (tabId === "deploy") return "Model deployed";
    }

    if (status === "locked") {
      if (tabId === "jobs") {
        if (!hasData && !hasEvaluator) return "Add training data and set up evaluation first";
        if (!hasData) return "Add training data first";
        return "Set up evaluation first to unlock fine-tuning";
      }
      if (tabId === "deploy") return "Complete a fine-tuning job first";
    }

    if (tabId === "records") return "Add training data for your model";
    if (tabId === "evaluator") return "Set up evaluation to score outputs";
    if (tabId === "jobs") return "Start a fine-tuning job";
    if (tabId === "deploy") return "Deploy your fine-tuned model";
    return "";
  };

  const getPrerequisites = (tabId: DatasetSection): { label: string; completed: boolean; targetTab: DatasetSection }[] => {
    if (tabId === "jobs") {
      return [
        { label: "Add training data", completed: hasData, targetTab: "records" },
        { label: "Set up evaluation", completed: hasEvaluator, targetTab: "evaluator" },
      ];
    }
    if (tabId === "deploy") {
      return [
        { label: "Complete a fine-tune job", completed: jobsCount > 0, targetTab: "jobs" },
      ];
    }
    return [];
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center w-full max-w-2xl">
        {TABS.map((tab, index) => {
          const status = getStatus(tab.id);
          const isActive = activeSection === tab.id;
          const isLocked = status === "locked";
          const Icon = tab.icon;
          const isTabProcessing = processingTabs.has(tab.id);

          const tabContent = (
            <>
              {isTabProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : status === "completed" && !isActive ? (
                <Check className="w-3.5 h-3.5" />
              ) : isLocked ? (
                <Lock className="w-3 h-3" />
              ) : (
                <Icon className="w-3.5 h-3.5" />
              )}
              <span>{tab.label}</span>

              {/* Records count badge */}
              {tab.id === "records" && recordsCount > 0 && (
                <span className={cn(
                  "ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums",
                  isActive ? "bg-white/20" : "bg-black/5 dark:bg-white/10"
                )}>
                  {recordsCount > 999 ? `${(recordsCount / 1000).toFixed(1)}k` : recordsCount}
                </span>
              )}

              {/* Jobs count badge */}
              {tab.id === "jobs" && jobsCount > 0 && (
                <span className={cn(
                  "ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums",
                  isActive ? "bg-white/20" : "bg-black/5 dark:bg-white/10"
                )}>
                  {jobsCount}
                </span>
              )}
            </>
          );

          const arrowSegment = (
            <ArrowSegment
              isFirst={index === 0}
              isLast={index === TABS.length - 1}
              status={status}
              isActive={isActive}
              isProcessing={isTabProcessing}
              isOptional={!tab.required}
              onClick={isLocked ? () => {} : () => onSectionChange(tab.id)}
            >
              {tabContent}
            </ArrowSegment>
          );

          // Locked tabs with prerequisites → actionable popover
          if (isLocked) {
            const prereqs = getPrerequisites(tab.id);
            if (prereqs.length > 0) {
              return (
                <Popover key={tab.id}>
                  <PopoverTrigger asChild>
                    <div className="flex-1">{arrowSegment}</div>
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
          }

          // Normal tabs → tooltip
          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <div className="flex-1">{arrowSegment}</div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                {getTooltipText(tab.id, status)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
