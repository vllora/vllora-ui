import { Outlet } from "react-router"
import { AppSidebar } from "./app-sidebar"
import { AppHeader } from "./Header"
import { ProjectsConsumer } from "@/contexts/ProjectContext"
import { ProjectEventsProvider } from "@/contexts/project-events"
import { BreakpointsProvider } from "@/contexts/breakpoints"

export function Layout() {
  const { currentProjectId } = ProjectsConsumer()

  const handleProjectChange = (newProjectId: string) => {
    // Project change is handled by ProjectDropdown updating the URL query string
    // Store preference in localStorage
    localStorage.setItem('currentProjectId', newProjectId)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        isCollapsed={true}
        currentProjectId={currentProjectId}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader onProjectChange={handleProjectChange} />
        <main className="flex-1 flex overflow-hidden">
          <BreakpointsProvider>
            <ProjectEventsProvider projectId={currentProjectId || ""}>
              <Outlet />
            </ProjectEventsProvider>
          </BreakpointsProvider>
        </main>
      </div>
    </div>
  )
}