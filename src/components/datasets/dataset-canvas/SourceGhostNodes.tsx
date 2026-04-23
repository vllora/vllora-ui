/**
 * SourceGhostNodes
 *
 * Floating ghost nodes that appear to the left of a selected/zoomed topic node,
 * showing the knowledge source parts linked to that topic.
 * Max 3 visible + "+N more" overflow link.
 *
 * Rendered as an overlay within the canvas container (not as ReactFlow nodes).
 */

import { useMemo } from "react";
import { FileText, Table2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { KnowledgeSourcesConsumer } from "@/contexts/KnowledgeSourcesContext";
import { resolveAndGroupBySource } from "@/lib/distri-finetune-tools/steps/shared/resolve-part-ref";
import { emitter } from "@/utils/eventEmitter";
import type { KnowledgeSourcePart } from "@/types/knowledge-types";

const MAX_VISIBLE_GHOSTS = 3;

interface SourceGhostNodesProps {
  /** Source chunk ref strings from the topic node */
  readonly sourceChunkRefs: readonly string[];
  /** Workflow ID for navigation */
  readonly workflowId?: string;
}

interface ResolvedGhost {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly part: KnowledgeSourcePart;
}

function partIcon(type: string) {
  if (type === "table") return <Table2 className="w-3 h-3 text-amber-400" />;
  if (type === "image") return <ImageIcon className="w-3 h-3 text-purple-400" />;
  return <FileText className="w-3 h-3 text-blue-400" />;
}

export function SourceGhostNodes({ sourceChunkRefs, workflowId }: SourceGhostNodesProps) {
  const { sources } = KnowledgeSourcesConsumer();

  const ghosts = useMemo((): readonly ResolvedGhost[] => {
    const grouped = resolveAndGroupBySource(sourceChunkRefs, sources);
    const result: ResolvedGhost[] = [];
    for (const { source, parts } of grouped.values()) {
      for (const part of parts) {
        result.push({ sourceId: source.id, sourceName: source.name, part });
      }
    }
    return result;
  }, [sourceChunkRefs, sources]);

  if (ghosts.length === 0) return null;

  const visible = ghosts.slice(0, MAX_VISIBLE_GHOSTS);
  const overflow = ghosts.length - MAX_VISIBLE_GHOSTS;

  const navigateToPart = (sourceId: string, partId: string) => {
    if (!workflowId) return;
    emitter.emit("vllora_switch_tab", { workflowId, tab: `knowledge/${sourceId}/${partId}` });
  };

  return (
    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
      {visible.map((ghost, i) => (
        <button
          key={ghost.part.id}
          type="button"
          onClick={() => navigateToPart(ghost.sourceId, ghost.part.id)}
          className={cn(
            "flex items-start gap-2 px-3 py-2 rounded-lg",
            "border border-dashed border-[rgba(var(--theme-500),0.3)]",
            "bg-background/80 backdrop-blur-sm",
            "hover:border-[rgba(var(--theme-500),0.5)] hover:bg-muted/30",
            "transition-all cursor-pointer",
            "max-w-[200px] text-left",
          )}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          {partIcon(ghost.part.type)}
          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-foreground/80 truncate block">
              {ghost.part.title ?? "Untitled"}
            </span>
            <span className="text-[9px] text-muted-foreground/50 truncate block">
              {ghost.sourceName}
            </span>
          </div>
        </button>
      ))}

      {overflow > 0 && (
        <button
          type="button"
          onClick={() => {
            if (!workflowId) return;
            emitter.emit("vllora_switch_tab", { workflowId, tab: "knowledge" });
          }}
          className="text-[10px] text-[rgb(var(--theme-500))] hover:text-foreground transition-colors px-3 py-1 text-left"
        >
          +{overflow} more source{overflow !== 1 ? "s" : ""}...
        </button>
      )}
    </div>
  );
}
