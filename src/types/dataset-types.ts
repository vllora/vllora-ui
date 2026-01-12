import { Span } from './common-type';

export interface DatasetEvaluation {
  score?: number;
  feedback?: string;
  evaluatedAt?: number;
}

// Stored in 'records' object store
export interface DatasetRecord {
  id: string;
  datasetId: string;           // Foreign key to dataset
  data: Span;
  spanId?: string;             // For duplicate detection (optional - undefined for generated data)
  topic?: string;
  evaluation?: DatasetEvaluation;
  createdAt: number;
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
