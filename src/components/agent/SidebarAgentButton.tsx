/**
 * SidebarAgentButton
 *
 * Lucy AI assistant button for the sidebar, used in side-panel mode.
 * Triggers the agent panel open/close.
 */

import { cn } from "@/lib/utils"
import { useAgentPanel } from "@/contexts/AgentPanelContext"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { LucyAvatar } from "./LucyAvatar"

interface SidebarAgentButtonProps {
  isCollapsed: boolean
}

const isLucyEnabled = import.meta.env.VITE_LUCY_ENABLED === 'true'

export function SidebarAgentButton({ isCollapsed }: SidebarAgentButtonProps) {
  const { toggle: toggleAgentPanel, isOpen: isAgentPanelOpen } = useAgentPanel()

  // Don't render if Lucy is disabled via feature flag
  if (!isLucyEnabled) {
    return null
  }

  if (isCollapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleAgentPanel}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                isAgentPanelOpen
                  ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                  : "hover:bg-[rgba(var(--theme-500),0.1)] hover:text-[rgb(var(--theme-500))] text-muted-foreground",
                "justify-center p-2 w-10 h-10"
              )}
            >
              <LucyAvatar size="sm" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Chat with Lucy</p>
          </TooltipContent>
        </Tooltip>
      </li>
    )
  }

  return (
    <li>
      <button
        onClick={toggleAgentPanel}
        className={cn(
          "flex items-center rounded-lg text-sm font-medium transition-all duration-200 w-full",
          isAgentPanelOpen
            ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
            : "hover:bg-[rgba(var(--theme-500),0.1)] hover:text-[rgb(var(--theme-500))] text-muted-foreground",
          "gap-3 px-3 py-2"
        )}
      >
        <LucyAvatar size="sm" />
        <span className="truncate">Lucy</span>
      </button>
    </li>
  )
}

export default SidebarAgentButton
