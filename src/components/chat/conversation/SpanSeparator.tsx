import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Copy, Check, AlertTriangleIcon, PlayIcon } from 'lucide-react';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { useSpanById } from '@/hooks/useSpanById';
import { getLabelOfSpan, getOperationIcon, getSpanTitle, getTimelineBgColor } from '@/components/chat/traces/TraceRow/new-timeline/utils';
import { classNames } from '@/utils/modelUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LabelTag } from '../traces/TraceRow/new-timeline/timeline-row/label-tag';

interface SpanSeparatorProps {
  spanId?: string;
  runId: string;
  onClick?: (spanId: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  level?: number;
  icon?: React.ReactNode;
  errors?: string[];
  onHover?: (input: { spanId: string, runId: string, isHovering: boolean }) => void;
}

/**
 * Unified visual separator component for Task, Run, and Agent spans
 * Shows span ID with status from actual span data
 * Only re-renders when the specific span's data changes
 */
const SpanSeparatorComponent: React.FC<SpanSeparatorProps> = ({
  spanId,
  runId,
  onClick,
  isCollapsed = false,
  onToggle,
  onHover,
  errors
}) => {
  // Get span data from context - component will re-render on context changes
  const { flattenSpans } = ChatWindowConsumer();
  // But useSpanById returns same reference if THIS span's data didn't change
  const span = spanId ? useSpanById(flattenSpans, spanId) : null;
  const labelOfSpan = span && getLabelOfSpan({ span });
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else if (onClick) {
      spanId && onClick(spanId);
    }
  }, [onToggle, onClick, spanId, runId]);

  const handleMouseEnter = useCallback(() => {
    if (!spanId) return;
    if (onHover) {
      onHover({ spanId, runId, isHovering: true });
    }
  }, [spanId, runId, onHover]);

  const handleMouseLeave = useCallback(() => {
    if (!spanId) return;
    if (onHover) {
      onHover({ spanId, runId, isHovering: false });
    }
  }, [spanId, runId, onHover]);

  // Determine if this is a run and what ID to copy
  const { idToCopy, displayId } = useMemo(() => {
    const idToCopy = spanId || runId;
    return {
      idToCopy,
      displayId: `${idToCopy.slice(0, 8)}...`
    };
  }, [runId, spanId]);

  // Generate title from span data - only recalculates if span changes
  const title = useMemo(() => {
    if (!span) {
      return 'Run';
    }

    // Use getSpanTitle to get the proper title based on span attributes
    const spanTitle = getSpanTitle({ span, relatedSpans: [] });
    return spanTitle;
  }, [span, spanId]);

  const handleCopy = async () => {
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
    if (!span && runId) {
      return <PlayIcon className="w-3 h-3 text-[#3b82f6]" />;
    }
    if (!span) return null;
    const icon = getOperationIcon({
      span,
      relatedSpans: []
    });
    return icon;
  }, [span, runId]);

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
      <div className={`flex items-center gap-2`}>
        {/* Separator badge with colored left border - compact design */}
        <button
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCopy();
                  }
                }}
                className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded hover:bg-muted/80 hover:text-muted-foreground transition-colors cursor-pointer"
              >
                <span>{displayId}</span>
                {copied ? (
                  <Check className="w-2.5 h-2.5 text-green-500" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{copied ? 'Copied!' : `Copy full ${!spanId ? 'run_id' : 'span_id'}`}</p>
            </TooltipContent>
          </Tooltip>
          {StatusIcon}

          {errors && errors?.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <AlertTriangleIcon className="w-3 h-3 text-amber-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="max-w-xs">
                  <p className="font-semibold mb-1">Errors:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, index) => (
                      <li key={index} className="text-xs">{error}</li>
                    ))}
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {labelOfSpan && (
            <LabelTag label={labelOfSpan} />
          )}
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
    if (prevProps.runId !== nextProps.runId) return false;
    if (prevProps.isCollapsed !== nextProps.isCollapsed) return false;
    if (prevProps.level !== nextProps.level) return false;
    if (prevProps.errors !== nextProps.errors) return false;
    return true; // Don't re-render
  }
);


