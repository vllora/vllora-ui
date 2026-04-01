/**
 * KnowledgeSourceViewer
 *
 * Full-content viewer for a single knowledge source. Shows all extracted
 * chunks with headings, page ranges, and searchable full text.
 * Opens when clicking a document in the Explorer documents/ folder.
 *
 * Features:
 * - Search with debounce + yellow highlighting
 * - Expand/collapse chunk sentences
 * - Record count badge per chunk (how many records reference it)
 * - Highlight + scroll-to when navigating from a record's source badge
 */

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { FileText, Search, ChevronRight, ChevronDown, X, Database, ImageIcon, Table2, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounceFn } from "ahooks";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { knowledgeSourceService } from "@/services/service-registry";
import { parseChunkRef } from "@/lib/distri-finetune-tools/steps/shared/chunk-lookup";

// ─── Chunk types (matches metadata.chunks structure from semantic extractor) ───

interface SemanticChunk {
  readonly id: string;
  readonly heading: string;
  readonly summary: string;
  readonly sentences: readonly string[];
  readonly text: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly relevant?: boolean | null;
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

function isImageUrl(content: string): boolean {
  const trimmed = content.trim();
  return /^https?:\/\/.+/i.test(trimmed) || /^data:image\//i.test(trimmed);
}

// ─── Record-context term extraction ───

/** Common English stop words to filter out when extracting significant terms */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "this", "that", "these", "those",
  "it", "its", "i", "you", "he", "she", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "our", "their", "what", "which", "who",
  "when", "where", "how", "not", "no", "if", "then", "than", "so", "as",
  "up", "out", "about", "into", "over", "after", "before", "between",
  "each", "all", "both", "few", "more", "most", "other", "some", "such",
  "only", "same", "also", "just", "because", "too", "very", "here", "there",
  "again", "once", "why", "any", "every", "well", "still", "even",
  "user", "assistant", "please", "help", "question", "answer", "response",
]);

/**
 * Extract significant terms from record text for sentence matching.
 * Returns unique lowercase terms (3+ chars, not stop words), capped at 20.
 */
function extractSignificantTerms(text: string): readonly string[] {
  const words = text.toLowerCase().match(/[a-z]{3,}/g);
  if (!words) return [];
  // Count frequency to prioritize meaningful terms
  const freq = new Map<string, number>();
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  // Sort by frequency descending, take top 20
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term]) => term);
}

/**
 * Check if a sentence matches enough context terms to be considered relevant.
 * Returns true if ≥2 terms match (or ≥1 if only 1-2 terms total).
 */
function sentenceMatchesContext(
  sentence: string,
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return false;
  const lower = sentence.toLowerCase();
  const matchCount = terms.filter(t => lower.includes(t)).length;
  const threshold = terms.length <= 2 ? 1 : 2;
  return matchCount >= threshold;
}

// ─── Page range formatter ───

function formatPages(pageStart: number, pageEnd: number): string {
  if (pageStart === pageEnd) return `p.${pageStart}`;
  return `pp.${pageStart}\u2013${pageEnd}`;
}

// ─── Chunk card (clean, borderless) ───

function ChunkCard({
  chunk,
  searchTerms,
  contextTerms,
  isExpanded,
  isHighlighted,
  recordCount,
  onToggle,
  refSetter,
}: {
  readonly chunk: SemanticChunk;
  readonly searchTerms: readonly string[];
  /** Terms extracted from the navigated record — used for sentence-level highlighting */
  readonly contextTerms: readonly string[];
  readonly isExpanded: boolean;
  readonly isHighlighted: boolean;
  readonly recordCount: number;
  readonly onToggle: () => void;
  readonly refSetter?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={refSetter}
      className={cn(
        "rounded-md transition-shadow",
        isHighlighted && "animate-record-highlight",
      )}
    >
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/20 rounded-md transition-colors"
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
            <span
              className="text-[10px] text-muted-foreground/40 shrink-0"
              title={`${chunk.sentences.length} sentences in this section`}
            >
              {chunk.sentences.length} sentences
            </span>
            {recordCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400/70 shrink-0"
                title={`${recordCount} training record${recordCount === 1 ? '' : 's'} linked to this section`}
              >
                <Database className="w-2.5 h-2.5" />
                {recordCount} {recordCount === 1 ? 'record' : 'records'}
              </span>
            )}
            {chunk.relevant === true && (
              <span className="text-[9px] px-1 py-0.5 rounded font-medium uppercase tracking-wider bg-blue-500/10 text-blue-400 shrink-0">
                Relevant
              </span>
            )}
            {chunk.relevant === false && (
              <span className="text-[9px] px-1 py-0.5 rounded font-medium uppercase tracking-wider bg-orange-500/10 text-orange-400 shrink-0">
                Irrelevant
              </span>
            )}
          </div>
          {!isExpanded && (
            <p className="text-[11px] text-muted-foreground/60 line-clamp-1 mt-0.5 leading-relaxed">
              {highlightTerms(chunk.summary || chunk.sentences[0] || "", searchTerms)}
            </p>
          )}
        </div>
      </button>

      {/* Expanded content — sentences with optional context highlighting */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 ml-5.5">
          <div className="space-y-1 mt-1">
            {chunk.sentences.map((sentence, i) => {
              const isContextMatch = contextTerms.length > 0
                && sentenceMatchesContext(sentence, contextTerms);
              return (
                <p
                  key={i}
                  {...(isContextMatch ? { "data-context-match": "" } : {})}
                  className={cn(
                    "text-[11px] leading-relaxed transition-colors",
                    isContextMatch
                      ? "text-foreground bg-violet-500/15 rounded px-1.5 py-0.5 border-l-2 border-violet-400/50"
                      : "text-foreground/80",
                  )}
                >
                  {highlightTerms(sentence, searchTerms)}
                </p>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Legacy section card (clean, borderless) ───

function LegacySectionCard({
  section,
  searchTerms,
  isExpanded,
  isHighlighted,
  onToggle,
  refSetter,
}: {
  readonly section: LegacySection;
  readonly searchTerms: readonly string[];
  readonly isExpanded: boolean;
  readonly isHighlighted: boolean;
  readonly onToggle: () => void;
  readonly refSetter?: (el: HTMLDivElement | null) => void;
}) {
  const preview = section.content.length > 200
    ? `${section.content.slice(0, 200)}...`
    : section.content;

  return (
    <div
      ref={refSetter}
      className={cn(
        "rounded-md transition-shadow",
        isHighlighted && "animate-record-highlight",
      )}
    >
      <button
        type="button"
        className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/20 rounded-md transition-colors"
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
        <div className="px-3 pb-3 pt-0 ml-5.5">
          <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap mt-1">
            {highlightTerms(section.content, searchTerms)}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Non-text part card (table / image) ───

interface NonTextPartDisplay {
  readonly id: string;
  readonly type: 'table' | 'image';
  readonly title: string;
  readonly content: string;
}

function partTypeIcon(type: 'table' | 'image') {
  if (type === 'table') return <Table2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
  return <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />;
}

function NonTextPartCard({
  part,
  searchTerms,
  isExpanded,
  onToggle,
}: {
  readonly part: NonTextPartDisplay;
  readonly searchTerms: readonly string[];
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  const typeLabel = part.type === 'table' ? 'Table' : 'Image';
  return (
    <div className="rounded-md">
      <button
        type="button"
        className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/20 rounded-md transition-colors"
        onClick={onToggle}
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {partTypeIcon(part.type)}
            <span className="text-xs font-medium text-foreground">
              {highlightTerms(part.title, searchTerms)}
            </span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider",
              part.type === 'table'
                ? "bg-amber-500/10 text-amber-400"
                : "bg-purple-500/10 text-purple-400",
            )}>
              {typeLabel}
            </span>
          </div>
          {!isExpanded && (
            <p className="text-[11px] text-muted-foreground/60 line-clamp-1 mt-0.5 leading-relaxed">
              {highlightTerms(part.content.substring(0, 200), searchTerms)}
            </p>
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 ml-5.5">
          {part.type === 'table' ? (
            <pre className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap mt-1 font-mono bg-muted/30 rounded-md p-2 overflow-x-auto">
              {highlightTerms(part.content, searchTerms)}
            </pre>
          ) : isImageUrl(part.content) ? (
            <img
              src={part.content}
              alt={part.title}
              className="mt-1 max-w-full max-h-80 rounded-md border border-border/30 object-contain"
            />
          ) : (
            <div className="mt-1 flex items-start gap-2 bg-muted/20 rounded-md p-3 border border-border/20">
              <ImageIcon className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap italic">
                {highlightTerms(part.content, searchTerms)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───

interface KnowledgeSourceViewerProps {
  readonly sourceId: string;
  /** Map of raw chunk ref ("sourceId:chunkId") → record count */
  readonly chunkRecordCounts?: ReadonlyMap<string, number>;
}

export function KnowledgeSourceViewer({ sourceId, chunkRecordCounts }: KnowledgeSourceViewerProps) {
  const { sources } = KnowledgeSourcesConsumer();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [highlightedChunkIds, setHighlightedChunkIds] = useState<ReadonlySet<string>>(new Set());
  const [contextTerms, setContextTerms] = useState<readonly string[]>([]);
  const chunkElRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Build semantic chunks from source parts
  const chunks = useMemo((): readonly SemanticChunk[] => {
    if (!source) return [];
    const textParts = source.parts.filter(p => p.type === 'text');
    if (textParts.length === 0) return [];
    return textParts.map((part, i) => ({
      id: part.id,
      heading: part.title || `Section ${i + 1}`,
      summary: part.content?.substring(0, 200) || '',
      sentences: part.content ? part.content.split(/(?<=[.!?])\s+/).filter(Boolean) : [],
      text: part.content || '',
      pageStart: (part.extractionMetadata as Record<string, unknown>)?.pageStart as number || 1,
      pageEnd: (part.extractionMetadata as Record<string, unknown>)?.pageEnd as number || 1,
      relevant: part.relevant,
    }));
  }, [source]);

  // Build non-text parts (table / image)
  const nonTextParts = useMemo((): readonly NonTextPartDisplay[] => {
    if (!source) return [];
    return source.parts
      .filter(p => p.type === 'table' || p.type === 'image')
      .map((part, i) => ({
        id: part.id,
        type: part.type as 'table' | 'image',
        title: part.title || `${part.type.charAt(0).toUpperCase() + part.type.slice(1)} ${i + 1}`,
        content: part.content || '',
      }));
  }, [source]);

  // Legacy sections fallback (not used with new parts-based sources)
  const legacySections = useMemo((): readonly LegacySection[] => {
    return [];
  }, []);

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

  // Filtered non-text parts
  const filteredNonTextParts = useMemo(() => {
    if (searchTerms.length === 0) return nonTextParts;
    return nonTextParts.filter(p => {
      const searchable = `${p.title} ${p.content}`.toLowerCase();
      return searchTerms.every(t => searchable.includes(t));
    });
  }, [nonTextParts, searchTerms]);

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

  // Ref setter for scroll-into-view
  const setChunkRef = useCallback((chunkId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      chunkElRefs.current.set(chunkId, el);
    } else {
      chunkElRefs.current.delete(chunkId);
    }
  }, []);

  // Record count lookup for a chunk
  const getRecordCount = useCallback((chunkId: string): number => {
    if (!chunkRecordCounts) return 0;
    const ref = `${sourceId}:${chunkId}`;
    return chunkRecordCounts.get(ref) ?? 0;
  }, [chunkRecordCounts, sourceId]);

  // ─── Listen for chunk highlight events (from records table navigation) ───

  // Stable set of chunk IDs in this viewer (for fallback matching)
  const localChunkIds = useMemo(
    () => new Set(chunks.map(c => c.id)),
    [chunks],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        sourceId: string;
        chunkRefs: string[];
        recordText?: string;
      }>).detail;

      // Parse refs to get chunk IDs — match by exact sourceId first
      const chunkIds = new Set<string>();
      for (const ref of detail.chunkRefs) {
        const parsed = parseChunkRef(ref);
        if (parsed && parsed.sourceId === sourceId) {
          chunkIds.add(parsed.chunkId);
        }
      }

      // Fallback: if source IDs don't match (stale refs from re-upload),
      // match by chunk ID alone if they exist in this viewer's chunks
      if (chunkIds.size === 0 && localChunkIds.size > 0) {
        for (const ref of detail.chunkRefs) {
          const parsed = parseChunkRef(ref);
          if (parsed && localChunkIds.has(parsed.chunkId)) {
            chunkIds.add(parsed.chunkId);
          }
        }
      }

      if (chunkIds.size === 0) return;

      // Extract context terms for sentence-level highlighting
      const terms = detail.recordText
        ? extractSignificantTerms(detail.recordText)
        : [];
      setContextTerms(terms);

      // Auto-expand + highlight
      setExpandedIds(prev => new Set([...prev, ...chunkIds]));
      setHighlightedChunkIds(chunkIds);

      // Scroll to first highlighted chunk, then to first matching sentence
      const firstId = [...chunkIds][0];
      requestAnimationFrame(() => {
        const el = chunkElRefs.current.get(firstId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        // After expansion renders, scroll to first violet-highlighted sentence
        if (terms.length > 0) {
          setTimeout(() => {
            const sentenceEl = el?.querySelector("[data-context-match]");
            if (sentenceEl) sentenceEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 300);
        }
      });

      // Clear highlight after 6s (enough time to read)
      setTimeout(() => {
        setHighlightedChunkIds(new Set());
        setContextTerms([]);
      }, 6000);
    };

    window.addEventListener("vllora_highlight_chunks", handler);
    return () => window.removeEventListener("vllora_highlight_chunks", handler);
  }, [sourceId, localChunkIds]);

  // ─── Empty / error states ───

  if (!source) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Document not found.
      </div>
    );
  }

  // All backend sources are ready — no processing/failed states

  const totalItems = (chunks.length || legacySections.length) + nonTextParts.length;
  const filteredCount = (chunks.length > 0 ? filteredChunks.length : filteredSections.length) + filteredNonTextParts.length;
  const totalPages = 0; // Page count not available in parts-based sources

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
          <h2 className="text-sm font-medium text-foreground truncate">{source.name}</h2>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide shrink-0">
            {source.parts.length} parts
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
          {/* Preview toggle — show original PDF side-by-side */}
          <button
            type="button"
            className={cn(
              "ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors shrink-0",
              showPreview
                ? "bg-blue-500/20 text-blue-400"
                : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30",
            )}
            onClick={() => setShowPreview(prev => !prev)}
            title="Toggle original document preview"
          >
            <PanelLeft className="w-3 h-3" />
            {showPreview ? "Hide original" : "Show original"}
          </button>
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

      {/* Content area — optionally split with PDF preview */}
      <div className={cn("flex-1 flex overflow-hidden", showPreview ? "flex-row" : "flex-col")}>
        {/* Original document preview */}
        {showPreview && (
          <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
            <iframe
              src={knowledgeSourceService.getFileUrl(source.workflowId, source.id)}
              className="flex-1 w-full bg-white"
              title={`Preview: ${source.name}`}
            />
          </div>
        )}

      <div className={cn("overflow-y-auto px-2 py-1", showPreview ? "w-1/2" : "flex-1")}>
        {totalItems === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            No extracted content available.
          </div>
        )}

        {/* Semantic chunks */}
        {filteredChunks.map((chunk, i) => (
          <div key={chunk.id}>
            {i > 0 && <div className="mx-3 border-b border-border/20" />}
            <ChunkCard
              chunk={chunk}
              searchTerms={searchTerms}
              contextTerms={highlightedChunkIds.has(chunk.id) ? contextTerms : []}
              isExpanded={expandedIds.has(chunk.id)}
              isHighlighted={highlightedChunkIds.has(chunk.id)}
              recordCount={getRecordCount(chunk.id)}
              onToggle={() => toggleExpanded(chunk.id)}
              refSetter={setChunkRef(chunk.id)}
            />
          </div>
        ))}

        {/* Non-text parts (table / image) */}
        {filteredNonTextParts.map((part) => (
          <div key={part.id}>
            {(filteredChunks.length > 0 || filteredNonTextParts.indexOf(part) > 0) && (
              <div className="mx-3 border-b border-border/20" />
            )}
            <NonTextPartCard
              part={part}
              searchTerms={searchTerms}
              isExpanded={expandedIds.has(part.id)}
              onToggle={() => toggleExpanded(part.id)}
            />
          </div>
        ))}

        {/* Legacy sections */}
        {filteredSections.map((section, i) => {
          const sectionId = `section-${i}`;
          return (
            <div key={sectionId}>
              {i > 0 && <div className="mx-3 border-b border-border/20" />}
              <LegacySectionCard
                section={section}
                searchTerms={searchTerms}
                isExpanded={expandedIds.has(sectionId)}
                isHighlighted={highlightedChunkIds.has(sectionId)}
                onToggle={() => toggleExpanded(sectionId)}
                refSetter={setChunkRef(sectionId)}
              />
            </div>
          );
        })}

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
    </div>
  );
}
