/**
 * JsonlConversationViewer
 *
 * Kaggle-style data table for skill-package JSONL example files.
 * Each JSON line has { system, user, assistant, base_score, eval_scores, sources }.
 *
 * The system prompt is typically identical across all rows in a topic file,
 * so it's shown once as a collapsible banner above the table. The table then
 * focuses on the per-row data: user question, assistant answer, and score.
 *
 * Role colors match SingleMessageRender: system=amber, user=blue, assistant=emerald.
 */

import { useMemo, useState, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { MarkdownViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer";

// ─── Types ───

interface ParsedRow {
  readonly index: number;
  readonly system: string;
  readonly user: string;
  readonly assistant: string;
  readonly baseScore: number | null;
  readonly evalScores: Readonly<Record<string, number>>;
}

interface JsonlConversationViewerProps {
  /** Raw JSONL string — one JSON object per line */
  readonly content: string;
}

// ─── Score badge color ───

function scoreBadgeClass(score: number): string {
  if (score >= 0.8) return "bg-emerald-500/15 text-emerald-400";
  if (score >= 0.5) return "bg-yellow-500/15 text-yellow-400";
  return "bg-red-500/15 text-red-400";
}

// ─── System prompt banner (shown once above the table) ───

function SystemBanner({ systemPrompt }: { readonly systemPrompt: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!systemPrompt.trim()) return null;

  return (
    <button
      type="button"
      className="w-full text-left rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-3"
      onClick={() => setIsExpanded((prev) => !prev)}
    >
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-amber-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-amber-400 shrink-0" />
        )}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20">
          System
        </span>
        {!isExpanded && (
          <span className="text-xs text-amber-400/50 truncate">
            {systemPrompt}
          </span>
        )}
      </div>
      {isExpanded && (
        <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed mt-2 ml-5">
          {systemPrompt}
        </p>
      )}
    </button>
  );
}

// ─── Expanded detail panel (shown below the row) ───

interface ExpandedDetailProps {
  readonly row: ParsedRow;
  /** Common system prompt shown in the banner — skip if row matches */
  readonly commonSystem: string;
}

function ExpandedDetail({ row, commonSystem }: ExpandedDetailProps) {
  // Only show system in expanded detail if it differs from the common one
  const hasUniqueSystem =
    row.system.trim() !== "" && row.system !== commonSystem;

  return (
    <TableRow className="bg-muted/10 hover:bg-muted/10">
      <TableCell colSpan={4} className="px-6 py-4">
        <div className="space-y-3 max-w-3xl">
          {/* System prompt — only if different from the shared banner */}
          {hasUniqueSystem && (
            <div>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20 mb-1.5">
                System
              </span>
              <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed mt-1">
                {row.system}
              </p>
            </div>
          )}

          {/* User message */}
          <div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-blue-500/10 text-blue-500 border-blue-500/20 mb-1.5">
              User
            </span>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed mt-1">
              {row.user}
            </p>
          </div>

          {/* Assistant response (markdown for code blocks etc.) */}
          <div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-emerald-500/10 text-emerald-500 border-emerald-500/20 mb-1.5">
              Assistant
            </span>
            <div className="text-xs text-foreground/80 leading-relaxed mt-1 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_pre]:text-[11px]">
              <MarkdownViewer message={row.assistant} />
            </div>
          </div>

          {/* Eval scores */}
          {Object.keys(row.evalScores).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground font-medium mr-1">Eval:</span>
              {Object.entries(row.evalScores).map(([key, val]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted/40 text-muted-foreground border border-border/30"
                >
                  {key}: {typeof val === "number" ? val.toFixed(2) : String(val)}
                </span>
              ))}
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Main component ───

export function JsonlConversationViewer({ content }: JsonlConversationViewerProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const rows = useMemo((): readonly ParsedRow[] => {
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const parsed: ParsedRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const obj = JSON.parse(lines[i]) as Record<string, unknown>;
        parsed.push({
          index: i + 1,
          system: typeof obj.system === "string" ? obj.system : "",
          user: typeof obj.user === "string" ? obj.user : "",
          assistant: typeof obj.assistant === "string" ? obj.assistant : "",
          baseScore: typeof obj.base_score === "number" ? obj.base_score : null,
          evalScores:
            obj.eval_scores && typeof obj.eval_scores === "object" && !Array.isArray(obj.eval_scores)
              ? (obj.eval_scores as Record<string, number>)
              : {},
        });
      } catch {
        // Skip malformed lines
      }
    }

    return parsed;
  }, [content]);

  // Extract the common system prompt (first non-empty one)
  const commonSystem = useMemo(() => {
    const first = rows.find((r) => r.system.trim() !== "");
    return first?.system ?? "";
  }, [rows]);

  const toggleRow = useCallback((index: number) => {
    setExpandedRow((prev) => (prev === index ? null : index));
  }, []);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
        No valid examples found in this file.
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Shared system prompt — shown once, collapsible */}
      <SystemBanner systemPrompt={commonSystem} />

      {/* Summary bar */}
      <div className="text-[11px] text-muted-foreground mb-2">
        {rows.length} row{rows.length !== 1 ? "s" : ""} · 4 columns
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-14 text-[11px] font-medium">#</TableHead>
            <TableHead className="text-[11px] font-medium">
              <span className="text-blue-400">user</span>
            </TableHead>
            <TableHead className="text-[11px] font-medium">
              <span className="text-emerald-400">assistant</span>
            </TableHead>
            <TableHead className="w-24 text-[11px] font-medium text-right">
              base_score
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedRow === row.index;
            return (
              <>
                <TableRow
                  key={row.index}
                  className={cn(
                    "cursor-pointer",
                    isExpanded && "bg-muted/20 hover:bg-muted/20 border-b-0",
                  )}
                  onClick={() => toggleRow(row.index)}
                >
                  {/* Row number + chevron */}
                  <TableCell className="w-14 text-[11px] text-muted-foreground font-mono align-top py-2.5">
                    <div className="flex items-center gap-1">
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 shrink-0" />
                      )}
                      {row.index}
                    </div>
                  </TableCell>

                  {/* User message (truncated to 2 lines) */}
                  <TableCell className="align-top py-2.5">
                    <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                      {row.user}
                    </p>
                  </TableCell>

                  {/* Assistant message (truncated to 2 lines) */}
                  <TableCell className="align-top py-2.5">
                    <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
                      {row.assistant}
                    </p>
                  </TableCell>

                  {/* Score */}
                  <TableCell className="w-24 text-right align-top py-2.5">
                    {row.baseScore !== null && (
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium",
                          scoreBadgeClass(row.baseScore),
                        )}
                      >
                        {row.baseScore.toFixed(2)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>

                {/* Expanded detail row */}
                {isExpanded && <ExpandedDetail key={`detail-${row.index}`} row={row} commonSystem={commonSystem} />}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
