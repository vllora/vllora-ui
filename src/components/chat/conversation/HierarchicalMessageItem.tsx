import React, { useState } from 'react';
import { SpanWithMessages } from '@/utils/span-to-message';
import { MessageItem } from '../MessageItem';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { RunIdSeparator } from './RunIdSeparator';

interface HierarchicalSpanItemProps {
  spanWithMessages: SpanWithMessages;
  showRunIdHeader?: boolean;
  onRunIdClick?: (runId: string) => void;
}

/**
 * Renders a span with its messages and nested child spans in a hierarchical structure
 * Uses indentation to show nesting levels
 */
export const HierarchicalSpanItem: React.FC<HierarchicalSpanItemProps> = ({
  spanWithMessages,
  showRunIdHeader = false,
  onRunIdClick,
}) => {
  const { messages, level, children } = spanWithMessages;
  const hasChildren = children && children.length > 0;
  const [isExpanded, setIsExpanded] = useState(true); // Start expanded by default

  if(messages.length === 0 && !hasChildren) {
    return null;
  }

  // Calculate indentation based on level (16px per level)
  const indentStyle = level > 3 ? { marginLeft: `${level * 16}px` } : {};

  // Count total nested messages
  const countNestedMessages = (spans: SpanWithMessages[]): number => {
    return spans.reduce((total, span) => {
      const current = span.messages.length;
      const childCount = span.children ? countNestedMessages(span.children) : 0;
      return total + current + childCount;
    }, 0);
  };

  const nestedMessageCount = hasChildren ? countNestedMessages(children!) : 0;

  return (
    <div className={`hierarchical-span`}>
      {showRunIdHeader && spanWithMessages.run_id && (
        <RunIdSeparator runId={spanWithMessages.run_id} onClick={onRunIdClick} />
      )}
      {/* Render all messages in this span */}
      {messages.length > 0 && (
        <div style={indentStyle} className="space-y-4">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
        </div>
      )}

      {/* Child conversation indicator badge */}
      {hasChildren && (
        <div style={indentStyle} className="mt-4 mb-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:border-primary/30 transition-all group"
            title={isExpanded ? 'Collapse nested conversation' : 'Expand nested conversation'}
          >
            {/* Expand/Collapse icon */}
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-primary/70 group-hover:text-primary transition-colors" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-primary/70 group-hover:text-primary transition-colors" />
            )}

            {/* Icon */}
            <MessageSquare className="w-3.5 h-3.5 text-primary/70 group-hover:text-primary transition-colors" />

            {/* Text */}
            <span className="text-xs font-medium text-primary/90 group-hover:text-primary transition-colors">
              {isExpanded ? 'Collapse' : 'Expand'} Child Conversation
            </span>

            {/* Count badge */}
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
              {nestedMessageCount} {nestedMessageCount === 1 ? 'message' : 'messages'}
            </span>
          </button>
        </div>
      )}

      {/* Recursively render child spans */}
      {hasChildren && isExpanded && (
        <div className="span-children space-y-4 mt-4">
          {children!.map((childSpan) => (
            <HierarchicalSpanItem
              key={childSpan.span_id}
              spanWithMessages={childSpan}
              showRunIdHeader={showRunIdHeader}
              onRunIdClick={onRunIdClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};
