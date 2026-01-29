/**
 * Distri Dataset Tools - Shared Types
 */

// Tool handler function type
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

// Server analytics response from /analytics/dry-run endpoint
export interface ServerAnalyticsInfo {
  analytics: Record<string, unknown>;
  quality: Record<string, unknown>;
}

// Dataset stats result
export interface DatasetStats {
  dataset_id: string;
  dataset_name: string;
  record_count: number;
  from_spans_count: number;
  manual_count: number;
  topic_count: number;
  topics: Record<string, number>; // topic -> count
  evaluated_count: number;
  created_at: number;
  updated_at: number;
  // Optional server analytics (only present when include_server_analytics_info=true)
  server_analytics?: ServerAnalyticsInfo;
}

// Dataset list item
export interface DatasetListItem {
  id: string;
  name: string;
  record_count: number;
  created_at: number;
  updated_at: number;
}

// Analysis result types
export interface TopicSuggestion {
  suggested_topic: string;
  record_ids: string[];
  reason: string;
  confidence: number;
}

export interface DuplicateGroup {
  record_ids: string[];
  similarity_score: number;
  similarity_type: 'exact' | 'near' | 'similar';
  sample_content?: string;
}

export interface DatasetSummary {
  total_records: number;
  from_spans: number;
  manual: number;
  topics: Record<string, number>;
  evaluation_stats: {
    evaluated: number;
    average_score: number | null;
    score_distribution: Record<number, number>;
  };
  date_range: {
    earliest: number;
    latest: number;
  };
  recommendations: string[];
}

export interface RecordComparison {
  records: Array<{
    id: string;
    topic?: string;
    source: 'span' | 'manual';
    created_at: number;
    input_summary: string;
    output_summary: string;
  }>;
  differences: string[];
  similarities: string[];
  similarity_score: number;
  recommendation?: string;
}
