import { Settings } from "lucide-react"

export function SettingsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Application Settings</h2>
        <p className="text-muted-foreground">
          Configure your application preferences, API keys, model settings, and other configurations here.
        </p>
      </div>
    </div>
  )
}