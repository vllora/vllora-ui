import { useState, useEffect } from "react"
import { Outlet, useParams, useNavigate, useLocation } from "react-router-dom"
import { AppSidebar } from "./app-sidebar"
import { Header } from "./Header"
import { listProjects } from "@/services/projects-api"

export function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // If we're on a project-scoped route but no projectId, redirect to default project
    const isProjectScopedRoute = location.pathname === '/' ||
                                  !location.pathname.startsWith('/projects') &&
                                  !location.pathname.startsWith('/settings')

    if (isProjectScopedRoute && !projectId) {
      loadDefaultProject()
    }
  }, [location.pathname, projectId])

  const loadDefaultProject = async () => {
    try {
      // Check localStorage first
      const storedProjectId = localStorage.getItem('currentProjectId')
      if (storedProjectId) {
        navigate(`/project/${storedProjectId}`, { replace: true })
        return
      }

      // Otherwise, fetch and set default project
      const projects = await listProjects()
      const defaultProject = projects.find((p) => p.is_default) || projects[0]
      if (defaultProject) {
        localStorage.setItem('currentProjectId', defaultProject.id)
        navigate(`/project/${defaultProject.id}`, { replace: true })
      }
    } catch (error) {
      console.error('Failed to load default project:', error)
    }
  }

  const handleProjectChange = (newProjectId: string) => {
    localStorage.setItem('currentProjectId', newProjectId)

    // Get current path relative to project
    const currentPath = location.pathname.split('/').slice(3).join('/') || ''

    // Navigate to same page but with new project
    navigate(`/project/${newProjectId}${currentPath ? '/' + currentPath : ''}`)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        currentProjectId={projectId}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          currentProjectId={projectId}
          onProjectChange={handleProjectChange}
        />
        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}