import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "./components/layout"
import { HomePage } from "./pages/home"
import { ThreadsAndTracesPage } from "./pages/chat"
import { ProjectsPage } from "./pages/projects"
import { AnalyticsPage } from "./pages/analytics"
import { SettingsPage } from "./pages/settings"
import { LoginPage } from "./pages/login"
import { ThemeProvider } from "./components/theme-provider"
import { ProjectProvider } from "./contexts/ProjectContext"
import { LocalModelsProvider } from "./contexts/LocalModelsContext"
import { Toaster } from "sonner"
import { useEffect, lazy, Suspense } from "react"
import { applyTheme, getThemeFromStorage } from "./themes/themes"
import { ProviderKeysProvider } from "./contexts/ProviderKeysContext"
import { AuthProvider } from "./contexts/AuthContext"
import { configureAmplify } from "./config/amplify"
import { LocalModelsSkeletonLoader } from "./components/models/local/LocalModelsSkeletonLoader"

// Lazy load the models page
const ModelsPage = lazy(() => import("./pages/models").then(module => ({ default: module.ModelsPage })))

// Configure Amplify before rendering
configureAmplify()

function App() {
  useEffect(() => {
    // Apply saved theme on mount
    const theme = getThemeFromStorage()
    applyTheme(theme)
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <AuthProvider>
        <BrowserRouter>
          <LocalModelsProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />

              <Route path="/" element={<ProjectProvider><Layout /></ProjectProvider>}>
                {/* Project-scoped routes (now using query string ?project_id=...) */}
                <Route index element={<ProviderKeysProvider><HomePage /></ProviderKeysProvider>} />
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
                      <ProviderKeysProvider><ModelsPage /></ProviderKeysProvider>
                    </Suspense>
                  } 
                />

                {/* Global routes */}
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="settings" element={<ProviderKeysProvider><SettingsPage /></ProviderKeysProvider>} />
              </Route>
            </Routes>
            <Toaster position="top-right" richColors />
          </LocalModelsProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
