/**
 * AssignTopicDialog
 *
 * Dialog for bulk assigning a topic to selected records.
 * Supports selecting from existing topics or typing a new one.
 * Also provides auto-categorization using the topic hierarchy.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Plus, Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTopicColor, type AvailableTopic } from "./record-utils";

interface AssignTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onAssign: (topic: string) => void;
  /** Available topics from hierarchy for selection */
  availableTopics?: AvailableTopic[];
  /** Auto-categorize selected records using topic hierarchy */
  onAutoCategorize?: () => Promise<void>;
  /** Whether auto-categorization is in progress */
  isAutoCategorizing?: boolean;
}

export function AssignTopicDialog({
  open,
  onOpenChange,
  selectedCount,
  onAssign,
  availableTopics = [],
  onAutoCategorize,
  isAutoCategorizing = false,
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

  const handleAssign = (topic: string) => {
    if (topic.trim()) {
      onAssign(topic.trim());
      setSearchValue("");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSearchValue("");
    }
    onOpenChange(newOpen);
  };

  const handleAutoCategorize = async () => {
    if (onAutoCategorize) {
      await onAutoCategorize();
    }
  };

  const hasHierarchy = availableTopics.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Assign Topic</DialogTitle>
          <DialogDescription>
            Assign a topic to {selectedCount} selected record{selectedCount !== 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
          {/* Search/input field */}
          <div className="flex-shrink-0">
            <Input
              ref={inputRef}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={hasHierarchy ? "Search or type new topic..." : "Enter topic name..."}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (filteredTopics.length === 1) {
                    handleAssign(filteredTopics[0].name);
                  } else if (showCreateNew || !hasHierarchy) {
                    handleAssign(searchValue.trim());
                  }
                }
              }}
            />
          </div>

          {/* Topics list */}
          {hasHierarchy && (
            <div className="flex-1 min-h-0 border border-border rounded-lg overflow-hidden">
              <div className="h-full max-h-[250px] overflow-y-auto">
                {/* Create new option */}
                {showCreateNew && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 text-left border-b border-border"
                    onClick={() => handleAssign(searchValue.trim())}
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
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 text-left border-b border-border last:border-b-0"
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
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No matching topics
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Auto-categorize section */}
          {onAutoCategorize && hasHierarchy && (
            <div className="flex-shrink-0 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-3">
                Or let AI automatically categorize selected records based on your topic hierarchy.
              </p>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleAutoCategorize}
                disabled={isAutoCategorizing}
              >
                {isAutoCategorizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Auto-categorizing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Auto-categorize Selected Records
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          {!hasHierarchy && (
            <Button
              onClick={() => handleAssign(searchValue)}
              disabled={!searchValue.trim()}
              className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              Assign Topic
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
