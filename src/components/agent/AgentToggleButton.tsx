/**
 * AgentToggleButton
 *
 * Floating draggable button to toggle the agent panel open/closed.
 * Supports drag-and-drop positioning with edge snapping.
 */

import { Button } from '@/components/ui/button';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Position } from './hooks/useDraggable';

interface AgentToggleButtonProps {
  isOpen: boolean;
  onClick: () => void;
  hasUnread?: boolean;
  className?: string;
  /** Current position for draggable button */
  position?: Position;
  /** Whether the button is being dragged */
  isDragging?: boolean;
  /** Mouse down handler for drag start */
  onMouseDown?: (e: React.MouseEvent) => void;
  /** Touch start handler for drag start */
  onTouchStart?: (e: React.TouchEvent) => void;
}

export function AgentToggleButton({
  isOpen,
  onClick,
  hasUnread = false,
  className,
  position,
  isDragging = false,
  onMouseDown,
  onTouchStart,
}: AgentToggleButtonProps) {
  // Determine positioning style
  const positionStyle = position
    ? {
        left: position.x,
        top: position.y,
        right: 'auto',
        bottom: 'auto',
        transition: isDragging ? 'none' : 'left 200ms ease-out, top 200ms ease-out, transform 150ms, box-shadow 150ms',
      }
    : undefined;

  const handleClick = () => {
    // Only trigger click if not dragging
    if (!isDragging) {
      onClick();
    }
  };

  return (
    <Button
      variant="default"
      size="icon"
      onClick={handleClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={cn(
        'fixed z-50 h-12 w-12 rounded-full shadow-lg',
        // Only use default position if no position prop
        !position && 'bottom-6 right-6',
        // Hover effects (disabled while dragging)
        !isDragging && 'hover:scale-105 active:scale-95',
        // Dragging state
        isDragging && 'scale-110 shadow-2xl cursor-grabbing',
        // Cursor when not dragging
        !isDragging && 'cursor-grab',
        // Open state styling
        isOpen && 'bg-muted text-muted-foreground hover:bg-muted/90',
        className
      )}
      style={positionStyle}
      aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
    >
      {isOpen ? (
        <X className="h-5 w-5" />
      ) : (
        <>
          <MessageCircle className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          )}
        </>
      )}
    </Button>
  );
}

export default AgentToggleButton;
