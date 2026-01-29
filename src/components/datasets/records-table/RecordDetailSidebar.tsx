/**
 * RecordDetailSidebar
 *
 * Sheet/drawer component for viewing record details (conversation and metadata).
 * Slides in from the right side of the screen.
 * Used in table view mode for better UX with conversation data.
 */

import { useMemo } from "react";
import { MessageSquare, Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { DatasetRecord } from "@/types/dataset-types";
import type { AvailableTopic } from "../record-utils";
import { FormattedThreadPanel } from "./cells/FormattedThreadPanel";
import { MetadataPanel } from "./cells/MetadataPanel";
import { TopicCell } from "./cells/TopicCell";

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
}

export function RecordDetailSidebar({
  record,
  onClose,
  availableTopics = [],
  onUpdateTopic,
  onDelete,
}: RecordDetailSidebarProps) {
  // Get topic path from availableTopics
  const topicPath = useMemo(() => {
    if (!record?.topic) return null;
    const topic = availableTopics.find((t) => t.id === record.topic);
    return topic?.path || [record.topic];
  }, [record?.topic, availableTopics]);

  return (
    <Sheet open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] p-0 flex flex-col">
        {record && (
          <>
            {/* Header */}
            <SheetHeader className="px-4 py-3 border-b border-border bg-muted/30 space-y-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-sm font-medium">Record Detail</SheetTitle>
                {/* Delete */}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => onDelete(record.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <SheetDescription className="sr-only">
                View and edit record details
              </SheetDescription>
            </SheetHeader>

            {/* Topic */}
            {onUpdateTopic && (
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Topic:</span>
                  <TopicCell
                    topic={record.topic}
                    onUpdate={(topic, isNew) => onUpdateTopic(record.id, topic, isNew)}
                    availableTopics={availableTopics}
                  />
                </div>
              </div>
            )}

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-auto">
              {/* Formatted Thread */}
              <div className="border-b border-border">
                <SectionHeader icon={MessageSquare} title="Conversation" />
                <div className="p-4">
                  <FormattedThreadPanel data={record.data} />
                </div>
              </div>

              {/* Metadata */}
              <div>
                <SectionHeader icon={Info} title="Metadata" />
                <div className="p-4">
                  <MetadataPanel record={record} topicPath={topicPath} />
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
}

function SectionHeader({ icon: Icon, title }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}
