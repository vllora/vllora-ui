import React, { useState } from 'react';
import { SpanWithMessages } from '@/utils/span-to-message';
import { MessageItem } from '../MessageItem';
import { RunIdSeparator } from './RunIdSeparator';
import { ChildConversationToggle } from './ChildConversationToggle';

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
  
  const hasChildren = children && children.length > 0 && children.some((child) => child.messages.length > 0);
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

      {/* Child conversation toggle */}
      {hasChildren && (
        <div style={indentStyle}>
          <ChildConversationToggle
            isExpanded={isExpanded}
            messageCount={nestedMessageCount}
            onClick={() => setIsExpanded(!isExpanded)}
          />
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
