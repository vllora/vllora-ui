import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "./components/layout"
import { HomePage } from "./pages/home"
import { ChatPage } from "./pages/chat"
import { ProjectsPage } from "./pages/projects"
import { AnalyticsPage } from "./pages/analytics"
import { SettingsPage } from "./pages/settings"
import { ThemeProvider } from "./components/theme-provider"

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App