import React, { useMemo } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { useSpanById } from '@/hooks/useSpanById';
import { getOperationIcon, getSpanTitle, getTimelineBgColor, getToolCallMessage } from '@/components/chat/traces/TraceRow/new-timeline/utils';
import { classNames, tryParseFloat, tryParseJson } from '@/utils/modelUtils';
import { Message } from '@/types/chat';
import { AiMessage } from '../messages/AiMessage';

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

  const handleClick = () => {
    if (onToggle) {
      onToggle();
    } else if (onClick) {
      onClick(spanId);
    }
  };

  // Generate title from span data - only recalculates if span changes
  const title = useMemo(() => {
    if (!span) {
      const shortId = spanId.slice(0, 8);
      return `${shortId}`;
    }
    if(span.operation_name === 'run') {
      return `Run ${span.run_id.slice(0, 8)}`
    }

    // Use getSpanTitle to get the proper title based on span attributes
    const spanTitle = getSpanTitle({ span, relatedSpans: [] });
    return spanTitle;
  }, [span, spanId]);

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
    <div className={`flex items-center gap-2  ${level === 0 ? 'mt-4' : ''}`}>
      {/* Separator badge with colored left border - compact design */}
      <button
        onClick={handleClick}
        className={`flex w-full items-center gap-2 px-2.5 py-2 border-l border-border hover:bg-muted/50 transition-colors cursor-pointer group`}
        title={`Click to ${isCollapsed ? 'expand' : 'collapse'}`}
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
        <span className="text-[11px] font-mono font-medium text-muted-foreground/90 group-hover:text-foreground tracking-wide transition-colors">
          {title}
        </span>
        {StatusIcon}
      </button>
    </div>
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


export const ToolStartMessageDisplay = (props: {
  spanId: string;
}) => {
  const { spanId } = props;
  const { flattenSpans } = ChatWindowConsumer();

  const span = useSpanById(flattenSpans, spanId);
  const parentSpan = span?.parent_span_id ? useSpanById(flattenSpans, span?.parent_span_id) : null;

  let parrentAttr = parentSpan?.attribute as any || {};
  let usageStr = parrentAttr?.['usage'] || '';
  let usageJson = tryParseJson(usageStr);
  let costStr = parrentAttr?.['cost'] || '';
  let cost = tryParseFloat(costStr) || 0;
  let requestStr = parrentAttr?.['request'] || '';
  let requestJson = tryParseJson(requestStr);

  let providerName = parentSpan?.operation_name
  let modelName = requestJson?.model || '';
  let metrics = {
    usage: usageJson ,
    cost: cost,
    ttft: parrentAttr?.['ttft'] || undefined,
  }
  const toolCallsJson = useMemo(() => {
    if (!span) return [];
    return getToolCallMessage({
      span,
    })
  }, [span]);
  const displayMessage: Message = {
    id: `tool-${spanId}` || '',
    type: 'assistant',
    timestamp: parentSpan?.finish_time_us || 0,
    content: '',
    tool_calls: toolCallsJson,
    metrics: [metrics],
    model_name: providerName && modelName ? `${providerName}/${modelName}` : '',
    
  }
  return <AiMessage message={displayMessage} />
  // return <>{
  //   toolCallsJson.length > 0 &&  <ToolCallList toolCalls={toolCallsJson} />
  // }</>

}
