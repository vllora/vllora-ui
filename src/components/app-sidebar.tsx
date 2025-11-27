import { useState, useMemo } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import {
  Home,
  MessageSquare,
  Settings,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ProjectsConsumer } from "@/contexts/ProjectContext"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const mainMenuItems = [
  { id: "home", label: "Home", icon: Home, path: "/" },
  { id: "chat", label: "Chat", icon: MessageSquare, path: "/chat" },
]

const bottomMenuItems = [
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
]

interface AppSidebarProps {
  isCollapsed: boolean
  currentProjectId?: string
}

export function AppSidebar({ isCollapsed, currentProjectId }: AppSidebarProps) {
  const location = useLocation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const { projects, isDefaultProject } = ProjectsConsumer()

  // Get default project for fallback
  const defaultProject = projects.find((p) => p.is_default) || projects[0]

  // Build query string with project_id only if not default project
  const projectQueryString = useMemo(() => {
    const projectIdToUse = currentProjectId || defaultProject?.id
    if (!projectIdToUse || isDefaultProject(projectIdToUse)) return ''
    return `?project_id=${projectIdToUse}`
  }, [currentProjectId, defaultProject?.id, isDefaultProject])
  const navigate = useNavigate()

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
        <div
          onClick={() => {
            // TODO: add redirect to home
            navigate("/")
          }}
          className={cn(
            "flex h-16 items-center justify-center px-4 cursor-pointer",
            "border-b border-border/50 backdrop-blur-sm"
          )}>
          <img src="/logo-icon-white.svg" alt="vLLora" className="h-8" />
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1.5">
            {mainMenuItems.map((item) => {
              const Icon = item.icon
              // Build path with query string for project-scoped routes
              const itemPath = `${item.path}${projectQueryString}`

              // Check if active (match path)
              const isActive = location.pathname === item.path

              return (
                <li key={item.id}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={itemPath}
                          className={cn(
                            "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                              : "hover:bg-[rgba(var(--theme-500),0.1)] hover:text-[rgb(var(--theme-500))] text-muted-foreground",
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
                      to={itemPath}
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                          : "hover:bg-[rgba(var(--theme-500),0.1)] hover:text-[rgb(var(--theme-500))] text-muted-foreground",
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
                              ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                              : "hover:bg-[rgba(var(--theme-500),0.1)] hover:text-[rgb(var(--theme-500))] text-muted-foreground",
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
                          ? "bg-[rgba(var(--theme-500),0.1)] text-[rgb(var(--theme-500))]"
                          : "hover:bg-[rgba(var(--theme-500),0.1)] hover:text-[rgb(var(--theme-500))] text-muted-foreground",
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