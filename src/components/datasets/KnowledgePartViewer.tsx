/**
 * KnowledgePartViewer
 *
 * Renders a single knowledge source part (text, table, or image).
 * Opens when clicking an individual part node in the Explorer tree.
 */

import { useMemo } from "react";
import { Type, Table2, ImageIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
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
  // Try to render markdown-style tables as HTML
  const lines = content.trim().split("\n").filter(Boolean);
  const isMarkdownTable = lines.length >= 2 && lines[0].includes("|");

  if (!isMarkdownTable) {
    return (
      <pre className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 rounded-md p-3 overflow-x-auto">
        {content}
      </pre>
    );
  }

  // Parse markdown table
  const rows = lines
    .filter(line => !line.match(/^\s*\|?\s*[-:]+/)) // skip separator rows
    .map(line =>
      line.split("|").map(cell => cell.trim()).filter(Boolean)
    );

  if (rows.length === 0) {
    return (
      <pre className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 rounded-md p-3">
        {content}
      </pre>
    );
  }

  const [header, ...body] = rows;

  return (
    <div className="overflow-x-auto rounded-md border border-border/30">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/40">
            {header.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-foreground/90 border-b border-border/30">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-foreground/70">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

  const source = useMemo(
    () => sources.find(s => s.id === sourceId) ?? null,
    [sources, sourceId],
  );

  const part = useMemo(
    () => source?.parts.find(p => p.id === partId) ?? null,
    [source, partId],
  );

  if (!source || !part) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Part not found.
      </div>
    );
  }

  const config = partTypeConfig(part.type);

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
        </div>
        {/* Source breadcrumb */}
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground/50">
          <FileText className="w-3 h-3" />
          <span>{source.name}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {part.type === "text" && <TextContent content={part.content} />}
        {part.type === "table" && <TableContent content={part.content} />}
        {part.type === "image" && <ImageContent content={part.content} />}
      </div>
    </div>
  );
}
