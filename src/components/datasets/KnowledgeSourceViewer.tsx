/**
 * KnowledgeSourceViewer
 *
 * Full-content viewer for a single knowledge source. Shows all extracted
 * chunks with headings, page ranges, and searchable full text.
 * Opens when clicking a document in the Explorer documents/ folder.
 */

import { useState, useMemo, useCallback, type ReactNode } from "react";
import { FileText, Search, ChevronRight, ChevronDown, X, Loader2 } from "lucide-react";
import { useDebounceFn } from "ahooks";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";

// ─── Chunk types (matches metadata.chunks structure from semantic extractor) ───

interface SemanticChunk {
  readonly id: string;
  readonly heading: string;
  readonly summary: string;
  readonly sentences: readonly string[];
  readonly text: string;
  readonly pageStart: number;
  readonly pageEnd: number;
}

interface LegacySection {
  readonly title: string;
  readonly content: string;
  readonly level: number;
}

// ─── Search highlighting ───

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightTerms(text: string, terms: readonly string[]): ReactNode {
  if (terms.length === 0) return text;
  const pattern = terms.map(escapeRegex).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-yellow-500/30 text-foreground rounded-sm px-0.5">{part}</mark>
      : part,
  );
}

// ─── Page range formatter ───

function formatPages(pageStart: number, pageEnd: number): string {
  if (pageStart === pageEnd) return `p.${pageStart}`;
  return `pp.${pageStart}–${pageEnd}`;
}

// ─── Chunk card ───

function ChunkCard({
  chunk,
  searchTerms,
  isExpanded,
  onToggle,
}: {
  readonly chunk: SemanticChunk;
  readonly searchTerms: readonly string[];
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-foreground">
              {highlightTerms(chunk.heading, searchTerms)}
            </span>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
              {formatPages(chunk.pageStart, chunk.pageEnd)}
            </span>
            <span className="text-[10px] text-muted-foreground/40 shrink-0">
              {chunk.sentences.length} sentences
            </span>
          </div>
          {!isExpanded && (
            <p className="text-[11px] text-muted-foreground/60 line-clamp-1 mt-0.5 leading-relaxed">
              {highlightTerms(chunk.summary || chunk.sentences[0] || "", searchTerms)}
            </p>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 ml-5.5 border-t border-border/50">
          <div className="space-y-1 mt-2">
            {chunk.sentences.map((sentence, i) => (
              <p key={i} className="text-[11px] text-foreground/80 leading-relaxed">
                {highlightTerms(sentence, searchTerms)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Legacy section card ───

function LegacySectionCard({
  section,
  searchTerms,
  isExpanded,
  onToggle,
}: {
  readonly section: LegacySection;
  readonly searchTerms: readonly string[];
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  const preview = section.content.length > 200
    ? `${section.content.slice(0, 200)}...`
    : section.content;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground">
            {highlightTerms(section.title, searchTerms)}
          </span>
          {!isExpanded && (
            <p className="text-[11px] text-muted-foreground/60 line-clamp-1 mt-0.5">
              {highlightTerms(preview, searchTerms)}
            </p>
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 ml-5.5 border-t border-border/50">
          <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap mt-2">
            {highlightTerms(section.content, searchTerms)}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───

interface KnowledgeSourceViewerProps {
  readonly sourceId: string;
}

export function KnowledgeSourceViewer({ sourceId }: KnowledgeSourceViewerProps) {
  const { sources } = KnowledgeSourcesConsumer();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const { run: updateDebouncedQuery } = useDebounceFn(
    (value: string) => setDebouncedQuery(value),
    { wait: 200 },
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    updateDebouncedQuery(value);
  }, [updateDebouncedQuery]);

  const source = useMemo(
    () => sources.find(s => s.id === sourceId) ?? null,
    [sources, sourceId],
  );

  // Parse semantic chunks from metadata
  const chunks = useMemo((): readonly SemanticChunk[] => {
    const metadata = source?.extractedContent?.metadata as Record<string, unknown> | undefined;
    const method = (metadata?.extractionMethod as string) || "";
    if (method === "local-semantic" && Array.isArray(metadata?.chunks)) {
      return metadata.chunks as SemanticChunk[];
    }
    return [];
  }, [source]);

  // Legacy sections fallback
  const legacySections = useMemo((): readonly LegacySection[] => {
    if (chunks.length > 0) return [];
    return (source?.extractedContent?.sections as LegacySection[] | undefined) ?? [];
  }, [chunks, source]);

  // Search terms
  const searchTerms = useMemo(() => {
    const trimmed = debouncedQuery.trim().toLowerCase();
    if (!trimmed) return [] as string[];
    return trimmed.split(/\s+/).filter(t => t.length > 1);
  }, [debouncedQuery]);

  // Filtered chunks
  const filteredChunks = useMemo(() => {
    if (searchTerms.length === 0) return chunks;
    return chunks.filter(chunk => {
      const searchable = [chunk.heading, chunk.summary, ...chunk.sentences]
        .join(" ").toLowerCase();
      return searchTerms.every(t => searchable.includes(t));
    });
  }, [chunks, searchTerms]);

  // Filtered legacy sections
  const filteredSections = useMemo(() => {
    if (searchTerms.length === 0) return legacySections;
    return legacySections.filter(section => {
      const searchable = `${section.title} ${section.content}`.toLowerCase();
      return searchTerms.every(t => searchable.includes(t));
    });
  }, [legacySections, searchTerms]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ─── Empty / error states ───

  if (!source) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Document not found.
      </div>
    );
  }

  if (source.status === "processing" || source.status === "pending") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Processing document...</span>
      </div>
    );
  }

  if (source.status === "failed") {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
        Extraction failed: {source.error || "unknown error"}
      </div>
    );
  }

  const totalItems = chunks.length || legacySections.length;
  const filteredCount = chunks.length > 0 ? filteredChunks.length : filteredSections.length;
  const metadata = source.extractedContent?.metadata as Record<string, unknown> | undefined;
  const totalPages = (metadata?.totalPages as number) || 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
          <h2 className="text-sm font-medium text-foreground truncate">{source.name}</h2>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide shrink-0">
            {source.type}
          </span>
          {totalItems > 0 && (
            <span className="text-[10px] text-muted-foreground/50 shrink-0">
              {totalItems} {chunks.length > 0 ? "chunks" : "sections"}
            </span>
          )}
          {totalPages > 0 && (
            <span className="text-[10px] text-muted-foreground/50 shrink-0">
              {totalPages} pages
            </span>
          )}
        </div>

        {/* Search bar */}
        {totalItems > 0 && (
          <div className="mt-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search within document..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--theme-500))]"
            />
            {searchInput && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                onClick={() => handleSearchChange("")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {searchTerms.length > 0 && (
        <div className="px-4 py-1.5 text-[10px] text-muted-foreground/60 border-b border-border/50">
          Showing {filteredCount} of {totalItems} {chunks.length > 0 ? "chunks" : "sections"}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {totalItems === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            No extracted content available.
          </div>
        )}

        {/* Semantic chunks */}
        {filteredChunks.map((chunk) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            searchTerms={searchTerms}
            isExpanded={expandedIds.has(chunk.id)}
            onToggle={() => toggleExpanded(chunk.id)}
          />
        ))}

        {/* Legacy sections */}
        {filteredSections.map((section, i) => (
          <LegacySectionCard
            key={`section-${i}`}
            section={section}
            searchTerms={searchTerms}
            isExpanded={expandedIds.has(`section-${i}`)}
            onToggle={() => toggleExpanded(`section-${i}`)}
          />
        ))}

        {/* No results */}
        {searchTerms.length > 0 && filteredCount === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <span className="text-sm">No matches for &ldquo;{debouncedQuery}&rdquo;</span>
            <button
              type="button"
              className="text-xs text-[rgb(var(--theme-500))] hover:underline"
              onClick={() => handleSearchChange("")}
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
