/**
 * KnowledgeSourceCard
 *
 * Card component for displaying a single knowledge source (uploaded doc).
 * Shows file info, status, extracted sections, and allows expansion.
 *
 * Expanded view shows a unified numbered section list with headings,
 * content previews, and a "Show all / Show less" toggle.
 */

import { useState } from "react";
import { FileText, Trash2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KnowledgeSource } from "@/types/dataset-types";

/** Number of sections shown before "Show all" toggle */
const COLLAPSED_SECTION_COUNT = 5;
/** Max characters for inline content preview per section */
const CONTENT_PREVIEW_LENGTH = 200;

interface KnowledgeSourceCardProps {
  source: KnowledgeSource;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  /** Compact mode: hides delete button and expand controls */
  compact?: boolean;
  /** Number of records generated from this source */
  recordCount?: number;
  /** Coverage percentage (0-100) of this source's chunks */
  coveragePercent?: number;
  /** Callback to filter records table by this source */
  onFilterBySource?: () => void;
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

// ---------------------------------------------------------------------------
// Expanded sections panel — unified numbered list with content previews
// ---------------------------------------------------------------------------

interface ExpandedSectionsProps {
  source: KnowledgeSource;
  showAll: boolean;
  onToggleShowAll: () => void;
}

/**
 * Build a unified section list from extracted content.
 * Prefers `sections` (title + content) over bare `sectionHeadings`.
 */
function buildSectionItems(source: KnowledgeSource): Array<{ title: string; preview: string }> {
  const extracted = source.extractedContent;
  if (!extracted) return [];

  // Rich sections with content
  if (extracted.sections && extracted.sections.length > 0) {
    return extracted.sections.map((s) => ({
      title: s.title,
      preview: s.content
        ? s.content.length > CONTENT_PREVIEW_LENGTH
          ? s.content.slice(0, CONTENT_PREVIEW_LENGTH) + '…'
          : s.content
        : '',
    }));
  }

  // Bare headings (no content body available)
  if (extracted.sectionHeadings && extracted.sectionHeadings.length > 0) {
    return extracted.sectionHeadings.map((h) => ({ title: h, preview: '' }));
  }

  return [];
}

function ExpandedSections({ source, showAll, onToggleShowAll }: ExpandedSectionsProps) {
  const items = buildSectionItems(source);
  const hasTextOnly = items.length === 0 && !!source.extractedContent?.text;

  // Text-only fallback (no structured sections)
  if (hasTextOnly) {
    return (
      <div className="border-t border-border bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Content Preview</p>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
          {source.extractedContent!.text!.substring(0, 600)}
        </p>
      </div>
    );
  }

  if (items.length === 0) return null;

  const visibleItems = showAll ? items : items.slice(0, COLLAPSED_SECTION_COUNT);
  const hiddenCount = items.length - COLLAPSED_SECTION_COUNT;

  return (
    <div className="border-t border-border bg-muted/30 px-3 py-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">
          {items.length} section{items.length !== 1 ? 's' : ''}
        </p>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
            onClick={(e) => { e.stopPropagation(); onToggleShowAll(); }}
          >
            {showAll ? 'Show less' : `Show all ${items.length}`}
          </button>
        )}
      </div>

      {/* Section list */}
      <div className="space-y-1">
        {visibleItems.map((item, i) => (
          <div
            key={i}
            className="flex gap-2 py-1 px-1.5 rounded text-xs hover:bg-muted/50 transition-colors"
          >
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-5 text-right pt-px">
              {i + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate leading-snug">{item.title}</p>
              {item.preview && (
                <p className="text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                  {item.preview}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KnowledgeSourceCard({
  source,
  isExpanded,
  onToggleExpand,
  onDelete,
  compact = false,
  recordCount,
  coveragePercent,
  onFilterBySource,
}: KnowledgeSourceCardProps) {
  const [showAllSections, setShowAllSections] = useState(false);

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
            {/* Show section count — prefer sections over sectionHeadings to avoid duplication */}
            {source.extractedContent?.sections && source.extractedContent.sections.length > 0 ? (
              <> &middot; {source.extractedContent.sections.length} sections</>
            ) : source.extractedContent?.sectionHeadings && source.extractedContent.sectionHeadings.length > 0 ? (
              <> &middot; {source.extractedContent.sectionHeadings.length} sections</>
            ) : null}
            {recordCount != null && recordCount > 0 && (
              <>
                {' '}&middot;{' '}
                {onFilterBySource ? (
                  <button
                    type="button"
                    className="text-blue-400 hover:underline"
                    onClick={(e) => { e.stopPropagation(); onFilterBySource(); }}
                  >
                    {recordCount} record{recordCount !== 1 ? 's' : ''}
                  </button>
                ) : (
                  <span>{recordCount} record{recordCount !== 1 ? 's' : ''}</span>
                )}
              </>
            )}
            {coveragePercent != null && (
              <> &middot; {coveragePercent}% covered</>
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
        <ExpandedSections
          source={source}
          showAll={showAllSections}
          onToggleShowAll={() => setShowAllSections((prev) => !prev)}
        />
      )}
    </div>
  );
}
