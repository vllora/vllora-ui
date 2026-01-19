/**
 * TopicCell
 *
 * Displays and edits a record's topic with color-coded badge.
 * Handles long topic names with truncation and tooltip.
 * Supports selecting from existing hierarchy topics or creating new ones.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, X, Tag, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTopicColor, type AvailableTopic } from "../record-utils";
import { COLUMN_WIDTHS } from "../table-columns";

interface TopicCellProps {
  topic?: string;
  topicPath?: string[];
  topicPaths?: string[][];
  onUpdate: (topic: string, isNew?: boolean) => Promise<void>;
  /** Whether to show the "Topic:" label prefix */
  showLabel?: boolean;
  /** Fixed width layout for table view */
  tableLayout?: boolean;
  /** Available topics from hierarchy for selection */
  availableTopics?: AvailableTopic[];
}

export function TopicCell({
  topic,
  topicPath,
  topicPaths,
  onUpdate,
  showLabel = false,
  tableLayout = false,
  availableTopics = [],
}: TopicCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when popover opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Reset search when popover closes
  useEffect(() => {
    if (!isOpen) {
      setSearchValue("");
    }
  }, [isOpen]);

  const handleStartEdit = () => {
    setSearchValue(topic || "");
    setIsOpen(true);
  };

  const handleSelectTopic = async (selectedTopic: string, isNew: boolean = false) => {
    await onUpdate(selectedTopic, isNew);
    setIsOpen(false);
    setSearchValue("");
  };

  const handleCreateNew = async () => {
    if (searchValue.trim()) {
      await onUpdate(searchValue.trim(), true);
      setIsOpen(false);
      setSearchValue("");
    }
  };

  // Filter available topics based on search
  const filteredTopics = useMemo(() => {
    if (!searchValue.trim()) return availableTopics;
    const search = searchValue.toLowerCase();
    return availableTopics.filter(
      (t) =>
        t.name.toLowerCase().includes(search) ||
        t.path.join(" ").toLowerCase().includes(search)
    );
  }, [availableTopics, searchValue]);

  // Check if search value matches an existing topic
  const isExactMatch = useMemo(() => {
    return availableTopics.some(
      (t) => t.name.toLowerCase() === searchValue.trim().toLowerCase()
    );
  }, [availableTopics, searchValue]);

  // Show "create new" option if user typed something that doesn't match
  const showCreateNew = searchValue.trim() && !isExactMatch;

  const hasPath = topicPath && topicPath.length > 0;
  const fullPath = hasPath ? topicPath!.join(" / ") : undefined;
  const displayTopic = topic;

  // topicPaths available for future tree view support
  void topicPaths;

  return (
    <div
      className={cn(
        "flex items-center gap-2 shrink-0",
        tableLayout
          ? cn(COLUMN_WIDTHS.topic, "justify-center")
          : "min-w-[160px] flex-col items-start"
      )}
    >
      {showLabel && (
        <span className="text-xs text-muted-foreground">Topic:</span>
      )}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          {topic ? (
            <div
              className={cn(
                "flex flex-col gap-1",
                tableLayout ? "items-center" : "items-start"
              )}
            >
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "text-[11px] font-medium px-2.5 py-1 rounded-full transition-all hover:opacity-80",
                        "max-w-[140px] truncate",
                        getTopicColor(displayTopic || topic)
                      )}
                      onClick={handleStartEdit}
                    >
                      {displayTopic}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[250px]">
                    <p className="font-medium">{displayTopic}</p>
                    {fullPath && fullPath !== displayTopic && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Path: {fullPath}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Click to edit
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors group"
              onClick={handleStartEdit}
              title="Click to add topic"
            >
              <Tag className="w-3 h-3 group-hover:text-[rgb(var(--theme-500))]" />
              <span className="group-hover:text-[rgb(var(--theme-500))]">
                Add
              </span>
            </button>
          )}
        </PopoverTrigger>

        <PopoverContent
          className="w-[220px] p-0"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="h-7 text-xs"
                placeholder="Search or type new..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (filteredTopics.length === 1) {
                      handleSelectTopic(filteredTopics[0].name);
                    } else if (showCreateNew) {
                      handleCreateNew();
                    }
                  }
                  if (e.key === "Escape") {
                    setIsOpen(false);
                  }
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Topics list */}
          <div className="max-h-[200px] overflow-y-auto">
            {/* Create new option */}
            {showCreateNew && (
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 text-left border-b border-border"
                onClick={handleCreateNew}
              >
                <Plus className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
                <span>
                  Create{" "}
                  <span className="font-medium text-[rgb(var(--theme-500))]">
                    "{searchValue.trim()}"
                  </span>
                </span>
              </button>
            )}

            {/* Existing topics */}
            {filteredTopics.length > 0 ? (
              filteredTopics.map((t, idx) => (
                <button
                  key={`${t.name}-${idx}`}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 text-left",
                    topic === t.name && "bg-muted/30"
                  )}
                  onClick={() => handleSelectTopic(t.name)}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium truncate">{t.name}</span>
                    {t.path.length > 1 && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {t.path.slice(0, -1).join(" / ")}
                      </span>
                    )}
                  </div>
                  {topic === t.name && (
                    <Check className="w-3.5 h-3.5 text-[rgb(var(--theme-500))] shrink-0" />
                  )}
                </button>
              ))
            ) : !showCreateNew ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {availableTopics.length === 0
                  ? "No topics defined. Type to create one."
                  : "No matching topics"}
              </div>
            ) : null}
          </div>

          {/* Footer hint */}
          {availableTopics.length > 0 && (
            <div className="px-3 py-2 border-t border-border bg-muted/20">
              <p className="text-[10px] text-muted-foreground">
                Select existing or type to create new
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
