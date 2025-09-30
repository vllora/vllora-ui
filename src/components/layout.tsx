import { useState } from "react"
import { Outlet } from "react-router-dom"
import { AppSidebar } from "./app-sidebar"
import { cn } from "@/lib/utils"

export function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <main
        className={cn(
          "flex-1 overflow-y-auto transition-all duration-300 flex",
          isSidebarCollapsed ? "md:ml-0" : "md:ml-0"
        )}
      >
        <div className="pt-20 md:pt-6 flex flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  )
}