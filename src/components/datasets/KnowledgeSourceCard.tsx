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
import { FileText, Activity, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KnowledgeSource } from "@/types/knowledge-types";

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

// ---------------------------------------------------------------------------
// Expanded sections panel — unified numbered list with content previews
// ---------------------------------------------------------------------------

interface ExpandedSectionsProps {
  source: KnowledgeSource;
  showAll: boolean;
  onToggleShowAll: () => void;
}

/**
 * Build a unified section list from source parts.
 */
function buildSectionItems(source: KnowledgeSource): Array<{ title: string; preview: string }> {
  const textParts = source.parts.filter(p => p.type === 'text');
  if (textParts.length === 0) return [];

  return textParts.map((p) => ({
    title: p.title || 'Untitled',
    preview: p.content
      ? p.content.length > CONTENT_PREVIEW_LENGTH
        ? p.content.slice(0, CONTENT_PREVIEW_LENGTH) + '\u2026'
        : p.content
      : '',
  }));
}

function ExpandedSections({ source, showAll, onToggleShowAll }: ExpandedSectionsProps) {
  const items = buildSectionItems(source);

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

  const textPartCount = source.parts.filter(p => p.type === 'text').length;
  const hasContent = source.parts.length > 0;

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

        {/* Source-kind icon — purple for OTel traces, red-orange for PDFs */}
        {source.traceBundleId ? (
          <Activity className="w-5 h-5 shrink-0 text-purple-400" />
        ) : (
          <FileText className="w-5 h-5 shrink-0 text-rose-400/80" />
        )}

        {/* Name and part count */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-2">
            {source.name}
            {source.traceBundleId && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-semibold">
                OTel
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {source.parts.length} part{source.parts.length !== 1 ? 's' : ''}
            {textPartCount > 0 && (
              <> &middot; {textPartCount} section{textPartCount !== 1 ? 's' : ''}</>
            )}
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

        {/* Ready badge (all backend sources are ready) */}
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full uppercase bg-green-500/20 text-green-500">
          ready
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
