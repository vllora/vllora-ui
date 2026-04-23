/**
 * ExplorerSidebar
 *
 * Left sidebar wrapping DatasetExplorer.
 * Resizable via drag handle on the right edge (VS Code-style).
 * Default width is ~15% of viewport, clamped to 160–480px.
 * Width persisted to localStorage. Desktop-only layout.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { DatasetExplorer } from "./DatasetExplorer";

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const STORAGE_KEY = "explorer-sidebar-width";

/** ~15% of viewport width, clamped to min/max */
function getDefaultWidth(): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.15)));
}

function getStoredWidth(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch { /* noop */ }
  return getDefaultWidth();
}

export function ExplorerSidebar() {
  const [width, setWidth] = useState(getStoredWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Drag-to-resize handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = widthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persist final width
      try { localStorage.setItem(STORAGE_KEY, String(widthRef.current)); } catch { /* noop */ }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div
      className="relative flex-shrink-0 border-r border-border flex flex-col min-h-0 bg-background"
      style={{ width }}
    >
      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DatasetExplorer onNavigate={() => {}} />
      </div>

      {/* Resize handle — VS Code style: thin line on hover, thicker on drag */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-[3px] h-full cursor-col-resize z-10 group"
      >
        <div className="w-px h-full ml-[1px] transition-colors group-hover:bg-[rgb(var(--theme-500))] group-active:bg-[rgb(var(--theme-500))]" />
      </div>
    </div>
  );
}
