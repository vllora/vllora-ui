/**
 * ExplorerSidebar
 *
 * Left sidebar wrapping DatasetExplorer.
 * Dataset name appears as root tree node inside DatasetExplorer.
 * Always expanded (240px) when viewport is wide enough, hidden below 1024px.
 */

import { useState, useEffect } from "react";
import { DatasetExplorer } from "./DatasetExplorer";

const BREAKPOINT_HIDDEN = 1024;

export function ExplorerSidebar() {
  const [isHidden, setIsHidden] = useState(false);

  // Hide sidebar on small viewports
  useEffect(() => {
    const handleResize = () => {
      setIsHidden(window.innerWidth < BREAKPOINT_HIDDEN);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (isHidden) return null;

  return (
    <div className="w-[240px] flex-shrink-0 border-r border-border flex flex-col min-h-0 bg-background">
      {/* Header */}
      <div className="flex items-center px-3 py-2 border-b border-border shrink-0">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
      </div>

      {/* File tree (root node = dataset name) */}
      <div className="flex-1 overflow-hidden">
        <DatasetExplorer onNavigate={() => {}} />
      </div>
    </div>
  );
}
