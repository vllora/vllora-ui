/**
 * ReadmeDrawer
 *
 * Right-side Sheet drawer wrapping DatasetReadmeViewer.
 * Opened via header button — keeps workspace context preserved.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { DatasetReadmeViewer } from "./readme-viewer";

interface ReadmeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readme: string | null;
  readmeUpdatedAt: number | null;
  onExport: () => void;
  onRegenerate: () => Promise<void>;
}

export function ReadmeDrawer({
  open,
  onOpenChange,
  readme,
  readmeUpdatedAt,
  onExport,
  onRegenerate,
}: ReadmeDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[60vw] max-w-3xl min-w-[400px] p-0 flex flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Dataset README</SheetTitle>
          <SheetDescription>Auto-generated README for this dataset</SheetDescription>
        </SheetHeader>
        <DatasetReadmeViewer
          readme={readme}
          readmeUpdatedAt={readmeUpdatedAt}
          onExport={onExport}
          onRegenerate={onRegenerate}
          className="h-full"
        />
      </SheetContent>
    </Sheet>
  );
}
