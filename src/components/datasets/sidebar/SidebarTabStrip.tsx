/**
 * SidebarTabStrip
 *
 * Simple 2-tab strip: [Explorer] [Lucy]
 * Lucy tab shows unread badge and processing indicator.
 * Actions: New Chat (Lucy only), Pin, Collapse.
 */

import { FolderTree, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export type SidebarTab = "explorer" | "lucy";

interface SidebarTabStripProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  lucyUnreadCount: number;
  lucyProcessing: boolean;
}

export function SidebarTabStrip({
  activeTab,
  onTabChange,
  lucyUnreadCount,
  lucyProcessing,
}: SidebarTabStripProps) {
  return (
    <div className="flex items-center border-b border-border shrink-0">
      <TabButton
        active={activeTab === "explorer"}
        onClick={() => onTabChange("explorer")}
        icon={<FolderTree className="w-3.5 h-3.5" />}
        label="Explorer"
      />
      <TabButton
        active={activeTab === "lucy"}
        onClick={() => onTabChange("lucy")}
        icon={<MessageSquare className="w-3.5 h-3.5" />}
        label="Lucy"
        badge={lucyUnreadCount > 0 ? lucyUnreadCount : undefined}
        showDot={lucyProcessing && activeTab !== "lucy"}
      />
    </div>
  );
}

// ============================================================================
// Tab Button
// ============================================================================

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  showDot,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  showDot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors relative",
        "border-b-2 -mb-[1px]",
        active
          ? "border-[rgb(var(--theme-500))] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      {icon}
      {label}

      {/* Unread badge */}
      {badge != null && badge > 0 && (
        <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[rgb(var(--theme-500))] text-white text-[10px] font-bold leading-none">
          {badge > 9 ? "9+" : badge}
        </span>
      )}

      {/* Processing dot */}
      {showDot && !badge && (
        <span className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))] animate-pulse" />
      )}
    </button>
  );
}
