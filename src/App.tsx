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
import { Toaster, toast } from "sonner"
import { useEffect, useState } from "react"
import { applyTheme, getThemeFromStorage } from "./themes/themes"
import { ProviderKeysProvider } from "./contexts/ProviderKeysContext"
import { initializeBackendPort } from "./config/api"
import { listen } from "@tauri-apps/api/event"

interface BackendStatus {
  ready: boolean
  port: number
  error?: string
}


function App() {
  const [isBackendReady, setIsBackendReady] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)

  useEffect(() => {
    // Apply saved theme on mount
    const theme = getThemeFromStorage()
    applyTheme(theme)

    // Initialize backend port from Tauri
    const initBackend = async () => {
      try {
        await initializeBackendPort()
        // Don't set isBackendReady yet - wait for backend-status event
        console.log('Backend port initialized, waiting for backend to be ready...')
      } catch (err) {
        setBackendError(err instanceof Error ? err.message : 'Failed to initialize backend')
      }
    }

    initBackend()

    // Listen for backend status events
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      if ((window as any).__TAURI__) {
        unlisten = await listen<BackendStatus>('backend-status', (event) => {
          const status = event.payload
          console.log('Backend status update:', status)

          if (status.ready) {
            setIsBackendReady(true)
            setBackendError(null)
            if (isRestarting) {
              setIsRestarting(false)
              toast.success('Backend reconnected successfully')
            }
          } else if (status.error) {
            setBackendError(status.error)

            if (status.error.includes('restarting')) {
              setIsRestarting(true)
              toast.warning(status.error)
            } else if (status.error.includes('restart limit')) {
              toast.error('Backend failed to restart. Please restart the application.')
            } else if (status.error.includes('crashed')) {
              toast.error(status.error)
            }
          }
        })
      } else {
        // In browser/dev mode without Tauri, set ready immediately
        setIsBackendReady(true)
      }
    }

    setupListener()

    // Cleanup listener on unmount
    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [isRestarting])

  if (!isBackendReady) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center max-w-md">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            {isRestarting ? (
              <>
                <p className="text-muted-foreground mb-2">Backend is restarting...</p>
                <p className="text-sm text-muted-foreground/70">Please wait while we reconnect</p>
              </>
            ) : backendError ? (
              <>
                <p className="text-destructive mb-2">Backend Error</p>
                <p className="text-sm text-muted-foreground">{backendError}</p>
                <p className="text-xs text-muted-foreground/70 mt-4">
                  Check logs at: ~/Library/Logs/com.ellora.app/
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Initializing backend...</p>
            )}
          </div>
        </div>
      </ThemeProvider>
    )
  }

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