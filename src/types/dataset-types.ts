export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
}

// Stored in 'records' object store
export interface DatasetRecord {
  id: string;
  datasetId: string;           // Foreign key to dataset
  data: unknown;               // Flexible data - can be Span, generated data, or any structured object
  spanId?: string;             // For duplicate detection and keeping track of span (optional - undefined for generated data)
  topic?: string;
  evaluation?: DatasetEvaluation;
  createdAt: number;
  updatedAt: number;           // Last modified timestamp
}

export interface DataInfo {
  input: {
    messages?: any[]
    tools?: any[]
    tool_choice?: string
    metadata?: any
  }
  output: {
    messages?: any[]
    tool_calls?: any[]
    metadata?: any;
    finish_reason?: string;
  }
}

// Stored in 'datasets' object store (metadata only, no records array)
export interface Dataset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// Combined view for UI (dataset + its records)
export interface DatasetWithRecords extends Dataset {
  records: DatasetRecord[];
}
