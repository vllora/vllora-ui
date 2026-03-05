/**
 * MetadataPanel
 *
 * Displays record metadata including assigned topic, available tools, and metadata fields.
 * Used in the expanded detail view of records.
 */

import { useMemo, useState, useEffect } from "react";
import { GitBranch, Coins, MessageSquare, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatasetRecord, DataInfo } from "@/types/dataset-types";
import { ToolDefinitionsViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/tool-definitions-viewer";
import type { ToolInfoCall } from "@/components/chat/traces/TraceRow/span-info/DetailView/spans-display/tool-display";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { getRecordSourceAttributions } from "@/lib/distri-finetune-tools/steps/shared/source-attribution";
import { resolveChunkRefs, type ResolvedChunk } from "@/lib/distri-finetune-tools/steps/shared/chunk-lookup";
import { estimateTokens, countTurns } from "./StatsBadge";
import { countTools } from "./ToolsBadge";

interface MetadataPanelProps {
  record: DatasetRecord;
  topicPath: string[] | null;
}

export function MetadataPanel({ record, topicPath }: MetadataPanelProps) {
  const dataInfo = record.data as DataInfo | undefined;
  const { sources } = KnowledgeSourcesConsumer();

  // Resolve source document attributions
  const sourceAttributions = useMemo(
    () => getRecordSourceAttributions(
      record.metadata?.sourceChunkRefs as string[] | undefined,
      sources,
    ),
    [record.metadata, sources],
  );

  // Convert tools to ToolInfoCall format for ToolDefinitionsViewer
  const toolInfoCalls = useMemo((): ToolInfoCall[] => {
    const rawTools = dataInfo?.input?.tools;
    if (!rawTools || !Array.isArray(rawTools)) return [];

    return rawTools.map((tool: Record<string, unknown>) => ({
      type: (tool.type as string) || "function",
      id: tool.id as string | undefined,
      function: {
        name: (tool.function as Record<string, unknown>)?.name as string || (tool.name as string) || "Unknown",
        description: (tool.function as Record<string, unknown>)?.description as string || (tool.description as string) || "",
        parameters: (tool.function as Record<string, unknown>)?.parameters as Record<string, unknown> || (tool.parameters as Record<string, unknown>) || {},
      },
    }));
  }, [dataInfo?.input?.tools]);

  return (
    <div className="space-y-4">
      {/* Assigned Topic */}
      {topicPath && topicPath.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Assigned Topic
          </h4>
          <div className="text-xs font-medium text-[rgb(var(--theme-500))]">
            {topicPath[topicPath.length - 1]}
          </div>
          {topicPath.length > 1 && (
            <p className="text-xs text-zinc-500 mt-1">
              {topicPath.join(" > ")}
            </p>
          )}
        </div>
      )}

      {/* Available Tools */}
      {toolInfoCalls.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Available Tools
          </h4>
          <ToolDefinitionsViewer
            toolCalls={toolInfoCalls}
            showSection={false}
          />
        </div>
      )}

      {/* Source Record (for variants) */}
      {record.sourceRecordId && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Variant Source
          </h4>
          <div className="flex items-center gap-2 text-xs">
            <GitBranch className="w-3 h-3 text-violet-400" />
            <span className="text-violet-400 font-medium">
              Generated from record
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            {record.sourceRecordId}
          </p>
        </div>
      )}

      {/* Source Documents with expandable chunk details */}
      {sourceAttributions.length > 0 && (
        <SourceDocumentsSection
          record={record}
          sourceAttributions={sourceAttributions}
        />
      )}

      {/* Conversation Stats */}
      <ConversationStats data={record.data} />

      {/* Metadata */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Metadata
        </h4>
        <div className="space-y-0 divide-y divide-border/30">
          {record.evaluation?.score !== undefined && (
            <MetadataRow
              label="Quality Score"
              value={record.evaluation.score.toFixed(2)}
              valueColor="text-[rgb(var(--theme-500))]"
            />
          )}
          {record.is_generated && (
            <MetadataRow
              label="Type"
              value={record.sourceRecordId ? "Variant" : "Generated"}
              valueColor="text-violet-400"
            />
          )}
          <MetadataRow
            label="Created"
            value={new Date(record.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          />
        </div>
      </div>
    </div>
  );
}

interface MetadataRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

function MetadataRow({ label, value, valueColor = "text-foreground" }: MetadataRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={cn("text-xs font-medium", valueColor)}>{value}</span>
    </div>
  );
}

interface SourceDocumentsSectionProps {
  record: DatasetRecord;
  sourceAttributions: Array<{ sourceId: string; sourceName: string; chunkCount: number }>;
}

function SourceDocumentsSection({ record, sourceAttributions }: SourceDocumentsSectionProps) {
  const [showChunks, setShowChunks] = useState(false);
  const [resolvedChunks, setResolvedChunks] = useState<ResolvedChunk[]>([]);

  const chunkRefs = record.metadata?.sourceChunkRefs as string[] | undefined;

  useEffect(() => {
    if (!showChunks || !chunkRefs?.length) return;

    let cancelled = false;
    resolveChunkRefs(record.datasetId, chunkRefs)
      .then((chunks) => { if (!cancelled) setResolvedChunks(chunks); })
      .catch(() => { if (!cancelled) setResolvedChunks([]); });

    return () => { cancelled = true; };
  }, [showChunks, record.datasetId, chunkRefs]);

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Source Documents
      </h4>
      <div className="space-y-1.5">
        {sourceAttributions.map((attr) => (
          <div key={attr.sourceId} className="flex items-center gap-2 text-xs">
            <FileText className="w-3 h-3 text-blue-400 shrink-0" />
            <span className="text-foreground font-medium truncate">{attr.sourceName}</span>
            <span className="text-muted-foreground shrink-0">
              {attr.chunkCount} chunk{attr.chunkCount !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>

      {/* Toggle to show chunk details */}
      {chunkRefs && chunkRefs.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowChunks((prev) => !prev)}
            className="mt-1.5 flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            {showChunks
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />}
            {showChunks ? "Hide chunk details" : `Show ${chunkRefs.length} chunk ref${chunkRefs.length !== 1 ? "s" : ""}`}
          </button>
          {showChunks && resolvedChunks.length > 0 && (
            <div className="mt-2 space-y-1 pl-2 border-l border-border/50">
              {resolvedChunks.map((chunk, i) => (
                <div key={i} className="text-[10px] text-muted-foreground">
                  <span className="text-foreground/80">{chunk.heading || chunk.chunkId}</span>
                  {chunk.pageStart != null && (
                    <span className="ml-1 text-muted-foreground/60">
                      p.{chunk.pageStart}
                      {chunk.pageEnd != null && chunk.pageEnd !== chunk.pageStart ? `–${chunk.pageEnd}` : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ConversationStats({ data }: { data: unknown }) {
  const tokens = estimateTokens(data);
  const turns = countTurns(data);
  const tools = countTools(data);

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Statistics
      </h4>
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Coins className="w-3 h-3" />
          <span className="font-medium text-foreground">{tokens.toLocaleString()}</span> tokens
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="w-3 h-3" />
          <span className="font-medium text-foreground">{turns}</span> turns
        </span>
        {tools > 0 && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="italic font-serif text-[10px]">fx</span>
            <span className="font-medium text-foreground">{tools}</span> tools
          </span>
        )}
      </div>
    </div>
  );
}
