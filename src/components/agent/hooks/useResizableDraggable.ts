/**
 * useResizableDraggable Hook
 *
 * Provides drag-and-drop + resize functionality for floating panels:
 * - Drag by header area
 * - Resize from edges and corners
 * - Boundary constraints (stays within viewport)
 * - Position/size persistence (localStorage)
 * - Touch support
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PanelBounds {
  position: Position;
  size: Size;
}

export type ResizeDirection =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw';

export interface UseResizableDraggableOptions {
  /** localStorage key for persistence */
  storageKey?: string;
  /** Default bounds if not found in storage */
  defaultBounds: PanelBounds;
  /** Minimum size constraints */
  minSize?: Size;
  /** Maximum size constraints */
  maxSize?: Size;
  /** Padding from viewport edges in pixels (default: 16) */
  edgePadding?: number;
  /** Size of resize handle area in pixels (default: 8) */
  resizeHandleSize?: number;
}

export interface UseResizableDraggableReturn {
  /** Current bounds (position + size) */
  bounds: PanelBounds;
  /** True while actively dragging */
  isDragging: boolean;
  /** True while actively resizing */
  isResizing: boolean;
  /** Current resize direction (if resizing) */
  resizeDirection: ResizeDirection | null;
  /** Event handlers for the drag handle (header) */
  dragHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
  /** Get handlers for a specific resize edge/corner */
  getResizeHandlers: (direction: ResizeDirection) => {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
  /** Reset to default bounds */
  resetBounds: () => void;
}

const DEFAULT_MIN_SIZE: Size = { width: 320, height: 400 };
const DEFAULT_MAX_SIZE: Size = { width: 800, height: 900 };

export function useResizableDraggable(
  options: UseResizableDraggableOptions
): UseResizableDraggableReturn {
  const {
    storageKey,
    defaultBounds,
    minSize = DEFAULT_MIN_SIZE,
    maxSize = DEFAULT_MAX_SIZE,
    edgePadding = 16,
  } = options;

  // Load initial bounds from storage or use default
  const getInitialBounds = useCallback((): PanelBounds => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as PanelBounds;
          // Validate stored bounds are within current viewport
          return constrainBoundsToViewport(parsed);
        }
      } catch {
        // Ignore storage errors
      }
    }
    return constrainBoundsToViewport(defaultBounds);
  }, [storageKey, defaultBounds]);

  // Constrain bounds within viewport
  const constrainBoundsToViewport = useCallback(
    (b: PanelBounds): PanelBounds => {
      if (typeof window === 'undefined') return b;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Constrain size
      const width = Math.min(
        Math.max(b.size.width, minSize.width),
        Math.min(maxSize.width, viewportWidth - edgePadding * 2)
      );
      const height = Math.min(
        Math.max(b.size.height, minSize.height),
        Math.min(maxSize.height, viewportHeight - edgePadding * 2)
      );

      // Constrain position
      const maxX = viewportWidth - width - edgePadding;
      const maxY = viewportHeight - height - edgePadding;
      const x = Math.min(Math.max(edgePadding, b.position.x), maxX);
      const y = Math.min(Math.max(edgePadding, b.position.y), maxY);

      return {
        position: { x, y },
        size: { width, height },
      };
    },
    [minSize, maxSize, edgePadding]
  );

  const [bounds, setBounds] = useState<PanelBounds>(getInitialBounds);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] =
    useState<ResizeDirection | null>(null);

  // Refs for tracking drag/resize state
  const dragStartBounds = useRef<PanelBounds | null>(null);
  const dragStartMouse = useRef<Position | null>(null);
  const activeResizeDirection = useRef<ResizeDirection | null>(null);

  // Save bounds to storage
  const saveBounds = useCallback(
    (b: PanelBounds) => {
      if (storageKey && typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(b));
        } catch {
          // Ignore storage errors
        }
      }
    },
    [storageKey]
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragStartBounds.current || !dragStartMouse.current) return;

      const deltaX = clientX - dragStartMouse.current.x;
      const deltaY = clientY - dragStartMouse.current.y;

      const newBounds = constrainBoundsToViewport({
        position: {
          x: dragStartBounds.current.position.x + deltaX,
          y: dragStartBounds.current.position.y + deltaY,
        },
        size: dragStartBounds.current.size,
      });

      setBounds(newBounds);
    },
    [constrainBoundsToViewport]
  );

  // Handle resize move
  const handleResizeMove = useCallback(
    (clientX: number, clientY: number) => {
      if (
        !dragStartBounds.current ||
        !dragStartMouse.current ||
        !activeResizeDirection.current
      )
        return;

      const deltaX = clientX - dragStartMouse.current.x;
      const deltaY = clientY - dragStartMouse.current.y;
      const dir = activeResizeDirection.current;
      const startBounds = dragStartBounds.current;

      let newX = startBounds.position.x;
      let newY = startBounds.position.y;
      let newWidth = startBounds.size.width;
      let newHeight = startBounds.size.height;

      // Handle horizontal resizing
      if (dir.includes('e')) {
        newWidth = startBounds.size.width + deltaX;
      } else if (dir.includes('w')) {
        newWidth = startBounds.size.width - deltaX;
        newX = startBounds.position.x + deltaX;
      }

      // Handle vertical resizing
      if (dir.includes('s')) {
        newHeight = startBounds.size.height + deltaY;
      } else if (dir.includes('n')) {
        newHeight = startBounds.size.height - deltaY;
        newY = startBounds.position.y + deltaY;
      }

      // Apply min/max constraints
      if (newWidth < minSize.width) {
        if (dir.includes('w')) {
          newX = startBounds.position.x + startBounds.size.width - minSize.width;
        }
        newWidth = minSize.width;
      }
      if (newWidth > maxSize.width) {
        newWidth = maxSize.width;
      }
      if (newHeight < minSize.height) {
        if (dir.includes('n')) {
          newY =
            startBounds.position.y + startBounds.size.height - minSize.height;
        }
        newHeight = minSize.height;
      }
      if (newHeight > maxSize.height) {
        newHeight = maxSize.height;
      }

      const newBounds = constrainBoundsToViewport({
        position: { x: newX, y: newY },
        size: { width: newWidth, height: newHeight },
      });

      setBounds(newBounds);
    },
    [constrainBoundsToViewport, minSize, maxSize]
  );

  // Handle drag/resize end
  const handleEnd = useCallback(() => {
    if (isDragging || isResizing) {
      saveBounds(bounds);
    }

    setIsDragging(false);
    setIsResizing(false);
    setResizeDirection(null);
    dragStartBounds.current = null;
    dragStartMouse.current = null;
    activeResizeDirection.current = null;
  }, [isDragging, isResizing, bounds, saveBounds]);

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        handleDragMove(e.clientX, e.clientY);
      } else if (isResizing) {
        e.preventDefault();
        handleResizeMove(e.clientX, e.clientY);
      }
    };

    const handleMouseUp = () => {
      if (isDragging || isResizing) {
        handleEnd();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, handleDragMove, handleResizeMove, handleEnd]);

  // Touch event handlers
  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if ((isDragging || isResizing) && e.touches.length === 1) {
        e.preventDefault();
        if (isDragging) {
          handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        } else {
          handleResizeMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }
    };

    const handleTouchEnd = () => {
      if (isDragging || isResizing) {
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
  }, [isDragging, isResizing, handleDragMove, handleResizeMove, handleEnd]);

  // Handle window resize
  useEffect(() => {
    const handleWindowResize = () => {
      setBounds((prev) => {
        const constrained = constrainBoundsToViewport(prev);
        saveBounds(constrained);
        return constrained;
      });
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [constrainBoundsToViewport, saveBounds]);

  // Drag handlers for header
  const onDragMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      dragStartBounds.current = bounds;
      dragStartMouse.current = { x: e.clientX, y: e.clientY };
      setIsDragging(true);
    },
    [bounds]
  );

  const onDragTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.stopPropagation();

      dragStartBounds.current = bounds;
      dragStartMouse.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      setIsDragging(true);
    },
    [bounds]
  );

  // Resize handlers factory
  const getResizeHandlers = useCallback(
    (direction: ResizeDirection) => ({
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        dragStartBounds.current = bounds;
        dragStartMouse.current = { x: e.clientX, y: e.clientY };
        activeResizeDirection.current = direction;
        setIsResizing(true);
        setResizeDirection(direction);
      },
      onTouchStart: (e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();

        dragStartBounds.current = bounds;
        dragStartMouse.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        activeResizeDirection.current = direction;
        setIsResizing(true);
        setResizeDirection(direction);
      },
    }),
    [bounds]
  );

  // Reset to default bounds
  const resetBounds = useCallback(() => {
    const constrained = constrainBoundsToViewport(defaultBounds);
    setBounds(constrained);
    saveBounds(constrained);
  }, [defaultBounds, constrainBoundsToViewport, saveBounds]);

  return {
    bounds,
    isDragging,
    isResizing,
    resizeDirection,
    dragHandlers: {
      onMouseDown: onDragMouseDown,
      onTouchStart: onDragTouchStart,
    },
    getResizeHandlers,
    resetBounds,
  };
}

export default useResizableDraggable;
