/**
 * SidebarAgentButton
 *
 * AI Assistant button for the sidebar, used in side-panel mode.
 * Triggers the agent panel open/close.
 */

import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAgentPanel, PANEL_MODE } from "@/contexts/AgentPanelContext"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarAgentButtonProps {
  isCollapsed: boolean
}

export function SidebarAgentButton({ isCollapsed }: SidebarAgentButtonProps) {
  const { toggle: toggleAgentPanel, isOpen: isAgentPanelOpen } = useAgentPanel()

  // Only render in side-panel mode
  if (PANEL_MODE !== 'side-panel') {
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
              <Bot className="h-5 w-5 flex-shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>AI Assistant</p>
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
        <Bot className="h-5 w-5 flex-shrink-0" />
        <span className="truncate">AI Assistant</span>
      </button>
    </li>
  )
}

export default SidebarAgentButton
