/**
 * RecordExpandedDetail
 *
 * Inline expanded view for a record showing formatted thread and metadata
 * in a 2-column layout.
 */

import { useMemo } from "react";
import { MessageSquare, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetRecord } from "@/types/dataset-types";
import type { AvailableTopic } from "../../record-utils";
import { FormattedThreadPanel } from "./FormattedThreadPanel";
import { MetadataPanel } from "./MetadataPanel";

interface RecordExpandedDetailProps {
  record: DatasetRecord;
  availableTopics?: AvailableTopic[];
  className?: string;
}

export function RecordExpandedDetail({
  record,
  availableTopics = [],
  className,
}: RecordExpandedDetailProps) {
  // Get topic path from availableTopics
  const topicPath = useMemo(() => {
    if (!record.topic) return null;
    const topic = availableTopics.find((t) => t.name === record.topic);
    return topic?.path || [record.topic];
  }, [record.topic, availableTopics]);

  return (
    <div className={cn("bg-zinc-900/40", className)}>
      <div className="grid grid-cols-4 divide-x divide-border/30">
        {/* Formatted Thread Column - 3/4 width */}
        <div className="col-span-3 flex flex-col">
          <PanelHeader icon={MessageSquare} title="Formatted Thread" />
          <div className="p-4">
            <FormattedThreadPanel data={record.data} />
          </div>
        </div>

        {/* Definitions & Meta Column - 1/4 width */}
        <div className="col-span-1 flex flex-col">
          <PanelHeader icon={Info} title="Definitions & Meta" />
          <div className="p-4">
            <MetadataPanel record={record} topicPath={topicPath} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface PanelHeaderProps {
  icon: React.ElementType;
  title: string;
}

function PanelHeader({ icon: Icon, title }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-zinc-900/60">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}

