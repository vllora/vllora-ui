/**
 * TopicSourceReferences
 *
 * Collapsible section showing knowledge source parts linked to a topic.
 * Renders inside the RecordsPanel slide-in when a topic has sourceChunkRefs.
 */

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileText, ImageIcon, Table2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KnowledgeSourcesConsumer } from '@/contexts/KnowledgeSourcesContext';
import { resolveAndGroupBySource } from '@/lib/distri-finetune-tools/steps/shared/resolve-part-ref';
import { emitter } from '@/utils/eventEmitter';
import type { KnowledgeSourcePart } from '@/types/knowledge-types';

interface TopicSourceReferencesProps {
  readonly sourceChunkRefs: readonly string[];
  readonly workflowId?: string;
}

function partTypeIcon(type: KnowledgeSourcePart['type']) {
  switch (type) {
    case 'table': return <Table2 className="w-3 h-3 text-amber-400" />;
    case 'image': return <ImageIcon className="w-3 h-3 text-purple-400" />;
    default: return <FileText className="w-3 h-3 text-blue-400" />;
  }
}

function partTypeBadge(type: KnowledgeSourcePart['type']) {
  const label = type === 'table' ? 'table' : type === 'image' ? 'image' : 'text';
  const color = type === 'table'
    ? 'bg-amber-500/10 text-amber-400'
    : type === 'image'
      ? 'bg-purple-500/10 text-purple-400'
      : 'bg-blue-500/10 text-blue-400';
  return (
    <span className={cn('text-[9px] px-1 py-0.5 rounded font-medium uppercase tracking-wider', color)}>
      {label}
    </span>
  );
}

function extractPageRange(part: KnowledgeSourcePart): string | null {
  const meta = part.extractionMetadata as Record<string, unknown> | undefined;
  if (!meta) return null;
  const pages = meta.pages as string | number | undefined;
  if (pages !== undefined) return `p.${pages}`;
  const pageStart = meta.pageStart as number | undefined;
  const pageEnd = meta.pageEnd as number | undefined;
  if (pageStart !== undefined && pageEnd !== undefined && pageStart !== pageEnd) {
    return `pp.${pageStart}-${pageEnd}`;
  }
  if (pageStart !== undefined) return `p.${pageStart}`;
  return null;
}

export function TopicSourceReferences({ sourceChunkRefs, workflowId }: TopicSourceReferencesProps) {
  const { sources } = KnowledgeSourcesConsumer();
  const [isOpen, setIsOpen] = useState(false);

  const grouped = useMemo(
    () => resolveAndGroupBySource(sourceChunkRefs, sources),
    [sourceChunkRefs, sources],
  );

  const totalResolved = useMemo(() => {
    let count = 0;
    for (const g of grouped.values()) count += g.parts.length;
    return count;
  }, [grouped]);

  if (totalResolved === 0) return null;

  const navigateToPart = (sourceId: string, partId: string) => {
    if (!workflowId) return;
    emitter.emit('vllora_switch_tab', { workflowId, tab: `knowledge/${sourceId}/${partId}` });
  };

  return (
    <div className="border-b border-border/50">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center gap-2 px-6 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
      >
        {isOpen
          ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        <span className="font-medium">Source References</span>
        <span className="text-[10px] text-muted-foreground/60">({totalResolved})</span>
      </button>

      {isOpen && (
        <div className="px-6 pb-3 space-y-2">
          {[...grouped.values()].map(({ source, parts }) => (
            <div key={source.id}>
              <p className="text-[10px] text-muted-foreground/60 font-medium mb-1 truncate">
                {source.name}
              </p>
              <div className="space-y-0.5">
                {parts.map(part => {
                  const pageRange = extractPageRange(part);
                  return (
                    <button
                      key={part.id}
                      type="button"
                      onClick={() => navigateToPart(source.id, part.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors text-left group"
                    >
                      {partTypeIcon(part.type)}
                      <span className="text-[11px] text-foreground/80 truncate flex-1">
                        {part.title ?? 'Untitled'}
                      </span>
                      {partTypeBadge(part.type)}
                      {pageRange && (
                        <span className="text-[9px] text-muted-foreground/50">{pageRange}</span>
                      )}
                      <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-foreground/60 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
