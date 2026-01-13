/**
 * DatasetDetailHeader
 *
 * Header for the dataset detail view with breadcrumb, title, stats, and actions.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  Pencil,
  Check,
  X,
  Download,
  Upload,
} from "lucide-react";

interface DatasetDetailHeaderProps {
  name: string;
  recordCount: number;
  createdAt?: number;
  updatedAt?: number;
  onBack: () => void;
  onRename: (newName: string) => Promise<void>;
  onExport?: () => void;
  onIngest?: () => void;
}

export function DatasetDetailHeader({
  name,
  recordCount,
  updatedAt,
  onBack,
  onRename,
  onExport,
  onIngest,
}: DatasetDetailHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState("");

  const handleStartEdit = () => {
    setEditingName(name);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editingName.trim()) {
      await onRename(editingName.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingName("");
  };

  // Format the last updated time
  const formatLastUpdated = (timestamp?: number) => {
    if (!timestamp) return null;
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    return "Just now";
  };

  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <button
          onClick={onBack}
          className="hover:text-foreground transition-colors"
        >
          Datasets
        </button>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-medium">{name}</span>
        <ChevronRight className="w-4 h-4" />
        <span>Raw Records</span>
      </div>

      {/* Title and actions */}
      <div className="flex items-start justify-between">
        <div>
          {isEditing ? (
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
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
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold">{name}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleStartEdit}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {recordCount.toLocaleString()} total records
            {updatedAt && (
              <>
                <span className="mx-2">•</span>
                <span className="text-[rgb(var(--theme-500))]">
                  Last updated {formatLastUpdated(updatedAt)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={onExport}
          >
            <Download className="w-4 h-4" />
            Export Dataset
          </Button>
          <Button
            className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            onClick={onIngest}
          >
            <Upload className="w-4 h-4" />
            Import Data
          </Button>
        </div>
      </div>
    </div>
  );
}
