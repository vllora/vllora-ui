/**
 * EditableTitle
 *
 * Inline editable title with pencil icon trigger.
 * Supports Enter to save, Escape to cancel.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";

interface EditableTitleProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
}

export function EditableTitle({ value, onSave, className }: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");

  const handleStartEdit = () => {
    setEditingValue(value);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editingValue.trim()) {
      await onSave(editingValue.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingValue("");
  };

  if (isEditing) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <Input
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            className="h-10 w-80 text-2xl font-bold"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <Button size="sm" variant="ghost" onClick={handleSave}>
            <Check className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold truncate">{value}</h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleStartEdit}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
