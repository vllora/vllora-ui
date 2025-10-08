import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "./components/layout"
import { HomePage } from "./pages/home"
import { ChatPageWrapper } from "./pages/chat"
import { ProjectsPage } from "./pages/projects"
import { AnalyticsPage } from "./pages/analytics"
import { SettingsPage } from "./pages/settings"
import { ThemeProvider } from "./components/theme-provider"
import { ProjectProvider } from "./contexts/ProjectContext"
import { LocalModelsProvider } from "./contexts/LocalModelsContext"
import { Toaster } from "sonner"
import { useEffect } from "react"
import { applyTheme, getThemeFromStorage } from "./themes/themes"
import { ProviderKeysProvider } from "./contexts/ProviderKeysContext"
import { initializeBackendPort } from "./config/api"


function App() {
  useEffect(() => {
    // Apply saved theme on mount
    const theme = getThemeFromStorage()
    applyTheme(theme)

    // Initialize backend port from Tauri
    initializeBackendPort()
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <BrowserRouter>
        <LocalModelsProvider>
          <Routes>
            <Route path="/" element={<ProjectProvider><Layout /></ProjectProvider>}>
              {/* Project-scoped routes (now using query string ?project_id=...) */}
              <Route index element={<HomePage />} />
              <Route path="chat" element={<ChatPageWrapper />} />
              <Route path="analytics" element={<AnalyticsPage />} />

              {/* Global routes */}
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="settings" element={<ProviderKeysProvider><SettingsPage /></ProviderKeysProvider>} />
            </Route>
          </Routes>
          <Toaster position="top-right" richColors />
        </LocalModelsProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App