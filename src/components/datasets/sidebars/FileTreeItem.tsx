/**
 * FileTreeItem
 *
 * Recursive tree item component for the Dataset Explorer.
 * Models VS Code's file tree: indent per level, chevron for folders,
 * type-specific icons, optional badges, hover highlight, hover actions.
 *
 * Uses a <div> wrapper (not <button>) so that nested action <button>s
 * receive clicks correctly — nesting <button> inside <button> is invalid HTML.
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FileTreeNode, BadgeVariant } from "./types";

interface FileTreeItemProps {
  node: FileTreeNode;
  level: number;
  expandedNodes: Set<string>;
  selectedNodeId: string | null;
  onToggle: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
}

const INDENT_PX = 16;
const BASE_PX = 8;

function badgeClasses(variant: BadgeVariant): string {
  switch (variant) {
    case "success":
      return "text-[rgb(var(--theme-500))]";
    case "warning":
      return "text-yellow-500";
    case "error":
      return "text-destructive";
    case "loading":
      return "text-blue-500 animate-pulse";
    case "count":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

export function FileTreeItem({
  node,
  level,
  expandedNodes,
  selectedNodeId,
  onToggle,
  onSelect,
}: FileTreeItemProps) {
  const isFolder = node.type === "folder";
  const hasChildren = isFolder && node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const canExpand = isFolder && (hasChildren || node.isExpandable);
  const isSection = !!node.isSection;

  const handleClick = () => {
    if (canExpand) {
      onToggle(node.id);
    }
    onSelect(node.id);
  };

  // ── Section header (VS Code collapsible section) ────────────────────
  if (isSection) {
    return (
      <>
        <div
          role="treeitem"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleClick();
            }
          }}
          title={node.title}
          className={cn(
            "group/tree-item w-full flex items-center gap-1 h-[22px] pr-2",
            "text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/70",
            "hover:text-sidebar-foreground cursor-pointer select-none transition-colors",
            level === 0 && "mt-2 first:mt-0"
          )}
          style={{ paddingLeft: `${BASE_PX + level * INDENT_PX}px` }}
        >
          {/* Chevron */}
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform duration-150",
                isExpanded && "rotate-90"
              )}
            />
          </span>

          {/* Section label */}
          <span className="truncate flex-1 min-w-0">{node.name}</span>

          {/* Hover actions */}
          {node.actions && node.actions.length > 0 && (
            <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/tree-item:opacity-100 transition-opacity">
              {node.actions.map((action) => (
                <button
                  key={action.key}
                  title={action.title}
                  className={cn(
                    "w-5 h-5 flex items-center justify-center rounded-sm transition-colors",
                    action.disabled
                      ? "opacity-40 cursor-not-allowed text-muted-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!action.disabled) {
                      action.onClick();
                    }
                  }}
                >
                  {action.icon}
                </button>
              ))}
            </span>
          )}

          {/* Badge */}
          {node.badge && (
            node.badge.icon ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "shrink-0 flex items-center justify-center w-4 h-4",
                        badgeClasses(node.badge.variant)
                      )}
                    >
                      {node.badge.icon}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {node.badge.tooltip || node.badge.label}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span
                className={cn(
                  "text-[10px] shrink-0 tabular-nums font-normal",
                  badgeClasses(node.badge.variant)
                )}
              >
                {node.badge.label}
              </span>
            )
          )}
        </div>

        {/* Section children */}
        {isExpanded && (
          hasChildren ? (
            <>
              {node.children!.map((child) => (
                <FileTreeItem
                  key={child.id}
                  node={child}
                  level={level + 1}
                  expandedNodes={expandedNodes}
                  selectedNodeId={selectedNodeId}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ))}
            </>
          ) : (
            <div
              className="text-[11px] text-muted-foreground/40 italic select-none"
              style={{ paddingLeft: `${BASE_PX + (level + 1) * INDENT_PX + 20}px` }}
            >
              {node.emptyText || "No items yet"}
            </div>
          )
        )}
      </>
    );
  }

  // ── Regular tree item ───────────────────────────────────────────────

  return (
    <>
      {/* Row wrapper — <div> instead of <button> so nested action buttons work */}
      <div
        role="treeitem"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        title={node.title}
        className={cn(
          "group/tree-item w-full flex items-center gap-1 py-[3px] pr-2 text-left text-[13px] leading-[22px]",
          "hover:bg-muted/60 transition-colors cursor-pointer select-none",
          isSelected && "bg-muted/80 text-foreground",
          !isSelected && "text-foreground/80"
        )}
        style={{ paddingLeft: `${BASE_PX + level * INDENT_PX}px` }}
      >
        {/* Chevron (folders) or spacer (files) */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {canExpand ? (
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground transition-transform duration-150",
                isExpanded && "rotate-90"
              )}
            />
          ) : null}
        </span>

        {/* Icon */}
        {node.icon && (
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            {node.icon}
          </span>
        )}

        {/* Name */}
        <span className="truncate flex-1 min-w-0">{node.name}</span>

        {/* Hover actions (VS Code-style) */}
        {node.actions && node.actions.length > 0 && (
          <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/tree-item:opacity-100 transition-opacity">
            {node.actions.map((action) => (
              <button
                key={action.key}
                title={action.title}
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded-sm transition-colors",
                  action.disabled
                    ? "opacity-40 cursor-not-allowed text-muted-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!action.disabled) {
                    action.onClick();
                  }
                }}
              >
                {action.icon}
              </button>
            ))}
          </span>
        )}

        {/* Badge — icon (with styled tooltip) or text */}
        {node.badge && (
          node.badge.icon ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "shrink-0 flex items-center justify-center w-4 h-4",
                      badgeClasses(node.badge.variant)
                    )}
                  >
                    {node.badge.icon}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {node.badge.tooltip || node.badge.label}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : node.badge.tooltip ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "text-[11px] shrink-0 tabular-nums",
                      badgeClasses(node.badge.variant)
                    )}
                  >
                    {node.badge.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {node.badge.tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span
              className={cn(
                "text-[11px] shrink-0 tabular-nums",
                badgeClasses(node.badge.variant)
              )}
            >
              {node.badge.label}
            </span>
          )
        )}
      </div>

      {/* Children (expanded folders) */}
      {isExpanded && (
        hasChildren ? (
          <>
            {node.children!.map((child) => (
              <FileTreeItem
                key={child.id}
                node={child}
                level={level + 1}
                expandedNodes={expandedNodes}
                selectedNodeId={selectedNodeId}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </>
        ) : node.emptyText ? (
          <div
            className="text-[11px] text-muted-foreground/40 italic select-none"
            style={{ paddingLeft: `${BASE_PX + (level + 1) * INDENT_PX + 20}px` }}
          >
            {node.emptyText}
          </div>
        ) : null
      )}
    </>
  );
}
