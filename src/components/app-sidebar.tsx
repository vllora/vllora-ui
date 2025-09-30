import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Home,
  MessageSquare,
  FolderOpen,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const mainMenuItems = [
  { id: "home", label: "Home", icon: Home, path: "/" },
  { id: "chat", label: "Chat", icon: MessageSquare, path: "/chat" },
  { id: "analytics", label: "Analytics", icon: BarChart3, path: "/analytics" },
]

const bottomMenuItems = [
  { id: "projects", label: "Projects", icon: FolderOpen, path: "/projects" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
]

interface AppSidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ isCollapsed, onToggle }: AppSidebarProps) {
  const location = useLocation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <TooltipProvider delayDuration={0}>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col transition-all duration-300 md:relative md:translate-x-0",
          "backdrop-blur-xl bg-background/95",
          "border-r border-border/40 shadow-lg",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className={cn(
          "flex h-16 items-center justify-between px-4",
          "border-b border-border/40 backdrop-blur-sm"
        )}>
          {!isCollapsed && (
            <h2 className="text-lg font-bold tracking-tight">
              Ellora
            </h2>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "hidden md:flex hover:bg-accent transition-all duration-200",
              isCollapsed && "mx-auto"
            )}
            onClick={onToggle}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1.5">
            {mainMenuItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path

              return (
                <li key={item.id}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.path}
                          className={cn(
                            "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-emerald-500/20 text-emerald-500 shadow-md shadow-emerald-500/20"
                              : "hover:bg-emerald-500/10 hover:text-emerald-500 text-muted-foreground",
                            "justify-center p-2 w-10 h-10"
                          )}
                          onClick={() => setIsMobileOpen(false)}
                        >
                          <Icon className="h-5 w-5 flex-shrink-0" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-gradient-to-r from-emerald-400/20 to-emerald-600/30 text-emerald-500 border border-emerald-500/50 shadow-sm"
                          : "border border-transparent hover:bg-gradient-to-r hover:from-emerald-400/10 hover:to-emerald-600/15 hover:text-emerald-500/80 hover:border-emerald-500/30 text-muted-foreground",
                        "gap-3 px-3 py-2"
                      )}
                      onClick={() => setIsMobileOpen(false)}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-border/40 p-4">
          <ul className="space-y-1.5">
            {bottomMenuItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path

              return (
                <li key={item.id}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.path}
                          className={cn(
                            "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-emerald-500/20 text-emerald-500 shadow-md shadow-emerald-500/20"
                              : "hover:bg-emerald-500/10 hover:text-emerald-500 text-muted-foreground",
                            "justify-center p-2 w-10 h-10"
                          )}
                          onClick={() => setIsMobileOpen(false)}
                        >
                          <Icon className="h-5 w-5 flex-shrink-0" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-gradient-to-r from-emerald-400/20 to-emerald-600/30 text-emerald-500 border border-emerald-500/50 shadow-sm"
                          : "border border-transparent hover:bg-gradient-to-r hover:from-emerald-400/10 hover:to-emerald-600/15 hover:text-emerald-500/80 hover:border-emerald-500/30 text-muted-foreground",
                        "gap-3 px-3 py-2"
                      )}
                      onClick={() => setIsMobileOpen(false)}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </TooltipProvider>
  )
}