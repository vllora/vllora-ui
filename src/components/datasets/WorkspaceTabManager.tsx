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
            className={cn(
              "group relative flex items-center gap-1.5 px-3 h-[34px] text-[12px] shrink-0 transition-colors",
              "border-r border-border/50",
              isActive
                ? "bg-background text-foreground border-t-2 border-t-[rgb(var(--theme-500))]"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60 border-t-2 border-t-transparent",
              !tab.isPinned && "italic"
            )}
          >
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
                isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
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
