/**
 * useDraggable Hook
 *
 * Provides smooth drag-and-drop functionality for elements with:
 * - Optional edge snapping (snaps to left or right edge on release)
 * - Boundary constraints (stays within viewport)
 * - Position persistence (localStorage)
 * - Touch support (works with mouse and touch events)
 * - Immediate drag response (no threshold delay)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface Position {
  x: number;
  y: number;
}

export interface UseDraggableOptions {
  /** localStorage key for position persistence */
  storageKey?: string;
  /** Initial position if not found in storage */
  defaultPosition: Position;
  /** Snap to left/right edge on release (default: false for smoother feel) */
  snapToEdge?: boolean;
  /** Padding from viewport edges in pixels (default: 16) */
  edgePadding?: number;
  /** Min pixels of movement before drag starts (default: 0 for immediate response) */
  dragThreshold?: number;
  /** Element dimensions for boundary calculations */
  elementSize?: { width: number; height: number };
}

export interface UseDraggableReturn {
  /** Current position */
  position: Position;
  /** True while actively dragging */
  isDragging: boolean;
  /** True if a drag just completed (use to prevent click after drag) */
  wasDragged: boolean;
  /** True if the button is on the left side of the screen */
  isOnLeftSide: boolean;
  /** Event handlers to attach to the draggable element */
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
}

export function useDraggable(options: UseDraggableOptions): UseDraggableReturn {
  const {
    storageKey,
    defaultPosition,
    snapToEdge = false,
    edgePadding = 16,
    dragThreshold = 0,
    elementSize = { width: 48, height: 48 },
  } = options;

  // Load initial position from storage or use default
  const getInitialPosition = useCallback((): Position => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Validate stored position is within current viewport
          const maxX = window.innerWidth - elementSize.width - edgePadding;
          const maxY = window.innerHeight - elementSize.height - edgePadding;
          return {
            x: Math.min(Math.max(edgePadding, parsed.x), maxX),
            y: Math.min(Math.max(edgePadding, parsed.y), maxY),
          };
        }
      } catch {
        // Ignore storage errors
      }
    }
    return defaultPosition;
  }, [storageKey, defaultPosition, edgePadding, elementSize]);

  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [wasDragged, setWasDragged] = useState(false);

  // Refs for tracking drag state
  const dragStartPos = useRef<Position | null>(null);
  const dragStartMouse = useRef<Position | null>(null);
  const hasMoved = useRef(false);

  // Calculate if button is on left side
  const isOnLeftSide = position.x < window.innerWidth / 2;

  // Save position to storage
  const savePosition = useCallback(
    (pos: Position) => {
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(pos));
        } catch {
          // Ignore storage errors
        }
      }
    },
    [storageKey]
  );

  // Snap to nearest edge
  const snapToNearestEdge = useCallback(
    (pos: Position): Position => {
      if (!snapToEdge) return pos;

      const midPoint = window.innerWidth / 2;
      const maxX = window.innerWidth - elementSize.width - edgePadding;

      return {
        x: pos.x < midPoint ? edgePadding : maxX,
        y: pos.y,
      };
    },
    [snapToEdge, edgePadding, elementSize]
  );

  // Constrain position within viewport
  const constrainPosition = useCallback(
    (pos: Position): Position => {
      const maxX = window.innerWidth - elementSize.width - edgePadding;
      const maxY = window.innerHeight - elementSize.height - edgePadding;

      return {
        x: Math.min(Math.max(edgePadding, pos.x), maxX),
        y: Math.min(Math.max(edgePadding, pos.y), maxY),
      };
    },
    [edgePadding, elementSize]
  );

  // Handle drag move
  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragStartPos.current || !dragStartMouse.current) return;

      const deltaX = clientX - dragStartMouse.current.x;
      const deltaY = clientY - dragStartMouse.current.y;

      // Check if we've passed the drag threshold (0 = immediate)
      if (!hasMoved.current) {
        if (dragThreshold > 0) {
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          if (distance < dragThreshold) return;
        }
        hasMoved.current = true;
        setIsDragging(true);
      }

      const newPos = constrainPosition({
        x: dragStartPos.current.x + deltaX,
        y: dragStartPos.current.y + deltaY,
      });

      setPosition(newPos);
    },
    [constrainPosition, dragThreshold]
  );

  // Handle drag end
  const handleEnd = useCallback(() => {
    if (hasMoved.current) {
      // Use functional update to ensure we have the latest position
      setPosition((currentPos) => {
        const snappedPos = snapToNearestEdge(currentPos);
        savePosition(snappedPos);
        return snappedPos;
      });
      // Mark that a drag just completed (to prevent click)
      setWasDragged(true);
    }

    setIsDragging(false);
    dragStartPos.current = null;
    dragStartMouse.current = null;
    hasMoved.current = false;
  }, [snapToNearestEdge, savePosition]);

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartPos.current) {
        e.preventDefault();
        handleMove(e.clientX, e.clientY);
      }
    };

    const handleMouseUp = () => {
      if (dragStartPos.current) {
        handleEnd();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMove, handleEnd]);

  // Touch event handlers
  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (dragStartPos.current && e.touches.length === 1) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleTouchEnd = () => {
      if (dragStartPos.current) {
        handleEnd();
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleMove, handleEnd]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const constrained = constrainPosition(prev);
        const snapped = snapToNearestEdge(constrained);
        savePosition(snapped);
        return snapped;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [constrainPosition, snapToNearestEdge, savePosition]);

  // Event handlers for the draggable element
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left mouse button
      if (e.button !== 0) return;

      e.preventDefault();
      // Reset wasDragged on new interaction
      setWasDragged(false);
      dragStartPos.current = position;
      dragStartMouse.current = { x: e.clientX, y: e.clientY };
      hasMoved.current = false;
    },
    [position]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;

      // Reset wasDragged on new interaction
      setWasDragged(false);
      dragStartPos.current = position;
      dragStartMouse.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      hasMoved.current = false;
    },
    [position]
  );

  return {
    position,
    isDragging,
    wasDragged,
    isOnLeftSide,
    handlers: {
      onMouseDown,
      onTouchStart,
    },
  };
}

export default useDraggable;
