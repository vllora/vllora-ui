
import { useMemo } from 'react';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { useSpanById } from '@/hooks/useSpanById';
import { getToolCallMessage } from '@/components/chat/traces/TraceRow/new-timeline/utils';
import { tryParseFloat, tryParseJson } from '@/utils/modelUtils';
import { Message } from '@/types/chat';
import { AiMessage } from '../messages/AiMessage';
import { getColorFromLabel } from '../traces/TraceRow/new-timeline/timeline-row/label-tag';
import { cn } from '@/lib/utils';

export const ToolStartMessageDisplay = (props: {
  spanId: string;
}) => {
  const { spanId } = props;
  const { flattenSpans } = ChatWindowConsumer();

  const span = useSpanById(flattenSpans, spanId);
  const attributes = span?.attribute;
  const labelAttribute = attributes?.['label'];
  const colorLabel = labelAttribute && getColorFromLabel(labelAttribute);
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
    usage: usageJson,
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
    span_id: spanId,
    span: span,
    model_name: providerName && modelName ? `${providerName}/${modelName}` : '',

  }
  return <div className={cn("flex flex-col")}>
    <div className={`flex flex-col space-y-2 pt-3`} style={labelAttribute ?
      {
        borderLeftColor: colorLabel?.background, borderLeftWidth: '1px',
        paddingLeft: '5px'
      } : {}}><AiMessage message={displayMessage} />
    </div></div>
}