/**
 * Data Sanitization Utilities for RFT Training
 *
 * Validates dataset records to ensure they meet RFT requirements:
 * - Valid JSON structure with messages array
 * - Has at least one user message
 * - Valid roles (system, user, assistant, tool)
 * - Tool chain integrity (tool_call_id matching)
 * - Content length validation
 */

import type { DatasetRecord, DataInfo } from "@/types/dataset-types";

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
  | 'duplicate';

export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
  details?: string;
}

export interface ValidationConfig {
  minUserMessageLength: number;
  maxTokens: number;
  allowedRoles: Set<string>;
}

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

export interface SanitizationResult {
  validRecordIds: Set<string>;
  invalidRecordIds: Set<string>;
  duplicateRecordIds: Set<string>;
  report: HygieneReport;
}

// Default validation configuration
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  minUserMessageLength: 10,
  maxTokens: 8000,
  allowedRoles: new Set(['system', 'user', 'assistant', 'tool']),
};

// Message interface for type safety
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

/**
 * Validate a single dataset record for RFT training
 */
export function validateRecord(
  record: DatasetRecord,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  // 1. Check data structure
  const dataInfo = record.data as DataInfo;

  if (!dataInfo || typeof dataInfo !== 'object') {
    return { valid: false, error: 'invalid_data_structure' };
  }

  // 2. Check input exists
  if (!dataInfo.input) {
    return { valid: false, error: 'missing_input' };
  }

  // 3. Check messages exist
  const messages = dataInfo.input.messages as Message[] | undefined;

  if (!messages) {
    return { valid: false, error: 'missing_messages' };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: 'empty_messages' };
  }

  // 4. Validate each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg.role || !config.allowedRoles.has(msg.role)) {
      return {
        valid: false,
        error: 'invalid_role',
        details: `Message ${i} has invalid role: ${msg.role}`,
      };
    }
  }

  // 5. Check has at least one user message
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) {
    return { valid: false, error: 'no_user_message' };
  }

  // 6. Validate user messages have content
  for (const userMsg of userMessages) {
    const content = userMsg.content;

    if (!content || (typeof content === 'string' && !content.trim())) {
      return { valid: false, error: 'empty_user_message' };
    }

    if (typeof content === 'string' && content.trim().length < config.minUserMessageLength) {
      return { valid: false, error: 'user_message_too_short' };
    }
  }

  // 7. Validate tool chain integrity
  const toolChainResult = validateToolChain(messages);
  if (!toolChainResult.valid) {
    return toolChainResult;
  }

  // 8. Check token limit (approximate)
  const tokenCount = estimateTokens(messages);
  if (tokenCount > config.maxTokens) {
    return {
      valid: false,
      error: 'exceeds_max_tokens',
      details: `${tokenCount} tokens exceeds limit of ${config.maxTokens}`,
    };
  }

  return { valid: true };
}

/**
 * Validate tool call chain integrity
 */
function validateToolChain(messages: Message[]): ValidationResult {
  const toolCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const msg of messages) {
    // Collect tool call IDs from assistant messages
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        if (!toolCall.id) {
          return { valid: false, error: 'missing_tool_call_id' };
        }
        toolCallIds.add(toolCall.id);
      }
    }

    // Collect tool result IDs
    if (msg.role === 'tool') {
      if (!msg.tool_call_id) {
        return { valid: false, error: 'missing_tool_call_id' };
      }
      toolResultIds.add(msg.tool_call_id);
    }
  }

  // Check all tool results have matching calls
  for (const resultId of toolResultIds) {
    if (!toolCallIds.has(resultId)) {
      return {
        valid: false,
        error: 'orphan_tool_result',
        details: `Tool result references non-existent call: ${resultId}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Estimate token count (rough approximation: 4 chars ≈ 1 token)
 */
function estimateTokens(messages: Message[]): number {
  let totalChars = 0;

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    }
    if (msg.tool_calls) {
      totalChars += JSON.stringify(msg.tool_calls).length;
    }
  }

  return Math.ceil(totalChars / 4);
}

/**
 * Compute content hash for deduplication
 */
function computeContentHash(record: DatasetRecord): string {
  const dataInfo = record.data as DataInfo;
  const content = JSON.stringify(dataInfo.input?.messages || []);
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Generate recommendations based on error distribution
 */
function generateRecommendations(
  errors: Partial<Record<ValidationError, number>>,
  total: number
): string[] {
  const recommendations: string[] = [];

  const noUserRate = (errors['no_user_message'] || 0) / total;
  if (noUserRate > 0.05) {
    recommendations.push(
      `High 'no_user_message' rate (${(noUserRate * 100).toFixed(1)}%) - records missing user messages`
    );
  }

  const emptyRate = (errors['empty_user_message'] || 0) / total;
  if (emptyRate > 0.05) {
    recommendations.push(
      `Many empty messages (${(emptyRate * 100).toFixed(1)}%) - review data collection`
    );
  }

  const toolErrors = (errors['orphan_tool_result'] || 0) + (errors['missing_tool_call_id'] || 0);
  if (toolErrors > 0) {
    recommendations.push(
      `${toolErrors} tool chain errors - check tool call/result pairing`
    );
  }

  const tooShortRate = (errors['user_message_too_short'] || 0) / total;
  if (tooShortRate > 0.1) {
    recommendations.push(
      `High 'too short' rate (${(tooShortRate * 100).toFixed(1)}%) - consider lowering minimum length threshold`
    );
  }

  const tokenErrors = errors['exceeds_max_tokens'] || 0;
  if (tokenErrors > 0) {
    recommendations.push(
      `${tokenErrors} records exceed token limit - consider splitting long conversations`
    );
  }

  return recommendations;
}

/**
 * Sanitize all records in a dataset
 * Returns sets of valid, invalid, and duplicate record IDs along with a report
 */
export async function sanitizeRecords(
  records: DatasetRecord[],
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG,
  onProgress?: (progress: number) => void
): Promise<SanitizationResult> {
  const validRecordIds = new Set<string>();
  const invalidRecordIds = new Set<string>();
  const duplicateRecordIds = new Set<string>();
  const errorCounts: Partial<Record<ValidationError, number>> = {};
  const seenHashes = new Set<string>();
  let duplicatesRemoved = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Validate
    const result = validateRecord(record, config);

    if (!result.valid) {
      const errorType = result.error || 'invalid_data_structure';
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      invalidRecordIds.add(record.id);

      // Report progress
      if (onProgress) {
        onProgress(Math.round((i + 1) / records.length * 100));
      }
      continue;
    }

    // Deduplicate using spanId or content hash
    const hash = record.spanId || computeContentHash(record);
    if (seenHashes.has(hash)) {
      duplicatesRemoved++;
      duplicateRecordIds.add(record.id);

      // Report progress
      if (onProgress) {
        onProgress(Math.round((i + 1) / records.length * 100));
      }
      continue;
    }
    seenHashes.add(hash);

    validRecordIds.add(record.id);

    // Report progress
    if (onProgress) {
      onProgress(Math.round((i + 1) / records.length * 100));
    }
  }

  const report: HygieneReport = {
    timestamp: new Date().toISOString(),
    total: records.length,
    valid: validRecordIds.size,
    rejected: invalidRecordIds.size,
    rejectionRate: `${((records.length - validRecordIds.size) / records.length * 100).toFixed(1)}%`,
    errorsByType: errorCounts,
    duplicatesRemoved,
    recommendations: generateRecommendations(errorCounts, records.length),
  };

  return { validRecordIds, invalidRecordIds, duplicateRecordIds, report };
}

/**
 * Extract user content from a record (utility used by other modules)
 */
export function extractUserContent(record: DatasetRecord): string {
  const dataInfo = record.data as DataInfo;
  const messages = (dataInfo.input?.messages || []) as Message[];

  // Get last user message content
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1];

  return typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : '';
}

/**
 * Get a human-readable label for a validation error
 */
export function getErrorLabel(error: ValidationError): string {
  const labels: Record<ValidationError, string> = {
    'invalid_data_structure': 'Invalid data structure',
    'missing_input': 'Missing input field',
    'missing_messages': 'Missing messages array',
    'empty_messages': 'Empty messages array',
    'invalid_role': 'Invalid message role',
    'no_user_message': 'No user message',
    'empty_user_message': 'Empty user message',
    'user_message_too_short': 'User message too short',
    'orphan_tool_result': 'Orphan tool result',
    'missing_tool_call_id': 'Missing tool call ID',
    'exceeds_max_tokens': 'Exceeds max tokens',
    'duplicate': 'Duplicate record',
  };
  return labels[error] || error;
}
