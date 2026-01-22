export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
}

// Stored in 'records' object store
export interface DatasetRecord {
  id: string;
  datasetId: string;           // Foreign key to dataset
  data: unknown;               // Trace payload (DataInfo) or imported object
  metadata?: Record<string, unknown>; // Record-level metadata (provenance, flags)
  spanId?: string;             // For duplicate detection and keeping track of span (optional - undefined for generated data)
  topic?: string;              // Leaf topic name (look up full path in dataset's topicHierarchy)
  is_generated?: boolean;      // True for synthetic/generated traces
  evaluation?: DatasetEvaluation;
  createdAt: number;
  updatedAt: number;           // Last modified timestamp
}

export interface DataInfo {
  input: {
    messages?: any[]
    tools?: any[]
    tool_choice?: string
  }
  output: {
    messages?: any[] | any
    tool_calls?: any[]
    finish_reason?: string;
  }
}

// Topic hierarchy node for tree structure
export interface TopicHierarchyNode {
  id: string;
  name: string;
  children?: TopicHierarchyNode[];
  // Whether this node is selected/checked
  selected?: boolean;
}

// Topic hierarchy configuration stored at dataset level
export interface TopicHierarchyConfig {
  // User's description of dataset goals (used as context for LLM)
  goals?: string;
  // Hierarchy depth (1-5 levels)
  depth: number;
  // The generated topic hierarchy tree
  hierarchy?: TopicHierarchyNode[];
  // Timestamp when hierarchy was last generated
  generatedAt?: number;
}

// LLM-as-a-Judge evaluation configuration
export interface EvaluationConfig {
  // Combined prompt template with evaluation instructions and variable placeholders
  promptTemplate: string;
  // JSON Schema for structured output
  outputSchema: string;
  // Model to use for evaluation
  model: string;
  // Timestamp when config was last updated
  updatedAt?: number;
}

// Stored in 'datasets' object store (metadata only, no records array)
export interface Dataset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  // Backend dataset ID from the cloud provider (set after first finetune upload)
  backendDatasetId?: string;
  // Topic hierarchy configuration
  topicHierarchy?: TopicHierarchyConfig;
  // LLM-as-a-Judge evaluation configuration
  evaluationConfig?: EvaluationConfig;
}

// Combined view for UI (dataset + its records)
export interface DatasetWithRecords extends Dataset {
  records: DatasetRecord[];
}
