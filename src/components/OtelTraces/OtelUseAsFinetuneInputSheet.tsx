/**
 * UseAsFinetuneInputSheet
 *
 * Right-side sheet that confirms turning a set of OTel traces into a
 * finetune knowledge source attached to a dataset. The actual ingestion
 * is handled by the OtelTraceService — currently a mock that records
 * the handoff and emits `vllora_knowledge_source_updated`.
 */

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { otelTraceService } from '@/services/service-registry';
import { useDatasetsOptional } from '@/contexts/DatasetsContext';

interface OtelUseAsFinetuneInputSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly traceIds: string[];
}

export function OtelUseAsFinetuneInputSheet({
  open,
  onOpenChange,
  traceIds,
}: OtelUseAsFinetuneInputSheetProps) {
  const datasetsCtx = useDatasetsOptional();
  const datasets = datasetsCtx?.datasets ?? [];
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedDataset) {
      toast.error('Pick a dataset first');
      return;
    }
    if (traceIds.length === 0) {
      toast.error('No traces selected');
      return;
    }
    setSubmitting(true);
    try {
      const result = await otelTraceService.useAsFinetuneInput(traceIds, selectedDataset);
      toast.success(
        `Added ${result.sourcesCreated} trace${result.sourcesCreated === 1 ? '' : 's'} to dataset`,
      );
      onOpenChange(false);
    } catch (error) {
      console.error('[UseAsFinetuneInputSheet] failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add traces to dataset');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 p-6">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Use traces as finetune input
          </SheetTitle>
          <SheetDescription>
            {traceIds.length} trace{traceIds.length === 1 ? '' : 's'} will be extracted into a
            knowledge source the finetune skill can train on.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-auto p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Target dataset</label>
            {datasets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don&apos;t have any datasets yet. Create one from the Finetune page first,
                then come back here.
              </p>
            ) : (
              <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a dataset…" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>
                      {ds.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="rounded-md border border-border/60 bg-card/50 p-4 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">What happens next</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>The skill extracts each trace into knowledge parts (one per turn / tool call).</li>
              <li>Topics, records, grader, and eval all run on the new parts automatically.</li>
              <li>The dataset Sources view shows the new traces alongside any PDFs.</li>
            </ol>
          </div>
        </div>

        <SheetFooter className="border-t border-border/60 p-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedDataset}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to dataset
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
