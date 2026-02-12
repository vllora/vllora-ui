/**
 * RecordDetailSidebar
 *
 * Sheet/drawer component for viewing record details (conversation and metadata).
 * Slides in from the right side of the screen.
 * Used in table view mode for better UX with conversation data.
 */

import { useMemo } from "react";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatasetRecord } from "@/types/dataset-types";
import type { AvailableTopic } from "../record-utils";
import { FormattedThreadPanel } from "./cells/FormattedThreadPanel";
import { MetadataPanel } from "./cells/MetadataPanel";
import { TopicCell } from "./cells/TopicCell";
import { QualityIndicator } from "./cells/QualityIndicator";

interface RecordDetailSidebarProps {
  /** The record to display (null = closed) */
  record: DatasetRecord | null;
  /** Handler to close the sidebar */
  onClose: () => void;
  /** Available topics for topic selection */
  availableTopics?: AvailableTopic[];
  /** Handler for updating record topic */
  onUpdateTopic?: (recordId: string, topic: string, isNew?: boolean) => Promise<void>;
  /** Handler for deleting record */
  onDelete?: (recordId: string) => void;
  /** Handler for saving record data */
  onSave?: (recordId: string, data: unknown) => Promise<void>;
  /** All records for prev/next navigation */
  records?: DatasetRecord[];
  /** Handler for navigating to a different record */
  onNavigate?: (recordId: string) => void;
}

export function RecordDetailSidebar({
  record,
  onClose,
  availableTopics = [],
  onUpdateTopic,
  onDelete,
  records,
  onNavigate,
}: RecordDetailSidebarProps) {
  // Get topic path from availableTopics
  const topicPath = useMemo(() => {
    if (!record?.topic) return null;
    const topic = availableTopics.find((t) => t.id === record.topic);
    return topic?.path || [record.topic];
  }, [record?.topic, availableTopics]);

  // Compute navigation index
  const navInfo = useMemo(() => {
    if (!record || !records || records.length === 0) return null;
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx === -1) return null;
    return { index: idx, total: records.length };
  }, [record, records]);

  return (
    <Sheet open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] p-0 flex flex-col">
        {record && (
          <>
            {/* Sticky Header */}
            <div className="flex-none flex items-center justify-between px-6 py-3 border-b border-border bg-background/95 backdrop-blur z-20">
              <div className="flex items-center gap-3 min-w-0">
                <SheetHeader className="space-y-0">
                  <SheetTitle className="text-sm font-semibold whitespace-nowrap">Record Detail</SheetTitle>
                  <SheetDescription className="sr-only">View and edit record details</SheetDescription>
                </SheetHeader>
                {navInfo && (
                  <>
                    <div className="h-4 w-px bg-border shrink-0" />
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {navInfo.index + 1} of {navInfo.total}
                    </span>
                  </>
                )}
              </div>
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Prev/Next grouped */}
                  {navInfo && onNavigate && (
                    <div className="flex items-center bg-muted/50 rounded-lg border border-border p-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md"
                            disabled={navInfo.index === 0}
                            onClick={() => onNavigate(records![navInfo.index - 1].id)}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"><p className="text-xs">Previous record</p></TooltipContent>
                      </Tooltip>
                      <div className="w-px h-4 bg-border mx-0.5" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md"
                            disabled={navInfo.index === navInfo.total - 1}
                            onClick={() => onNavigate(records![navInfo.index + 1].id)}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"><p className="text-xs">Next record</p></TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                  {/* Delete */}
                  {onDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onDelete(record.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p className="text-xs">Delete record</p></TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TooltipProvider>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-auto px-6 py-6 space-y-8">
              {/* Topic Row */}
              {onUpdateTopic && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Topic</span>
                  <TopicCell
                    topic={record.topic}
                    onUpdate={(topic, isNew) => onUpdateTopic(record.id, topic, isNew)}
                    availableTopics={availableTopics}
                  />
                </div>
              )}

              {/* Conversation */}
              <section className="space-y-4">
                <SectionLabel title="Conversation" />
                <FormattedThreadPanel data={record.data} />
              </section>

              <div className="h-px bg-border w-full" />

              {/* Evaluation */}
              <section className="space-y-4">
                <SectionLabel title="Evaluation" />
                {record.evaluation && (record.evaluation.dryRunScore != null || record.evaluation.finetuneScore != null || record.evaluation.score != null) ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-border bg-muted/20 p-3 px-4">
                      <QualityIndicator evaluation={record.evaluation} />
                    </div>
                    {record.evaluation.feedback && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{record.evaluation.feedback}</p>
                    )}
                    {record.evaluation.evaluatedAt && (
                      <p className="text-[10px] text-muted-foreground/50 tabular-nums">
                        Evaluated {new Date(record.evaluation.evaluatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">Not yet evaluated</p>
                )}
              </section>

              <div className="h-px bg-border w-full" />

              {/* Metadata */}
              <section className="space-y-4 pb-2">
                <SectionLabel title="Metadata" />
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <MetadataPanel record={record} topicPath={topicPath} />
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Stitch-style section label — plain uppercase text, no background bar */
function SectionLabel({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">
      {title}
    </h3>
  );
}
