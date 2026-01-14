/**
 * CreateDatasetPopover
 *
 * Popover component for creating a new dataset with name input.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus } from "lucide-react";

interface CreateDatasetPopoverProps {
  onCreateDataset: (name: string) => Promise<void>;
}

export function CreateDatasetPopover({ onCreateDataset }: CreateDatasetPopoverProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    await onCreateDataset(name.trim());
    setOpen(false);
    setName("");
  };

  const handleCancel = () => {
    setOpen(false);
    setName("");
  };

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setName("");
    }}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="h-8 w-8 p-0 rounded-full bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white shadow-sm"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="space-y-3">
          <p className="text-sm font-medium">Create new dataset</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dataset name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                handleCreate();
              }
              if (e.key === "Escape") {
                handleCancel();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!name.trim()}
              className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              Create
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
