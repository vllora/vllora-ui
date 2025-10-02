import { useState } from "react"
import { Outlet } from "react-router-dom"
import { AppSidebar } from "./app-sidebar"
import { Header } from "./Header"
import { ProjectsConsumer } from "@/contexts/ProjectContext"

export function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const { currentProjectId } = ProjectsConsumer()

  const handleProjectChange = (newProjectId: string) => {
    // Project change is handled by ProjectDropdown updating the URL query string
    // Store preference in localStorage
    localStorage.setItem('currentProjectId', newProjectId)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        currentProjectId={currentProjectId}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onProjectChange={handleProjectChange} />
        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}