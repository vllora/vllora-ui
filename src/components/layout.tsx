import { Outlet } from "react-router-dom"
import { AppSidebar } from "./app-sidebar"
import { Header } from "./Header"
import { ProjectsConsumer } from "@/contexts/ProjectContext"
import { ProjectEventsProvider } from "@/contexts/project-events"

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
        <Header onProjectChange={handleProjectChange} />
        <main className="flex-1 flex overflow-hidden">
          {currentProjectId ? (
            <ProjectEventsProvider projectId={currentProjectId}>
              <Outlet />
            </ProjectEventsProvider>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  )
}