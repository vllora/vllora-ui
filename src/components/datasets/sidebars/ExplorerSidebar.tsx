/**
 * ExplorerSidebar
 *
 * Left sidebar wrapping DatasetExplorer with independent collapse/pin state.
 * Three responsive modes:
 * - Expanded (240px): Full file tree with header
 * - Icon-rail (48px): Vertical icon strip with tooltips and badges
 * - Hidden: Below 1024px viewport width
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PanelLeftClose,
  PanelLeft,
  Pin,
  PinOff,
  BookOpen,
  ScrollText,
  ListChecks,
  FileText,
  FolderOpen,
  FlaskConical,
  Rocket,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DatasetExplorer } from "./DatasetExplorer";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { PlanConsumer } from "@/contexts/PlanContext";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { FinetuneJobsConsumer } from "@/contexts/FinetuneJobsContext";
import { DryRunJobsConsumer } from "@/contexts/DryRunJobsContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { useChatStateStore } from "@distri/react";

// Breakpoints for responsive behavior
const BREAKPOINT_HIDDEN = 1024;
const BREAKPOINT_ICON_RAIL = 1280;

// Icon-rail section definitions (same icons as DatasetExplorer)
const ICON_CLS = "w-4 h-4";

interface IconRailItem {
  id: string;
  label: string;
  tabPath: string;
  icon: React.ReactNode;
}

const ICON_RAIL_ITEMS: IconRailItem[] = [
  { id: "readme.md", label: "Readme", tabPath: "readme.md", icon: <BookOpen className={`${ICON_CLS} text-blue-500`} /> },
  { id: "plan.md", label: "Plan", tabPath: "plan.md", icon: <ScrollText className={`${ICON_CLS} text-[rgb(var(--theme-500))]`} /> },
  { id: "tasks.md", label: "Tasks", tabPath: "tasks.md", icon: <ListChecks className={`${ICON_CLS} text-orange-500`} /> },
  { id: "logs.md", label: "Logs", tabPath: "logs.md", icon: <FileText className={`${ICON_CLS} text-muted-foreground`} /> },
  { id: "documents", label: "Documents", tabPath: "documents", icon: <FolderOpen className={`${ICON_CLS} text-amber-500`} /> },
  { id: "topics", label: "Records", tabPath: "records", icon: <FolderOpen className={`${ICON_CLS} text-amber-500`} /> },
  { id: "evaluations", label: "Evaluations", tabPath: "evaluations/grader-script.ts", icon: <FlaskConical className={`${ICON_CLS} text-violet-500`} /> },
  { id: "finetune", label: "Fine-tune Jobs", tabPath: "finetune", icon: <Rocket className={`${ICON_CLS} text-[rgb(var(--theme-500))]`} /> },
  { id: "quick-stats", label: "Quick Stats", tabPath: "quick-stats/coverage.md", icon: <BarChart3 className={`${ICON_CLS} text-cyan-500`} /> },
];

export function ExplorerSidebar() {
  const [isIconRail, setIsIconRail] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isPinned, setIsPinned] = useState(() => localStorage.getItem("explorer-sidebar-pinned") === "true");

  const { openTab } = WorkspaceTabsConsumer();

  // Persist pin state
  const togglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem("explorer-sidebar-pinned", String(next));
      return next;
    });
  }, []);

  // Responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < BREAKPOINT_HIDDEN) {
        setIsHidden(true);
        setIsIconRail(false);
      } else if (w < BREAKPOINT_ICON_RAIL && !isPinned) {
        setIsHidden(false);
        setIsIconRail(true);
      } else {
        setIsHidden(false);
        setIsIconRail(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isPinned]);

  // Badge data for icon-rail mode
  const { records } = DatasetDetailConsumer();
  const { hasPlanProposed, planStatus } = PlanConsumer();
  const { count: docsCount } = KnowledgeSourcesConsumer();
  const { filteredJobs: finetuneJobs } = FinetuneJobsConsumer();
  const { jobs: dryRunJobs } = DryRunJobsConsumer();
  const todos = useChatStateStore((s) => s.todos);

  const badges = useMemo(() => {
    const map: Record<string, number | string | undefined> = {};
    if (hasPlanProposed) map["plan.md"] = "!";
    if (planStatus === "executing") map["plan.md"] = "...";
    const activeTodos = todos.filter((t) => t.status !== "done");
    if (activeTodos.length > 0) map["tasks.md"] = activeTodos.length;
    if (docsCount > 0) map["documents"] = docsCount;
    if (records.length > 0) map["topics"] = records.length;
    if (dryRunJobs.length > 0) map["evaluations"] = dryRunJobs.length;
    if (finetuneJobs.length > 0) map["finetune"] = finetuneJobs.length;
    return map;
  }, [hasPlanProposed, planStatus, todos, docsCount, records.length, dryRunJobs.length, finetuneJobs.length]);

  // Hidden: render nothing
  if (isHidden) return null;

  // Icon-rail mode (48px)
  if (isIconRail) {
    return (
      <div className="w-12 flex-shrink-0 border-r border-border flex flex-col bg-background">
        {/* Expand button */}
        <div className="flex items-center justify-center py-2 border-b border-border shrink-0">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => { setIsIconRail(false); setIsPinned(true); localStorage.setItem("explorer-sidebar-pinned", "true"); }}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand Explorer</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Icon strip */}
        <div className="flex-1 flex flex-col items-center gap-0.5 py-2 overflow-y-auto">
          {ICON_RAIL_ITEMS.map((item) => {
            const badge = badges[item.id];
            return (
              <TooltipProvider key={item.id} delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => openTab(item.tabPath)}
                      className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      {item.icon}
                      {badge != null && (
                        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-[rgb(var(--theme-500))] text-white text-[9px] font-bold leading-none">
                          {typeof badge === "number" && badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded mode (240px)
  return (
    <div className="w-[240px] flex-shrink-0 border-r border-border flex flex-col min-h-0 bg-background transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-6 w-6", isPinned && "text-[rgb(var(--theme-500))]")}
                  onClick={togglePin}
                >
                  {isPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{isPinned ? "Unpin Explorer" : "Pin Explorer open"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsIconRail(true)}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse to icons</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-hidden">
        <DatasetExplorer onNavigate={() => {}} />
      </div>
    </div>
  );
}
