import React from 'react';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';

interface ChildConversationToggleProps {
  isExpanded: boolean;
  messageCount: number;
  onClick: () => void;
}

export const ChildConversationToggle: React.FC<ChildConversationToggleProps> = ({
  isExpanded,
  messageCount,
  onClick,
}) => {
  return (
    <div className="flex items-center gap-3 my-4">
      {/* Left gradient line */}
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/40 to-border/40" />

      {/* Toggle button */}
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/40 hover:bg-muted hover:border-border transition-colors group"
        title={isExpanded ? 'Collapse nested conversation' : 'Expand nested conversation'}
      >
        {/* Expand/Collapse icon */}
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
        )}

        {/* Message icon */}
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />

        {/* Text */}
        <span className="text-[11px] font-mono font-medium text-muted-foreground/90 group-hover:text-foreground tracking-wide transition-colors">
          {isExpanded ? 'Collapse' : 'Expand'}
        </span>

        {/* Count badge */}
        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
          {messageCount}
        </span>
      </button>

      {/* Right gradient line */}
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border/40 to-border/40" />
    </div>
  );
};
