/**
 * TraceMessageTimeline
 *
 * Vertical timeline of OTel GenAI messages — system → user → assistant → tool.
 * Used in two places: TraceDetailView (full trace) and the dataset Sources view
 * when rendering an `otel-trace` source. One component, two mounting points.
 *
 * Reads `inputMessages` and `outputMessages` from each span in the trace and
 * renders them in order. Tool calls render as nested cards with collapsible
 * arguments/result JSON.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Wrench, User, Bot, Cog } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  OtelMessage,
  OtelMessagePart,
  OtelSpan,
  OtelTrace,
} from '@/types/otel-trace-types';

interface OtelTraceMessageTimelineProps {
  readonly trace: OtelTrace;
}

interface TimelineEntry {
  readonly key: string;
  readonly span: OtelSpan;
  readonly direction: 'in' | 'out';
  readonly message: OtelMessage;
}

function flatten(trace: OtelTrace): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const ordered = [...trace.spans].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  for (const span of ordered) {
    if (span.systemInstructions) {
      entries.push({
        key: `${span.spanId}-sys`,
        span,
        direction: 'in',
        message: {
          role: 'system',
          parts: [{ type: 'text', content: span.systemInstructions }],
        },
      });
    }
    (span.inputMessages ?? []).forEach((m, i) => {
      entries.push({ key: `${span.spanId}-in-${i}`, span, direction: 'in', message: m });
    });
    (span.outputMessages ?? []).forEach((m, i) => {
      entries.push({ key: `${span.spanId}-out-${i}`, span, direction: 'out', message: m });
    });
  }
  return entries;
}

export function OtelTraceMessageTimeline({ trace }: OtelTraceMessageTimelineProps) {
  const entries = flatten(trace);
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
        This trace doesn&apos;t have content attributes captured. The producer needs to enable
        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">gen_ai.input.messages</code>
        and <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">gen_ai.output.messages</code>
        (these are opt-in in the OTel GenAI spec).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <MessageBubble key={entry.key} entry={entry} />
      ))}
    </div>
  );
}

// ─── Bubble ──────────────────────────────────────────────────────────────────

function roleStyle(role: OtelMessage['role']): {
  icon: React.ReactNode;
  label: string;
  className: string;
} {
  switch (role) {
    case 'system':
      return {
        icon: <Cog className="h-3.5 w-3.5" />,
        label: 'system',
        className: 'border-amber-500/30 bg-amber-500/5',
      };
    case 'user':
      return {
        icon: <User className="h-3.5 w-3.5" />,
        label: 'user',
        className: 'border-sky-500/30 bg-sky-500/5',
      };
    case 'assistant':
      return {
        icon: <Bot className="h-3.5 w-3.5" />,
        label: 'assistant',
        className: 'border-emerald-500/30 bg-emerald-500/5',
      };
    case 'tool':
      return {
        icon: <Wrench className="h-3.5 w-3.5" />,
        label: 'tool',
        className: 'border-violet-500/30 bg-violet-500/5',
      };
  }
}

function MessageBubble({ entry }: { entry: TimelineEntry }) {
  const style = roleStyle(entry.message.role);
  return (
    <div className={cn('rounded-lg border p-4', style.className)}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-medium uppercase tracking-wide">
            {style.icon}
            {style.label}
          </span>
          {entry.span.requestModel && (
            <span className="text-muted-foreground">{entry.span.requestModel}</span>
          )}
          {entry.message.finishReason && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {entry.message.finishReason}
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{entry.span.spanId}</span>
      </div>

      <div className="space-y-2">
        {entry.message.parts.map((part, i) => (
          <PartView key={i} part={part} />
        ))}
      </div>
    </div>
  );
}

// ─── Parts ───────────────────────────────────────────────────────────────────

function PartView({ part }: { part: OtelMessagePart }) {
  if (part.type === 'text') {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
        {part.content}
      </pre>
    );
  }
  if (part.type === 'tool_call') {
    return <ToolCallCard name={part.name} id={part.id} args={part.arguments} />;
  }
  // tool_result
  return (
    <ToolResultCard toolCallId={part.toolCallId} result={part.result} isError={part.isError} />
  );
}

function ToolCallCard({
  name,
  id,
  args,
}: {
  name: string;
  id: string;
  args: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/60 bg-background/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Wrench className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-border/60 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultCard({
  toolCallId,
  result,
  isError,
}: {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        'rounded-md border bg-background/50',
        isError ? 'border-destructive/40' : 'border-border/60',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-medium">{isError ? 'tool error' : 'tool result'}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{toolCallId}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-border/60 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
