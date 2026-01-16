/**
 * AssignTopicDialog
 *
 * Dialog for bulk assigning a topic to selected records.
 */

import { useState } from "react";
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

interface AssignTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onAssign: (topic: string) => void;
}

export function AssignTopicDialog({
  open,
  onOpenChange,
  selectedCount,
  onAssign,
}: AssignTopicDialogProps) {
  const [topic, setTopic] = useState("");

  const handleAssign = () => {
    if (topic.trim()) {
      onAssign(topic.trim());
      setTopic("");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTopic("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Topic</DialogTitle>
          <DialogDescription>
            Assign a topic to {selectedCount} selected record{selectedCount !== 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter topic name..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && topic.trim()) {
                handleAssign();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!topic.trim()}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            Assign Topic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
