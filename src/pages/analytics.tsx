import { BarChart3 } from "lucide-react"

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Analytics</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Usage Analytics</h2>
        <p className="text-muted-foreground">
          View detailed analytics about your LLM usage, including token consumption, response times, and model performance metrics.
        </p>
      </div>
    </div>
  )
}