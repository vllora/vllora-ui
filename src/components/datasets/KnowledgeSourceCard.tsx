/**
 * KnowledgeSourceCard
 *
 * Card component for displaying a single knowledge source (uploaded doc).
 * Shows file info, status, extracted topics/sections, and allows expansion.
 */

import { FileText, Trash2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KnowledgeSource } from "@/types/dataset-types";

const MAX_TOPICS_SHOWN = 10;
const MAX_SECTIONS_SHOWN = 5;

interface KnowledgeSourceCardProps {
  source: KnowledgeSource;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  /** Compact mode: hides delete button and expand controls */
  compact?: boolean;
}

/**
 * Get status badge color based on source status
 */
function getStatusColor(status: KnowledgeSource["status"]) {
  switch (status) {
    case "ready":
      return "bg-green-500/20 text-green-500";
    case "processing":
      return "bg-blue-500/20 text-blue-500";
    case "failed":
      return "bg-red-500/20 text-red-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Get file type icon color - using muted foreground for a cleaner look
 */
function getTypeColor(_type: KnowledgeSource["type"]) {
  // Use consistent muted color for all file types
  return "text-muted-foreground";
}

export function KnowledgeSourceCard({
  source,
  isExpanded,
  onToggleExpand,
  onDelete,
  compact = false,
}: KnowledgeSourceCardProps) {
  const hasContent =
    source.extractedContent &&
    (source.extractedContent.text ||
      (source.extractedContent.sectionHeadings && source.extractedContent.sectionHeadings.length > 0) ||
      (source.extractedContent.sections && source.extractedContent.sections.length > 0));

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Source header */}
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 bg-card",
          !compact && hasContent && "cursor-pointer hover:bg-muted/50"
        )}
        onClick={() => !compact && hasContent && onToggleExpand()}
      >
        {/* Expand/collapse icon (hidden in compact mode) */}
        {!compact && (
          hasContent ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )
          ) : (
            <div className="w-4" />
          )
        )}

        {/* File icon */}
        <FileText className={cn("w-5 h-5 shrink-0", getTypeColor(source.type))} />

        {/* Name and type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{source.name}</p>
          <p className="text-xs text-muted-foreground">
            {source.type.toUpperCase()}
            {source.extractedContent?.sectionHeadings && source.extractedContent.sectionHeadings.length > 0 && (
              <> &middot; {source.extractedContent.sectionHeadings.length} sections</>
            )}
            {source.extractedContent?.sections && source.extractedContent.sections.length > 0 && (
              <> &middot; {source.extractedContent.sections.length} sections</>
            )}
          </p>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded-full uppercase",
            getStatusColor(source.status)
          )}
        >
          {source.status}
        </span>

        {/* Delete button (hidden in compact mode) */}
        {!compact && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Processing progress indicator */}
      {source.status === "processing" && source.progress && (
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {source.progress.step}
              </p>
              {source.progress.percent !== undefined && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, source.progress.percent)}%`,
                        backgroundColor: 'rgb(var(--theme-500))'
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {source.progress.current !== undefined && source.progress.total !== undefined
                      ? `${source.progress.current}/${source.progress.total}`
                      : `${Math.round(source.progress.percent)}%`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <div className="border-t border-border bg-muted/30 p-3 space-y-3">
          {/* Document Sections */}
          {source.extractedContent?.sectionHeadings && source.extractedContent.sectionHeadings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Document Sections</p>
              <div className="flex flex-wrap gap-1.5">
                {source.extractedContent.sectionHeadings.slice(0, MAX_TOPICS_SHOWN).map((heading, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-500 rounded-full"
                  >
                    {heading}
                  </span>
                ))}
                {source.extractedContent.sectionHeadings.length > MAX_TOPICS_SHOWN && (
                  <span className="px-2 py-0.5 text-xs text-muted-foreground">
                    +{source.extractedContent.sectionHeadings.length - MAX_TOPICS_SHOWN} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Sections */}
          {source.extractedContent?.sections && source.extractedContent.sections.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Document Sections</p>
              <div className="space-y-1">
                {source.extractedContent.sections.slice(0, MAX_SECTIONS_SHOWN).map((section, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium">{section.title}</span>
                    {section.content && (
                      <span className="text-muted-foreground ml-1">- {section.content}</span>
                    )}
                  </div>
                ))}
                {source.extractedContent.sections.length > MAX_SECTIONS_SHOWN && (
                  <p className="text-xs text-muted-foreground">
                    +{source.extractedContent.sections.length - MAX_SECTIONS_SHOWN} more sections
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Text preview */}
          {source.extractedContent?.text && !source.extractedContent.sections?.length && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Content Preview</p>
              <p className="text-xs text-muted-foreground line-clamp-4">
                {source.extractedContent.text.substring(0, 500)}...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
