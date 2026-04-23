/**
 * WorkspaceTabManager
 *
 * VS Code-style tab bar for the workspace. Renders open tabs with:
 * - Active tab: lighter background, colored top border
 * - Inactive tabs: darker background, no top border
 * - Preview tabs in italic
 * - Close (×) button visible on hover or when active
 * - Horizontal scroll overflow
 * - Double-click to pin a preview tab
 * - Right-click context menu (Close, Close Others, Close All, etc.)
 */

import { useCallback, useRef, useState } from "react";
import { X, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { PlanConsumer } from "@/contexts/PlanContext";
import { cn } from "@/lib/utils";

/** Position for the context menu */
interface ContextMenuState {
  x: number;
  y: number;
  tabPath: string;
}

export function WorkspaceTabManager() {
  const {
    tabs,
    activeTabPath,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    pinTab,
  } = WorkspaceTabsConsumer();
  const { planStatus, isExecuting } = PlanConsumer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tabPath: string) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY, tabPath });
    },
    []
  );

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  // Close context menu when clicking anywhere
  // Using onMouseDown on the overlay to catch clicks before they propagate

  if (tabs.length === 0) return null;

  const ctxTab = ctxMenu ? tabs.find((t) => t.path === ctxMenu.tabPath) : null;
  const ctxTabIdx = ctxMenu ? tabs.findIndex((t) => t.path === ctxMenu.tabPath) : -1;
  const hasTabsToRight = ctxTabIdx >= 0 && ctxTabIdx < tabs.length - 1;

  return (
    <>
      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto scrollbar-none bg-muted/40 shrink-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activeTabPath;
          return (
            <button
              key={tab.path}
              onClick={() => setActiveTab(tab.path)}
              onDoubleClick={() => {
                if (!tab.isPinned) pinTab(tab.path);
              }}
              onContextMenu={(e) => handleContextMenu(e, tab.path)}
              className={cn(
                "group relative flex items-center gap-1.5 px-3 h-[34px] text-[12px] shrink-0 transition-colors",
                "border-r border-border/50",
                isActive
                  ? "bg-background text-foreground border-t-2 border-t-[rgb(var(--theme-500))]"
                  : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60 border-t-2 border-t-transparent",
                !tab.isPinned && "italic"
              )}
            >
              {/* Plan status icon — matches explorer sidebar badges */}
              {tab.path === 'plan.md' && planStatus === 'completed' && (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[rgb(var(--theme-500))]" />
              )}
              {tab.path === 'plan.md' && planStatus === 'failed' && (
                <XCircle className="w-3.5 h-3.5 shrink-0 text-destructive" />
              )}
              {tab.path === 'plan.md' && isExecuting && (
                <Loader2 className="w-3.5 h-3.5 shrink-0 text-blue-500 animate-spin" />
              )}
              {tab.path === 'plan.md' && planStatus === 'proposed' && !isExecuting && (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-yellow-500" />
              )}
              <span className="truncate max-w-[140px]">{tab.label}</span>

              {/* Close button — always visible on active tab, hover on others */}
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className={cn(
                  "flex items-center justify-center w-4 h-4 rounded-sm shrink-0",
                  "transition-opacity",
                  "hover:bg-muted-foreground/20",
                  isActive
                    ? "opacity-60 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                )}
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Context Menu Overlay + Menu */}
      {ctxMenu && (
        <div className="fixed inset-0 z-50" onMouseDown={closeMenu}>
          <div
            className="fixed z-50 min-w-[180px] rounded-md border border-zinc-700/60 bg-zinc-900 py-1 shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              className="flex w-full items-center px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 transition-colors"
              onClick={() => {
                closeTab(ctxMenu.tabPath);
                closeMenu();
              }}
            >
              Close
            </button>

            {/* Close Others */}
            <button
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-[12px] transition-colors",
                tabs.length > 1
                  ? "text-zinc-300 hover:bg-zinc-800"
                  : "text-zinc-600 cursor-default"
              )}
              onClick={() => {
                if (tabs.length > 1) {
                  closeOtherTabs(ctxMenu.tabPath);
                }
                closeMenu();
              }}
            >
              Close Others
            </button>

            {/* Close to the Right */}
            <button
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-[12px] transition-colors",
                hasTabsToRight
                  ? "text-zinc-300 hover:bg-zinc-800"
                  : "text-zinc-600 cursor-default"
              )}
              onClick={() => {
                if (hasTabsToRight) {
                  closeTabsToRight(ctxMenu.tabPath);
                }
                closeMenu();
              }}
            >
              Close to the Right
            </button>

            {/* Divider */}
            <div className="my-1 h-px bg-zinc-800" />

            {/* Close All */}
            <button
              className="flex w-full items-center px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 transition-colors"
              onClick={() => {
                closeAllTabs();
                closeMenu();
              }}
            >
              Close All
            </button>

            {/* Divider + Pin/Unpin (if preview) */}
            {ctxTab && !ctxTab.isPinned && (
              <>
                <div className="my-1 h-px bg-zinc-800" />
                <button
                  className="flex w-full items-center px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 transition-colors"
                  onClick={() => {
                    pinTab(ctxMenu.tabPath);
                    closeMenu();
                  }}
                >
                  Keep Open
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
