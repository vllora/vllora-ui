/**
 * DocsDrawer
 *
 * Right-side Sheet drawer wrapping KnowledgeSourcesPanel.
 * Opened via header button — keeps workspace context preserved.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { KnowledgeSourcesPanel } from "./KnowledgeSourcesPanel";

interface DocsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetId: string;
}

export function DocsDrawer({
  open,
  onOpenChange,
  datasetId,
}: DocsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[50vw] max-w-[600px] min-w-[400px] p-0 flex flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Reference Documents</SheetTitle>
          <SheetDescription>Knowledge sources for this dataset</SheetDescription>
        </SheetHeader>
        <KnowledgeSourcesPanel
          datasetId={datasetId}
          className="h-full"
        />
      </SheetContent>
    </Sheet>
  );
}
