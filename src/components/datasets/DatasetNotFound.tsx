/**
 * DatasetNotFound
 *
 * Empty state component shown when a dataset is not found.
 */

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DatasetNotFoundProps {
  onBack: () => void;
}

export function DatasetNotFound({ onBack }: DatasetNotFoundProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">Workflow not found</p>
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Workflows
      </Button>
    </div>
  );
}
