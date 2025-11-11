import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface FallbackModelsEmptyStateProps {
  hasAvailableModels: boolean;
  onAddModel: () => void;
}

export function FallbackModelsEmptyState({
  hasAvailableModels,
  onAddModel,
}: FallbackModelsEmptyStateProps) {
  return (
    <div className="py-6 text-center space-y-3">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No fallback models added</p>
        <p className="text-xs text-muted-foreground">
          Add backup models to use if the primary model fails
        </p>
      </div>
      {hasAvailableModels && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddModel}
          className="mx-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Fallback Model
        </Button>
      )}
    </div>
  );
}
