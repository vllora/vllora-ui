import { Routes, Route, BrowserRouter } from "react-router"
import { Layout } from "./components/layout"
import { HomePage } from "./pages/home"
import { ThreadsAndTracesPage } from "./pages/chat"
import { ProjectsPage } from "./pages/projects"
import { AnalyticsPage } from "./pages/analytics"
import { SettingsPage } from "./pages/settings"
import { LoginPage } from "./pages/login"
import { ThemeProvider } from "./components/theme-provider"
import { ProjectsProvider } from "./contexts/ProjectContext"
import { ProjectModelsProvider } from "./contexts/ProjectModelsContext"
import { Toaster } from "sonner"
import { useEffect, lazy, Suspense } from "react"
import { applyTheme, getThemeFromStorage } from "./themes/themes"
import { ProviderKeysProvider } from "./contexts/ProviderKeysContext"
import { AuthProvider } from "./contexts/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { LocalModelsSkeletonLoader } from "./components/models/local/LocalModelsSkeletonLoader"
import { AvailableApiKeysProvider, CurrentAppProvider, VirtualModelsProvider } from "./lib"
import { ThreadAndTracesPageProvider } from "./contexts/ThreadAndTracesPageContext"

// Lazy load the models page
const ModelsPage = lazy(() => import("./pages/models").then(module => ({ default: module.ModelsPage })))

function App() {
  useEffect(() => {
    // Apply saved theme on mount
    const theme = getThemeFromStorage()
    applyTheme(theme)
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <CurrentAppProvider app_mode="vllora">
        <AuthProvider>
          <BrowserRouter>

            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected routes */}
              <Route path="/" element={<ProtectedRoute>
                <ProjectsProvider project_id_from="query_string">
                   <VirtualModelsProvider>
                  <AvailableApiKeysProvider available_api_keys={[]}>
                    <ProjectModelsProvider>
                      <ProviderKeysProvider>
                        <Layout />
                      </ProviderKeysProvider>
                    </ProjectModelsProvider>
                  </AvailableApiKeysProvider>
                </VirtualModelsProvider>
                </ProjectsProvider>
              </ProtectedRoute>}>
                {/* Project-scoped routes (now using query string ?project_id=...) */}
                <Route index element={<HomePage />} />
                <Route path="chat" element={<ThreadAndTracesPageProvider><ThreadsAndTracesPage /></ThreadAndTracesPageProvider>} />
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
            <Toaster position="top-right" richColors />
          </BrowserRouter>
        </AuthProvider>
      </CurrentAppProvider>
    </ThemeProvider >
  )
}

export default App
