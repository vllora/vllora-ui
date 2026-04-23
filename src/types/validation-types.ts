/**
 * Validation Types for RFT Fine-Tuning Pipeline
 *
 * Types for automatic record validation and health indicator.
 */

// Validation error types
export type ValidationError =
  | 'invalid_data_structure'
  | 'missing_input'
  | 'missing_messages'
  | 'empty_messages'
  | 'invalid_role'
  | 'no_user_message'
  | 'empty_user_message'
  | 'user_message_too_short'
  | 'orphan_tool_result'
  | 'missing_tool_call_id'
  | 'exceeds_max_tokens'
  | 'duplicate'
  | 'invalid_json';

// Result of validating a single record
export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
  details?: string;
}

// Configuration for validation
export interface ValidationConfig {
  minUserMessageLength: number;  // default: 10
  maxTokens: number;             // default: 8000
  allowedRoles: Set<string>;     // default: system, user, assistant, tool
}

// Default validation configuration
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minUserMessageLength: 10,
  maxTokens: 8000,
  allowedRoles: new Set(['system', 'user', 'assistant', 'tool']),
};

// Hygiene report from batch validation
export interface HygieneReport {
  timestamp: string;
  total: number;
  valid: number;
  rejected: number;
  rejectionRate: string;
  errorsByType: Partial<Record<ValidationError, number>>;
  duplicatesRemoved: number;
  recommendations: string[];
}

// Individual record validation status
export interface RecordValidationStatus {
  recordId: string;
  isValid: boolean;
  errors: ValidationError[];
  details?: string;
}

// Batch validation result
export interface BatchValidationResult {
  validRecordIds: Set<string>;
  invalidRecords: Map<string, ValidationError[]>;
  report: HygieneReport;
}

// Health indicator status
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'validating';

// Health indicator data for UI
export interface HealthIndicatorData {
  status: HealthStatus;
  validCount: number;
  invalidCount: number;
  totalCount: number;
  rejectionRate: number;
  topErrors: Array<{ error: ValidationError; count: number }>;
}

// Helper function to get health status from rejection rate
export function getHealthStatus(rejectionRate: number): HealthStatus {
  if (rejectionRate <= 0.05) return 'healthy';  // <= 5%
  if (rejectionRate <= 0.15) return 'warning';  // <= 15%
  return 'critical';                             // > 15%
}

// Human-readable error messages
export const VALIDATION_ERROR_MESSAGES: Record<ValidationError, string> = {
  invalid_data_structure: 'Invalid data structure',
  missing_input: 'Missing input field',
  missing_messages: 'Missing messages array',
  empty_messages: 'Empty messages array',
  invalid_role: 'Invalid message role',
  no_user_message: 'No user message found',
  empty_user_message: 'Empty user message',
  user_message_too_short: 'User message too short',
  orphan_tool_result: 'Tool result without matching call',
  missing_tool_call_id: 'Missing tool call ID',
  exceeds_max_tokens: 'Exceeds maximum token limit',
  duplicate: 'Duplicate record',
  invalid_json: 'Invalid JSON structure',
};
