import { useState, useEffect, useCallback } from "react";
import { Database, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dataset } from "@/types/dataset-types";
import { Span } from "@/types/common-type";
import * as datasetsDB from "@/services/datasets-db";
import { AddToDatasetDialog } from "@/components/datasets/AddToDatasetDialog";
import { Link } from "react-router-dom";

interface SpanFooterProps {
  span: Span;
}

export const SpanFooter = ({ span }: SpanFooterProps) => {
  const [spanDatasets, setSpanDatasets] = useState<Dataset[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Load datasets that contain this span
  const loadSpanDatasets = useCallback(() => {
    if (span?.span_id) {
      datasetsDB.getDatasetsBySpanId(span.span_id).then(setSpanDatasets);
    } else {
      setSpanDatasets([]);
    }
  }, [span?.span_id]);

  useEffect(() => {
    loadSpanDatasets();
  }, [loadSpanDatasets]);

  return (
    <>
      <div className="sticky bottom-0 z-10 flex flex-row items-center justify-between p-3 px-4 gap-3 w-full bg-[#161616] border-t border-border">
        {spanDatasets.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                <span>
                  In <span className="text-foreground font-medium">{spanDatasets.length}</span> dataset{spanDatasets.length !== 1 ? 's' : ''}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                {spanDatasets.map(ds => (
                  <Link
                    key={ds.id}
                    to={`/datasets?id=${ds.id}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 text-sm"
                  >
                    <Database className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate" title={ds.name}>{ds.name}</span>
                  </Link>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-sm text-muted-foreground">Not in any dataset</span>
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
        spans={[span]}
        onSuccess={loadSpanDatasets}
      />
    </>
  );
};
