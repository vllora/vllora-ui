/**
 * DatasetDetailHeader
 *
 * Simplified header showing dataset objective and key statistics in cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  Pencil,
  Check,
  X,
  Database,
  FileText,
  Sparkles,
  FolderTree,
  PieChart,
} from "lucide-react";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { DatasetSelector } from "./DatasetSelector";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: "default" | "violet" | "blue" | "emerald" | "amber" | "red";
}

function StatCard({ icon, label, value, subValue, color = "default" }: StatCardProps) {
  const colorClasses = {
    default: "bg-muted/50 text-foreground",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 rounded-lg", colorClasses[color])}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-semibold text-lg leading-tight">{value}</div>
        {subValue && <div className="text-xs text-muted-foreground">{subValue}</div>}
      </div>
    </div>
  );
}

export function DatasetDetailHeader() {
  const {
    dataset,
    datasetId,
    records,
    datasets,
    datasetRecordCounts,
    onBack,
    onSelectDataset,
    setCreateDatasetDialog,
    handleRenameDataset,
  } = DatasetDetailConsumer();

  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState("");

  const name = dataset?.name ?? "";
  const stats = dataset?.stats;
  const coverageStats = dataset?.coverageStats;

  // Calculate insights
  const totalRecords = records.length;
  const generatedRecords = stats?.generatedRecords ?? records.filter(r => r.is_generated).length;
  const originalRecords = totalRecords - generatedRecords;
  const topicCount = stats?.topicCount ?? Object.keys(stats?.topicDistribution ?? {}).length;
  const uncategorizedCount = stats?.uncategorizedCount ?? records.filter(r => !r.topic).length;
  const categorizedCount = totalRecords - uncategorizedCount;
  const categorizedPercent = totalRecords > 0
    ? Math.round((categorizedCount / totalRecords) * 100)
    : 0;

  // Balance rating color
  const getBalanceColor = (): StatCardProps["color"] => {
    if (!coverageStats) return "default";
    switch (coverageStats.balanceRating) {
      case "excellent":
      case "good":
        return "emerald";
      case "fair":
        return "amber";
      default:
        return "red";
    }
  };

  const handleStartEdit = () => {
    setEditingName(name);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editingName.trim()) {
      await handleRenameDataset(editingName.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingName("");
  };

  return (
    <div className="mb-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Datasets</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        {datasets && datasets.length > 1 && onSelectDataset ? (
          <DatasetSelector
            currentName={name}
            currentId={datasetId}
            datasets={datasets}
            recordCounts={datasetRecordCounts}
            onSelect={onSelectDataset}
            onCreateNew={() => setCreateDatasetDialog(true)}
          />
        ) : (
          <span className="px-2.5 py-1 rounded-md bg-muted/50 text-foreground font-medium">
            {name}
          </span>
        )}
      </nav>

      {/* Title and Objective */}
      <div className="mb-4">
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
            <h1 className="text-2xl font-bold truncate">{name}</h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleStartEdit}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Training Objective */}
        {dataset?.datasetObjective && (
          <p className="text-sm text-muted-foreground max-w-3xl">
            <span className="font-medium text-foreground">Objective:</span>{" "}
            {dataset.datasetObjective}
          </p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Records */}
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          label="Total Records"
          value={totalRecords.toLocaleString()}
          subValue={originalRecords > 0 ? `${originalRecords} original` : undefined}
        />

        {/* Generated Records */}
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          label="Generated"
          value={generatedRecords.toLocaleString()}
          subValue={totalRecords > 0 ? `${Math.round((generatedRecords / totalRecords) * 100)}% of total` : undefined}
          color={generatedRecords > 0 ? "violet" : "default"}
        />

        {/* Topics & Coverage */}
        <StatCard
          icon={<FolderTree className="w-5 h-5" />}
          label="Topics"
          value={topicCount > 0 ? topicCount : "—"}
          subValue={topicCount > 0 ? `${categorizedPercent}% categorized` : "Not configured"}
          color={topicCount > 0 ? "blue" : "default"}
        />

        {/* Balance */}
        <StatCard
          icon={<PieChart className="w-5 h-5" />}
          label="Balance"
          value={coverageStats?.balanceRating ?? "—"}
          subValue={coverageStats ? `Score: ${Math.round(coverageStats.balanceScore * 100)}%` : "Run coverage analysis"}
          color={getBalanceColor()}
        />
      </div>
    </div>
  );
}
