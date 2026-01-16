import { useState, useEffect, useCallback } from "react";
import { Database, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Dataset } from "@/types/dataset-types";
import * as datasetsDB from "@/services/datasets-db";
import { AddToDatasetDialog } from "@/components/datasets/AddToDatasetDialog";

const MAX_VISIBLE_DATASETS = 3;

export const SpanFooter = () => {
  const { detailSpan } = ChatWindowConsumer();
  const [spanDatasets, setSpanDatasets] = useState<Dataset[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Load datasets that contain this span
  const loadSpanDatasets = useCallback(() => {
    if (detailSpan?.span_id) {
      datasetsDB.getDatasetsBySpanId(detailSpan.span_id).then(setSpanDatasets);
    } else {
      setSpanDatasets([]);
    }
  }, [detailSpan?.span_id]);

  useEffect(() => {
    loadSpanDatasets();
  }, [loadSpanDatasets]);

  if (!detailSpan) {
    return null;
  }

  return (
    <>
      <div className="sticky bottom-0 z-10 flex flex-row items-center justify-between p-3 px-4 gap-3 w-full bg-[#161616] border-t border-border">
        {spanDatasets.length > 0 ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Database className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {spanDatasets.slice(0, MAX_VISIBLE_DATASETS).map(ds => (
                <span
                  key={ds.id}
                  className="px-2 py-0.5 text-xs rounded-md bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))] truncate max-w-[120px]"
                  title={ds.name}
                >
                  {ds.name}
                </span>
              ))}
              {spanDatasets.length > MAX_VISIBLE_DATASETS && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="px-2 py-0.5 text-xs rounded-md bg-muted text-muted-foreground cursor-help">
                        +{spanDatasets.length - MAX_VISIBLE_DATASETS} more
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="p-2 max-w-xs bg-background border border-border rounded-md shadow-md">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-foreground">All datasets:</p>
                        {spanDatasets.map(ds => (
                          <div key={ds.id} className="text-xs text-muted-foreground">
                            • {ds.name}
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 text-xs flex-shrink-0"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add to Dataset
        </Button>
      </div>

      <AddToDatasetDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        spans={[detailSpan]}
        onSuccess={loadSpanDatasets}
      />
    </>
  );
};
