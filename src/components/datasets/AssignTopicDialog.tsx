/**
 * AssignTopicDialog
 *
 * Dialog for bulk assigning a topic to selected records.
 * Supports selecting from existing topics or typing a new one.
 * Also provides auto-tagging using the topic hierarchy.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTopicColor, type AvailableTopic } from "./record-utils";
import { AutoTagButton, type AutoTagProgress } from "./AutoTagButton";

interface AssignTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  /** Called when a topic is assigned. isNew=true when creating a new topic not in hierarchy */
  onAssign: (topic: string, isNew?: boolean) => void;
  /** Available topics from hierarchy for selection */
  availableTopics?: AvailableTopic[];
  /** Auto-tag selected records using topic hierarchy */
  onAutoTag?: () => Promise<void>;
  /** Whether auto-tagging is in progress */
  isAutoTagging?: boolean;
  /** Progress of auto-tagging */
  autoTagProgress?: AutoTagProgress | null;
  /** Clear topics from selected records */
  onClearTopics?: () => Promise<void>;
}

export function AssignTopicDialog({
  open,
  onOpenChange,
  selectedCount,
  onAssign,
  availableTopics = [],
  onAutoTag,
  isAutoTagging = false,
  autoTagProgress,
  onClearTopics,
}: AssignTopicDialogProps) {
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchValue("");
    }
  }, [open]);

  // Filter available topics based on search
  const filteredTopics = useMemo(() => {
    // Filter out invalid topics first
    const validTopics = availableTopics.filter((t) => t && t.name);
    if (!searchValue.trim()) return validTopics;
    const search = searchValue.toLowerCase();
    return validTopics.filter(
      (t) =>
        t.name.toLowerCase().includes(search) ||
        t.path?.join(" ").toLowerCase().includes(search)
    );
  }, [availableTopics, searchValue]);

  // Check if search value matches an existing topic
  const isExactMatch = useMemo(() => {
    return availableTopics.some(
      (t) => t?.name?.toLowerCase() === searchValue.trim().toLowerCase()
    );
  }, [availableTopics, searchValue]);

  // Show "create new" option if user typed something that doesn't match
  const showCreateNew = searchValue.trim() && !isExactMatch;

  const handleAssign = (topic: string, isNew?: boolean) => {
    if (topic.trim()) {
      onAssign(topic.trim(), isNew);
      setSearchValue("");
      onOpenChange(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSearchValue("");
    }
    onOpenChange(newOpen);
  };

  const handleAutoTag = async () => {
    if (onAutoTag) {
      await onAutoTag();
    }
  };

  const handleClearTopics = async () => {
    if (onClearTopics) {
      await onClearTopics();
      onOpenChange(false);
    }
  };

  const hasHierarchy = availableTopics.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[50vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-base">Assign Topic</DialogTitle>
          <DialogDescription className="text-xs">
            {selectedCount} record{selectedCount !== 1 ? "s" : ""} selected
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-3">
          <Input
            ref={inputRef}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={hasHierarchy ? "Search or type new topic..." : "Enter topic name..."}
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (filteredTopics.length === 1) {
                  handleAssign(filteredTopics[0].name);
                } else if (showCreateNew || !hasHierarchy) {
                  handleAssign(searchValue.trim(), true);
                }
              }
            }}
          />
        </div>

        {/* Topics list */}
        {hasHierarchy && (
          <div className="max-h-[200px] overflow-y-auto border-t border-border">
            {/* Create new option */}
            {showCreateNew && (
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/50 text-left"
                onClick={() => handleAssign(searchValue.trim(), true)}
              >
                <Plus className="w-4 h-4 text-[rgb(var(--theme-500))]" />
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
                  className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/50 text-left group"
                  onClick={() => handleAssign(t.name)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                        getTopicColor(t.name)
                      )}
                    >
                      {t.name}
                    </span>
                    {t.path.length > 1 && (
                      <span className="text-xs text-muted-foreground truncate">
                        {t.path.slice(0, -1).join(" / ")}
                      </span>
                    )}
                  </div>
                  <Check className="w-4 h-4 text-transparent group-hover:text-muted-foreground shrink-0" />
                </button>
              ))
            ) : !showCreateNew ? (
              <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                No matching topics
              </div>
            ) : null}
          </div>
        )}

        {/* Footer with actions */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border bg-muted/30">
          {/* Left side - Clear topic */}
          {onClearTopics ? (
            <button
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
              onClick={handleClearTopics}
            >
              <X className="w-3 h-3" />
              Clear topic
            </button>
          ) : (
            <div />
          )}

          {/* Right side - Auto-tag or manual assign */}
          {onAutoTag && hasHierarchy ? (
            <AutoTagButton
              onAutoTag={handleAutoTag}
              isAutoTagging={isAutoTagging}
              progress={autoTagProgress}
              variant="default"
              className="h-8 text-xs bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
              label="Auto-tag"
            />
          ) : !hasHierarchy ? (
            <Button
              size="sm"
              onClick={() => handleAssign(searchValue, true)}
              disabled={!searchValue.trim()}
              className="h-8 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              Assign
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
