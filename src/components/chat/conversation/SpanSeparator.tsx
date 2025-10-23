import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Copy, Check } from 'lucide-react';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { useSpanById } from '@/hooks/useSpanById';
import { getOperationIcon, getSpanTitle, getTimelineBgColor } from '@/components/chat/traces/TraceRow/new-timeline/utils';
import { classNames } from '@/utils/modelUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SpanSeparatorProps {
  spanId: string;
  onClick?: (spanId: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  level?: number;
  icon?: React.ReactNode;
}

/**
 * Unified visual separator component for Task, Run, and Agent spans
 * Shows span ID with status from actual span data
 * Only re-renders when the specific span's data changes
 */
const SpanSeparatorComponent: React.FC<SpanSeparatorProps> = ({
  spanId,
  onClick,
  isCollapsed = false,
  onToggle,
  level = 0,
}) => {
  // Get span data from context - component will re-render on context changes
  const { flattenSpans } = ChatWindowConsumer();
  // But useSpanById returns same reference if THIS span's data didn't change
  const span = useSpanById(flattenSpans, spanId);
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    if (onToggle) {
      onToggle();
    } else if (onClick) {
      onClick(spanId);
    }
  };

  // Determine if this is a run and what ID to copy
  const { isRun, idToCopy, displayId } = useMemo(() => {
    const isRunSpan = span?.operation_name === 'run';
    const id = isRunSpan && span?.run_id ? span.run_id : spanId;
    return {
      isRun: isRunSpan,
      idToCopy: id,
      displayId: `${id.slice(0, 8)}...`
    };
  }, [span, spanId]);

  // Generate title from span data - only recalculates if span changes
  const title = useMemo(() => {
    if (!span) {
      return spanId.slice(0, 8);
    }
    if(span.operation_name === 'run') {
      return `Run`;
    }

    // Use getSpanTitle to get the proper title based on span attributes
    const spanTitle = getSpanTitle({ span, relatedSpans: [] });
    return spanTitle;
  }, [span, spanId]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(idToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const iconColor: string = useMemo(() => {
    if (!span) return '';
    return getTimelineBgColor({
      span,
      relatedSpans: []
    });
  }, [span]);

  const iconComponent = useMemo(() => {
    if (!span) return null;
    const icon = getOperationIcon({
      span,
      relatedSpans: []
    });
    return icon;
  }, [span]);

  // Status icon - animated loader for in-progress, check for completed
  const StatusIcon = useMemo(() => {
    if (!span) return null;

    if (span.isInProgress) {
      return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
    }

    return <></>;
  }, [span]);

  // Consistent left-aligned design for all levels - no indentation
  // Level is only used for vertical spacing adjustment
  return (
    <TooltipProvider>
      <div className={`flex items-center gap-2  ${level === 0 ? 'mt-4' : ''}`}>
        {/* Separator badge with colored left border - compact design */}
        <button
          onClick={handleClick}
          className={`flex w-full items-center gap-2 px-2.5 py-2 ${isCollapsed ? 'border-l-2 border-border' : 'border-l border-border'} hover:bg-muted/50 transition-colors cursor-pointer group `}
        >
          {onToggle && (
            isCollapsed ? (
              <ChevronRight className="w-3 h-3 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
            )
          )}
          <div className={classNames("p-0.5 rounded-full ", `text-[${iconColor}]`)}>
            {iconComponent}
          </div>
          <span className="text-[12px] font-medium text-muted-foreground/90 group-hover:text-foreground transition-colors">
            {title}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded hover:bg-muted/80 hover:text-muted-foreground transition-colors"
              >
                <span>{displayId}</span>
                {copied ? (
                  <Check className="w-2.5 h-2.5 text-green-500" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{copied ? 'Copied!' : `Copy full ${isRun ? 'run_id' : 'span_id'}`}</p>
            </TooltipContent>
          </Tooltip>
          {StatusIcon}
        </button>
      </div>
    </TooltipProvider>
  );
};

// Memoize with custom comparison
// Only re-render if spanId, isCollapsed, or level changes
// Note: Component will still re-render on context changes, but useMemo for title
// prevents recalculation if the span data didn't change
export const SpanSeparator = React.memo(
  SpanSeparatorComponent,
  (prevProps, nextProps) => {
    if (prevProps.spanId !== nextProps.spanId) return false;
    if (prevProps.isCollapsed !== nextProps.isCollapsed) return false;
    if (prevProps.level !== nextProps.level) return false;
    return true; // Don't re-render
  }
);


