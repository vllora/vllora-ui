import { Routes, Route } from "react-router-dom"
import { Layout } from "../components/layout"
import { HomePage } from "../pages/home"
import { ThreadsAndTracesPage } from "../pages/chat"
import { ProjectsPage } from "../pages/projects"
import { AnalyticsPage } from "../pages/analytics"
import { SettingsPage } from "../pages/settings"
import { ProjectProvider } from "../contexts/ProjectContext"
import { LocalModelsProvider } from "../contexts/LocalModelsContext"
import { ProviderKeysProvider } from "../contexts/ProviderKeysContext"
import { ProtectedRoute } from "../components/ProtectedRoute"
import { lazy, Suspense } from "react"
import { LocalModelsSkeletonLoader } from "../components/models/local/LocalModelsSkeletonLoader"

// Lazy load the models page
const ModelsPage = lazy(() => import("../pages/models").then(module => ({ default: module.ModelsPage })))

/**
 * VlloraRouter - Routes component for embedding in other apps
 *
 * Note: This component does NOT include BrowserRouter, ThemeProvider, or AuthProvider
 * The parent app should provide these.
 */
export function VlloraRouter() {
  return (
    <LocalModelsProvider>
      <Routes>
        {/* Protected routes */}
        <Route path="/" element={<ProtectedRoute><ProviderKeysProvider><ProjectProvider><Layout /></ProjectProvider></ProviderKeysProvider></ProtectedRoute>}>
          {/* Project-scoped routes (using query string ?project_id=...) */}
          <Route index element={<HomePage />} />
          <Route path="chat" element={<ThreadsAndTracesPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route
            path="models"
            element={
              <Suspense fallback={
                <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full">
                  <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
                    <LocalModelsSkeletonLoader viewMode="table" count={12} />
                  </div>
                </section>
              }>
               <ModelsPage />
              </Suspense>
            }
          />

          {/* Global routes */}
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </LocalModelsProvider>
  )
}
