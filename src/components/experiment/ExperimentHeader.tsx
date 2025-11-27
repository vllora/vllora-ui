import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { ExperimentData } from "@/hooks/useExperiment";

interface ExperimentHeaderProps {
  experimentData: ExperimentData;
}

export function ExperimentHeader({ experimentData }: ExperimentHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="h-16 border-b border-border flex items-center px-6 justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div>
          <h1 className="text-lg font-semibold">{experimentData.name}</h1>
          {experimentData.description && (
            <p className="text-sm text-muted-foreground">{experimentData.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
