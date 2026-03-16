/**
 * CanvasEmptyState
 *
 * Empty state shown on the canvas when no topics exist.
 * Displays upload prompt and skill command hint.
 */

import { Upload, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CanvasEmptyStateProps {
  readonly onImportClick?: () => void;
  readonly onDocsClick?: () => void;
}

export function CanvasEmptyState({ onImportClick, onDocsClick }: CanvasEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
      {/* Dashed icon placeholder */}
      <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-muted-foreground/20 flex items-center justify-center mb-6">
        <Upload className="w-8 h-8 text-muted-foreground/30" />
      </div>

      <h3 className="text-lg font-medium text-foreground mb-2">No topics yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Upload documents and run the finetune skill to extract topics and generate training data.
      </p>

      <div className="flex items-center gap-3 mb-6">
        {onDocsClick && (
          <Button variant="outline" size="sm" onClick={onDocsClick}>
            <Upload className="w-4 h-4 mr-1.5" />
            Upload Documents
          </Button>
        )}
        {onImportClick && (
          <Button variant="outline" size="sm" onClick={onImportClick}>
            Import Records
          </Button>
        )}
      </div>

      {/* Skill command hint */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border/50">
        <Terminal className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        <code className="text-xs text-muted-foreground font-mono">
          claude /run finetune your-document.pdf
        </code>
      </div>
    </div>
  );
}
