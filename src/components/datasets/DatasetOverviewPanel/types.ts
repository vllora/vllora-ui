/**
 * Types for the DatasetOverviewPanel feature.
 */

// =============================================================================
// Activity Types
// =============================================================================

export type ActivityEntryType = "step" | "evaluation" | "finetune";
export type ActivityEntryStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "pending"
  | "skipped";

export type ActivityCategoryBadgeTone = "data" | "eval" | "finetune" | "neutral";

export interface ActivityCategoryBadge {
  label: string;
  tone: ActivityCategoryBadgeTone;
}

export interface ActivityEntry {
  id: string;
  type: ActivityEntryType;
  label: string;
  status: ActivityEntryStatus;
  detail?: string;
  secondaryDetail?: string;
  timestamp?: number;
  progress?: number;
  details?: ActivityDetailBlock[];
  categoryBadge?: ActivityCategoryBadge;
  action?: {
    title: string;
    onClick: () => void;
  };
}

export type ActivityDetailTone = "default" | "success" | "warning" | "danger";

export interface ActivityMetric {
  label: string;
  value: string;
  tone?: ActivityDetailTone;
}

export interface ActivityDistributionBin {
  label: string;
  value: number;
}

export type ActivityDetailBlock =
  | {
      type: "tag_list";
      title: string;
      items: string[];
      maxVisible?: number;
    }
  | {
      type: "metric_grid";
      title?: string;
      metrics: ActivityMetric[];
    }
  | {
      type: "distribution_bars";
      title: string;
      bins: ActivityDistributionBin[];
      footer?: string;
      lowToHighLabels?: boolean;
      scoreStrip?: boolean;
      mean?: number;
    }
  | {
      type: "kv_list";
      title: string;
      rows: Array<{ key: string; value: string }>;
    }
  | {
      type: "result_footer";
      title?: string;
      value: string;
      tone?: ActivityDetailTone;
    };

// =============================================================================
// Component Props
// =============================================================================

export interface ActivityTimelineProps {
  entries: ActivityEntry[];
  isLoading: boolean;
  isLive: boolean;
}

export interface DatasetOverviewPanelProps {
  readme: string | null;
  readmeUpdatedAt: number | null;
  onExport: () => void;
  onRegenerate: () => Promise<void>;
  datasetId: string;
  onOverviewClick?: () => void;
}

// =============================================================================
// Internal helper types
// =============================================================================

export interface StepDetailContext {
  stepId: string;
  stepResult: unknown;
  plan: import("@/lib/distri-finetune-tools/steps/propose-plan/types").Plan | null;
  dataset: import("@/types/dataset-types").Dataset | null | undefined;
  dryRunJobs: import("@/types/dry-run-job").DryRunJob[];
  finetuneJobs: import("@/services/finetune-api").FinetuneJob[];
}
