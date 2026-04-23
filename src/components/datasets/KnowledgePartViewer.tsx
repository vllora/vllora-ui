/**
 * KnowledgePartViewer
 *
 * Renders a single knowledge source part (text, table, or image).
 * Opens when clicking an individual part node in the Explorer tree.
 */

import { useMemo } from "react";
import { Type, Table2, ImageIcon, FileText, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { buildPartTopicIndex } from "@/lib/distri-finetune-tools/steps/shared/build-part-topic-index";
import type { KnowledgePartType } from "@/types/knowledge-types";

// ─── Type badge + icon helpers ───

function partTypeConfig(type: KnowledgePartType) {
  if (type === "table") return { Icon: Table2, label: "Table", color: "text-amber-400", bg: "bg-amber-500/10" };
  if (type === "image") return { Icon: ImageIcon, label: "Image", color: "text-purple-400", bg: "bg-purple-500/10" };
  return { Icon: Type, label: "Text", color: "text-green-400", bg: "bg-green-500/10" };
}

// ─── Content renderers per type ───

function TextContent({ content }: { readonly content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {content.split(/\n\n+/).map((paragraph, i) => (
        <p key={i} className="text-[12px] text-foreground/85 leading-relaxed mb-3">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function TableContent({ content }: { readonly content: string }) {
  const parsed = useMemo(() => parseTableContent(content), [content]);

  if (!parsed) {
    return (
      <pre className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 rounded-md p-3 overflow-x-auto">
        {content}
      </pre>
    );
  }

  const { header, body, preamble } = parsed;

  return (
    <div>
      {preamble && (
        <p className="text-[12px] text-foreground/85 leading-relaxed mb-3">{preamble}</p>
      )}
      <div className="overflow-x-auto rounded-md border border-border/30">
      <table className="w-full text-[11px]">
        {header.length > 0 && (
          <thead>
            <tr className="bg-muted/40">
              {header.map((cell, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-foreground/90 border-b border-border/30 whitespace-nowrap">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-foreground/70 max-w-[300px] truncate" title={cell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Parse table content from various formats: markdown tables, pipe-separated single-line, CSV-like */
function parseTableContent(content: string): { header: string[]; body: string[][]; preamble?: string } | null {
  const trimmed = content.trim();

  // Try multiline markdown table — find the first line with `|` as table start
  const allLines = trimmed.split("\n");
  const tableStartIdx = allLines.findIndex(line => line.includes("|"));

  if (tableStartIdx >= 0) {
    const tableLines = allLines.slice(tableStartIdx).filter(Boolean);
    if (tableLines.length >= 2) {
      const dataRows = tableLines
        .filter(line => !line.match(/^\s*\|?\s*[-:]+[-|:\s]*$/))
        .map(line => line.split("|").map(cell => cell.trim()).filter(Boolean));

      if (dataRows.length >= 1) {
        const preamble = allLines.slice(0, tableStartIdx).join("\n").trim() || undefined;
        return { header: dataRows[0], body: dataRows.slice(1), preamble };
      }
    }
  }

  // Single-line pipe-separated: split on `||` as row separator, `|` as cell separator
  if (allLines.length <= 2 && trimmed.includes("||")) {
    const rawRows = trimmed.split("||").map(r => r.trim()).filter(Boolean);
    const dataRows = rawRows
      .filter(row => !row.match(/^\s*[-:]+(\s*\|\s*[-:]+)*\s*$/))
      .map(row => row.split("|").map(cell => cell.trim()).filter(Boolean));

    if (dataRows.length >= 1) {
      return { header: dataRows[0], body: dataRows.slice(1) };
    }
  }

  // Single-line with `|` separators but no `||` — try splitting into rows by detecting repeating column count
  if (trimmed.includes("|") && !trimmed.includes("\n")) {
    const allCells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
    // Skip separator-only cells (e.g., "---")
    const cells = allCells.filter(c => !c.match(/^[-:]+$/));

    if (cells.length >= 4) {
      // Try to detect column count from first few cells that look like headers
      // Heuristic: first N short cells are headers, rest repeat in groups of N
      for (const colCount of [3, 4, 5, 6, 7, 8]) {
        if (cells.length > colCount && (cells.length - colCount) % colCount === 0) {
          const header = cells.slice(0, colCount);
          const body: string[][] = [];
          for (let i = colCount; i < cells.length; i += colCount) {
            body.push(cells.slice(i, i + colCount));
          }
          if (body.length >= 1) {
            return { header, body };
          }
        }
      }
    }
  }

  return null;
}

function ImageContent({ content }: { readonly content: string }) {
  // Check if content is a URL/base64 image
  const isUrl = content.startsWith("http") || content.startsWith("data:image");

  if (isUrl) {
    return (
      <div className="flex justify-center p-4">
        <img
          src={content}
          alt="Knowledge source image"
          className="max-w-full max-h-[500px] rounded-md border border-border/30 object-contain"
        />
      </div>
    );
  }

  // Fallback: show as text description
  return (
    <div className="rounded-md border border-purple-500/20 bg-purple-500/5 p-4">
      <p className="text-[12px] text-foreground/70 leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}

// ─── Main component ───

interface KnowledgePartViewerProps {
  readonly sourceId: string;
  readonly partId: string;
}

export function KnowledgePartViewer({ sourceId, partId }: KnowledgePartViewerProps) {
  const { sources } = KnowledgeSourcesConsumer();
  const { dataset } = DatasetDetailConsumer();

  const source = useMemo(
    () => sources.find(s => s.id === sourceId) ?? null,
    [sources, sourceId],
  );

  const part = useMemo(
    () => source?.parts.find(p => p.id === partId) ?? null,
    [source, partId],
  );

  // Build reverse index: which topics reference this part?
  const referencingTopics = useMemo(() => {
    const hierarchy = dataset?.topicHierarchy?.hierarchy;
    if (!hierarchy || !partId) return [];
    const index = buildPartTopicIndex(hierarchy);
    return index.get(partId) ?? [];
  }, [dataset?.topicHierarchy?.hierarchy, partId]);

  if (!source || !part) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Part not found.
      </div>
    );
  }

  const config = partTypeConfig(part.type);

  // Extract metadata for provenance sidebar
  const extractionMeta = part.extractionMetadata as Record<string, unknown> | undefined;
  const pageStart = extractionMeta?.pageStart as number | undefined;
  const pageEnd = extractionMeta?.pageEnd as number | undefined;
  const extractionPath = part.extractionPath;

  // Find sibling parts for navigation context
  const partIndex = source.parts.findIndex(p => p.id === partId);
  const totalParts = source.parts.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <config.Icon className={cn("w-4 h-4 shrink-0", config.color)} />
          <h2 className="text-sm font-medium text-foreground truncate">
            {part.title || `${config.label} part`}
          </h2>
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider",
            config.bg, config.color,
          )}>
            {config.label}
          </span>
          {part.relevant === true && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider bg-blue-500/10 text-blue-400">
              Relevant
            </span>
          )}
          {part.relevant === false && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider bg-orange-500/10 text-orange-400">
              Irrelevant
            </span>
          )}
          {partIndex >= 0 && (
            <span className="text-[10px] text-muted-foreground/40 shrink-0">
              {partIndex + 1} of {totalParts}
            </span>
          )}
        </div>
        {/* Source breadcrumb + extraction context */}
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/50">
          <span className="inline-flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {source.name}
          </span>
          {(pageStart != null) && (
            <span>
              {pageStart === pageEnd || !pageEnd
                ? `p.${pageStart}`
                : `pp.${pageStart}–${pageEnd}`}
            </span>
          )}
          {extractionPath && (
            <span className="truncate max-w-[200px]" title={extractionPath}>
              {extractionPath}
            </span>
          )}
        </div>
      </div>

      {/* Referenced by topics — backlinks */}
      {referencingTopics.length > 0 && (
        <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10 shrink-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Link2 className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
              Referenced by
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {referencingTopics.map((topicName) => (
              <span
                key={topicName}
                className="inline-flex items-center rounded-full bg-[rgba(var(--theme-500),0.1)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--theme-500))]"
              >
                {topicName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {part.type === "text" && <TextContent content={part.content} />}
        {part.type === "table" && <TableContent content={part.content} />}
        {part.type === "image" && <ImageContent content={part.content} />}

        {/* Content metadata footer */}
        {part.contentMetadata && Object.keys(part.contentMetadata).length > 0 && (
          <div className="mt-6 pt-4 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-2">Metadata</p>
            <div className="space-y-1">
              {Object.entries(part.contentMetadata).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 text-[11px]">
                  <span className="text-muted-foreground/50 shrink-0">{key}:</span>
                  <span className="text-foreground/60 break-all">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
