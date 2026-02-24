/**
 * WorkspaceTabManager
 *
 * VS Code-style tab bar for the workspace. Renders open tabs with:
 * - Active tab highlight (bottom border)
 * - Preview tabs in italic
 * - Close (×) button on each tab
 * - Horizontal scroll overflow
 * - Double-click to pin a preview tab
 */

import { useRef } from "react";
import { X } from "lucide-react";
import { WorkspaceTabsConsumer } from "@/contexts/WorkspaceTabsContext";
import { cn } from "@/lib/utils";

export function WorkspaceTabManager() {
  const { tabs, activeTabPath, setActiveTab, closeTab, pinTab } = WorkspaceTabsConsumer();
  const scrollRef = useRef<HTMLDivElement>(null);

  if (tabs.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex items-end border-b border-border overflow-x-auto scrollbar-none bg-muted/30"
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
            className={cn(
              "group relative flex items-center gap-1.5 px-3 h-[35px] text-[13px] shrink-0 transition-colors",
              "border-b-2 -mb-[1px]",
              isActive
                ? "border-[rgb(var(--theme-500))] text-foreground bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
              !tab.isPinned && "italic"
            )}
          >
            <span className="truncate max-w-[140px]">{tab.label}</span>

            {/* Close button */}
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.path);
              }}
              className={cn(
                "flex items-center justify-center w-4 h-4 rounded-sm shrink-0",
                "opacity-0 group-hover:opacity-100 transition-opacity",
                "hover:bg-muted-foreground/20",
                isActive && "opacity-60"
              )}
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
