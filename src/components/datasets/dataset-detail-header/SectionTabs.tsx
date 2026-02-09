/**
 * SectionTabs
 *
 * Tab navigation for dataset detail sections.
 * Workflow tabs (Records, Evaluator, Jobs) on the left.
 * Documentation tabs (Docs, README) on the right, separated by a divider.
 */

import { Database, FlaskConical, ListChecks, FileText, FolderOpen, Check, type LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DatasetSection } from "./DatasetUtilityBar";

interface TabConfig {
  id: DatasetSection;
  label: string;
  icon: LucideIcon;
}

// Workflow-related tabs (left side)
const WORKFLOW_TABS: TabConfig[] = [
  {
    id: "records",
    label: "Records",
    icon: Database,
  },
  {
    id: "evaluator",
    label: "Evaluator",
    icon: FlaskConical,
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: ListChecks,
  },
];

// Documentation tabs (right side) - not part of main workflow
const DOCUMENTATION_TABS: TabConfig[] = [
  {
    id: "docs",
    label: "Docs",
    icon: FolderOpen,
  },
  {
    id: "readme",
    label: "README",
    icon: FileText,
  },
];

interface SectionTabsProps {
  /** Current active section */
  activeSection: DatasetSection;
  /** Callback when section changes */
  onSectionChange: (section: DatasetSection) => void;
  /** Number of records in the dataset */
  recordsCount?: number;
  /** Whether the evaluator is configured (shows check icon) */
  hasEvaluator?: boolean;
  /** Number of active jobs (shows badge on Jobs tab) */
  activeJobsCount?: number;
  /** Number of uploaded knowledge sources */
  knowledgeSourcesCount?: number;
}

export function SectionTabs({
  activeSection,
  onSectionChange,
  recordsCount = 0,
  hasEvaluator,
  activeJobsCount = 0,
  knowledgeSourcesCount = 0,
}: SectionTabsProps) {
  const renderTab = (tab: TabConfig) => {
    const isActive = activeSection === tab.id;
    const Icon = tab.icon;

    return (
      <button
        key={tab.id}
        onClick={() => onSectionChange(tab.id)}
        className={cn(
          "relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md",
          "transition-all duration-200",
          isActive
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        <Icon className="w-4 h-4" />
        <span>{tab.label}</span>

        {/* Records count badge */}
        {tab.id === "records" && recordsCount > 0 && (
          <span className="min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded bg-muted text-muted-foreground text-[11px] font-medium tabular-nums">
            {recordsCount > 999 ? `${(recordsCount / 1000).toFixed(1)}k` : recordsCount}
          </span>
        )}

        {/* Configured indicator for evaluator */}
        {tab.id === "evaluator" && hasEvaluator && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Check className="w-3.5 h-3.5 text-green-500" />
              </TooltipTrigger>
              <TooltipContent>Evaluator is configured</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Active jobs count badge */}
        {tab.id === "jobs" && activeJobsCount > 0 && (
          <span className="flex h-5 min-w-[1.25rem] px-1.5 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 text-[11px] font-semibold tabular-nums">
            {activeJobsCount}
          </span>
        )}

        {/* Knowledge sources count badge */}
        {tab.id === "docs" && knowledgeSourcesCount > 0 && (
          <span className="min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded bg-blue-500/20 text-blue-500 text-[11px] font-medium tabular-nums">
            {knowledgeSourcesCount}
          </span>
        )}

        {/* Active indicator line */}
        {isActive && (
          <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[rgb(var(--theme-500))] rounded-full" />
        )}
      </button>
    );
  };

  return (
    <div className="flex items-center justify-between">
      {/* Workflow tabs (left) */}
      <div className="flex items-center gap-1">
        {WORKFLOW_TABS.map(renderTab)}
      </div>

      {/* Documentation tabs (right) - visually separated */}
      <div className="flex items-center gap-1 pl-4 border-l border-border ml-4">
        {DOCUMENTATION_TABS.map(renderTab)}
      </div>
    </div>
  );
}
