/**
 * TasksViewer
 *
 * Simple viewer for Lucy's task checklist (tasks.md).
 * Reads from useChatStateStore.todos (ephemeral — lost on page reload).
 * Shown when the tasks.md node is opened in the Explorer.
 */

import { useChatStateStore } from "@distri/react";
import { ListChecks, Circle, CircleDot, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function TasksViewer() {
  const todos = useChatStateStore((s) => s.todos);

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
          <ListChecks className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No tasks</p>
          <p className="text-xs text-muted-foreground mt-1">
            Lucy will create tasks as she works on your dataset.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
        Tasks ({todos.filter((t) => t.status === "done").length}/{todos.length})
      </h3>
      {todos.map((todo) => (
        <div
          key={todo.id}
          className={cn(
            "flex items-start gap-2 px-2 py-1.5 rounded-md text-sm",
            todo.status === "done" && "opacity-60"
          )}
        >
          <span className="mt-0.5 shrink-0">
            {todo.status === "done" ? (
              <CheckCircle2 className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            ) : todo.status === "in_progress" ? (
              <CircleDot className="w-4 h-4 text-blue-500 animate-pulse" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground" />
            )}
          </span>
          <span
            className={cn(
              "flex-1 leading-snug",
              todo.status === "done" && "line-through text-muted-foreground"
            )}
          >
            {todo.content}
          </span>
        </div>
      ))}
    </div>
  );
}
