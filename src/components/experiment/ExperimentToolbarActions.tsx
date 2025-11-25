import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExperimentToolbarActionsProps {
  onAddMessage: () => void;
  onAddTool: () => void;
}

export function ExperimentToolbarActions({
  onAddMessage,
  onAddTool,
}: ExperimentToolbarActionsProps) {
  const buttonClassName =
    "gap-1 text-[rgb(var(--theme-500))] hover:text-[rgb(var(--theme-400))] hover:bg-[rgb(var(--theme-500)/0.1)]";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={onAddMessage}
        className={buttonClassName}
      >
        <Plus className="w-4 h-4" />
        Add Message
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onAddTool}
        className={buttonClassName}
      >
        <Plus className="w-4 h-4" />
        Add Tool
      </Button>
    </>
  );
}
