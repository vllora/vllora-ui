import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { ExperimentConsumer } from "@/contexts/ExperimentContext";

export function ExperimentHeader() {
  const navigate = useNavigate();
  const { experimentData } = ExperimentConsumer();

  return (
    <div className="h-14 border-b border-border flex items-center px-4 justify-between flex-shrink-0 bg-background">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Button>

        <div className="w-px h-6 bg-border" />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[rgb(var(--theme-500))]/10 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold leading-tight">{experimentData.name}</h1>
            {experimentData.description && (
              <p className="text-xs text-muted-foreground leading-tight">{experimentData.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
