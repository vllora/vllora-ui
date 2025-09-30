import { MessageSquare } from "lucide-react"

export function ChatPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Chat</h1>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Chat Interface</h2>
        <p className="text-muted-foreground">
          Start conversations with your language models here. This is where you can interact with various LLMs and manage your chat sessions.
        </p>
      </div>
    </div>
  )
}