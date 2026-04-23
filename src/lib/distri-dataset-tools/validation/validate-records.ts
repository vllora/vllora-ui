/**
 * Record Validation Service
 *
 * Validates DatasetRecords for RFT training compatibility.
 * Runs automatically when data changes (not a manual step).
 */

import { DatasetRecord, DataInfo } from '@/types/dataset-types';
import {
  ValidationResult,
  ValidationConfig,
  ValidationError,
  HygieneReport,
  BatchValidationResult,
  DEFAULT_VALIDATION_CONFIG,
} from '@/types/validation-types';

// Message type for validation
interface Message {
  role: string;
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Validate a single record for RFT training compatibility
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
  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length === 0) {
    return { valid: false, error: 'no_user_message' };
  }

  // 6. Validate user messages have content
  for (const userMsg of userMessages) {
    const content = userMsg.content;

    if (content === null || content === undefined || (typeof content === 'string' && !content.trim())) {
      return { valid: false, error: 'empty_user_message' };
    }

    if (
      typeof content === 'string' &&
      content.trim().length < config.minUserMessageLength
    ) {
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
 * Validate tool call/result chain integrity
 */
export function validateToolChain(messages: Message[]): ValidationResult {
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
 * Estimate token count from messages (rough approximation: 4 chars ≈ 1 token)
 */
export function estimateTokens(messages: Message[]): number {
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
 * Extract user content from a record (for deduplication and analysis)
 */
export function extractUserContent(record: DatasetRecord): string {
  const dataInfo = record.data as DataInfo;
  const messages = (dataInfo?.input?.messages || []) as Message[];

  // Get last user message content
  const userMessages = messages.filter((m) => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1];

  return typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
}

/**
 * Compute content hash for deduplication
 */
export function computeContentHash(record: DatasetRecord): string {
  const dataInfo = record.data as DataInfo;
  const content = JSON.stringify((dataInfo?.input?.messages || []) as Message[]);

  // Simple hash - adequate for deduplication
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Generate recommendations based on error patterns
 */
function generateRecommendations(
  errors: Partial<Record<ValidationError, number>>,
  total: number
): string[] {
  const recommendations: string[] = [];

  const noUserRate = (errors.no_user_message || 0) / total;
  if (noUserRate > 0.05) {
    recommendations.push(
      `High 'no_user_message' rate (${(noUserRate * 100).toFixed(1)}%) - records missing user messages`
    );
  }

  const emptyRate = (errors.empty_user_message || 0) / total;
  if (emptyRate > 0.05) {
    recommendations.push(
      `Many empty messages (${(emptyRate * 100).toFixed(1)}%) - review data collection`
    );
  }

  const toolErrors =
    (errors.orphan_tool_result || 0) + (errors.missing_tool_call_id || 0);
  if (toolErrors > 0) {
    recommendations.push(
      `${toolErrors} tool chain errors - check tool call/result pairing`
    );
  }

  const tooShortRate = (errors.user_message_too_short || 0) / total;
  if (tooShortRate > 0.1) {
    recommendations.push(
      `${(tooShortRate * 100).toFixed(1)}% of messages too short - consider lowering minimum length threshold`
    );
  }

  const tokenExceeded = errors.exceeds_max_tokens || 0;
  if (tokenExceeded > 0) {
    recommendations.push(
      `${tokenExceeded} records exceed token limit - consider truncating or splitting long conversations`
    );
  }

  return recommendations;
}

/**
 * Validate a batch of records with deduplication
 */
export async function validateRecordsBatch(
  records: DatasetRecord[],
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): Promise<BatchValidationResult> {
  const validRecordIds = new Set<string>();
  const invalidRecords = new Map<string, ValidationError[]>();
  const errorCounts: Partial<Record<ValidationError, number>> = {};
  const seenHashes = new Set<string>();
  let duplicatesRemoved = 0;

  for (const record of records) {
    // Validate
    const result = validateRecord(record, config);

    if (!result.valid && result.error) {
      errorCounts[result.error] = (errorCounts[result.error] || 0) + 1;
      invalidRecords.set(record.id, [result.error]);
      continue;
    }

    // Deduplicate using spanId or content hash
    const hash = record.spanId || computeContentHash(record);
    if (seenHashes.has(hash)) {
      duplicatesRemoved++;
      errorCounts.duplicate = (errorCounts.duplicate || 0) + 1;
      invalidRecords.set(record.id, ['duplicate']);
      continue;
    }
    seenHashes.add(hash);

    validRecordIds.add(record.id);
  }

  const rejected = records.length - validRecordIds.size;
  const rejectionRate =
    records.length > 0
      ? `${((rejected / records.length) * 100).toFixed(1)}%`
      : '0%';

  const report: HygieneReport = {
    timestamp: new Date().toISOString(),
    total: records.length,
    valid: validRecordIds.size,
    rejected: rejected - duplicatesRemoved,
    rejectionRate,
    errorsByType: errorCounts,
    duplicatesRemoved,
    recommendations: generateRecommendations(errorCounts, records.length),
  };

  return { validRecordIds, invalidRecords, report };
}

/**
 * Quick validation check - returns true if record is valid
 */
export function isRecordValid(
  record: DatasetRecord,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): boolean {
  return validateRecord(record, config).valid;
}

/**
 * Get validation errors for a record (returns empty array if valid)
 */
export function getRecordValidationErrors(
  record: DatasetRecord,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationError[] {
  const result = validateRecord(record, config);
  return result.valid ? [] : result.error ? [result.error] : [];
}
