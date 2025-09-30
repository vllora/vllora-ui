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

const menuItems = [
  { id: "home", label: "Home", icon: Home, path: "/" },
  { id: "chat", label: "Chat", icon: MessageSquare, path: "/chat" },
  { id: "projects", label: "Projects", icon: FolderOpen, path: "/projects" },
  { id: "analytics", label: "Analytics", icon: BarChart3, path: "/analytics" },
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
    <>
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
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-background transition-all duration-300 md:relative md:translate-x-0",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          {!isCollapsed && (
            <h2 className="text-lg font-semibold">LLM Studio</h2>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "hidden md:flex",
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
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path

              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-secondary text-secondary-foreground"
                        : "hover:bg-secondary/50",
                      isCollapsed && "justify-center"
                    )}
                    onClick={() => setIsMobileOpen(false)}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className={cn(
          "p-4 border-t",
          isCollapsed ? "flex justify-center" : ""
        )}>
          <ModeToggle />
        </div>
      </div>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  )
}