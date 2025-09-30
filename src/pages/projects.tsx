import { FolderOpen } from "lucide-react"

export function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Projects</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Project Management</h2>
        <p className="text-muted-foreground">
          Organize and manage your LLM projects here. Create, edit, and track different projects with various configurations and models.
        </p>
      </div>
    </div>
  )
}