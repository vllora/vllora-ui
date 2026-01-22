# 03 - Data Sanitization

[← Back to Index](./00_INDEX.md) | [← Previous](./02_User_Journey.md)

---

## Step A — Sanitize Data

**Purpose:** Clean raw traces and remove malformed records BEFORE investing time in categorization.

**Input:** `DatasetRecord[]` (records with `DataInfo` payload)  
**Output:** Validated `DatasetRecord[]`, `HygieneReport`

---

## Data Structures

```typescript
// Your existing structures
export interface DatasetRecord {
  id: string;
  datasetId: string;
  data: unknown;               // DataInfo payload
  metadata?: Record<string, unknown>;
  spanId?: string;
  topic?: string;
  is_generated?: boolean;
  evaluation?: DatasetEvaluation;
  createdAt: number;
  updatedAt: number;
}

export interface DataInfo {
  input: {
    messages?: Message[];
    tools?: Tool[];
    tool_choice?: string;
  };
  output: {
    messages?: Message[] | Message;
    tool_calls?: ToolCall[];
    finish_reason?: string;
  };
}

// Supporting types
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}
```

---

## Why Sanitize First?

1. **Avoid wasted effort** - Don't categorize broken records
2. **Grader compatibility** - Malformed data crashes graders
3. **Training quality** - Noisy data = noisy training signal
4. **Cost savings** - Don't pay to process invalid records

---

## Validation Pipeline

### 1. Extract RFT Prompts from Records

Convert `DatasetRecord` with `DataInfo` into RFT prompt format.

```typescript
interface RFTPrompt {
  messages: Message[];
  tools?: Tool[];
  metadata: {
    recordId: string;
    spanId?: string;
  };
}

function extractRFTPrompt(record: DatasetRecord): RFTPrompt | null {
  const dataInfo = record.data as DataInfo;
  
  if (!dataInfo?.input?.messages?.length) {
    return null;
  }
  
  const messages = dataInfo.input.messages;
  
  // RFT needs prompt ending with user message
  // Find the last user message position
  const lastUserIdx = findLastIndex(messages, m => m.role === 'user');
  
  if (lastUserIdx === -1) {
    return null;
  }
  
  // Take messages up to and including last user message
  const promptMessages = messages.slice(0, lastUserIdx + 1);
  
  return {
    messages: promptMessages,
    tools: dataInfo.input.tools,
    metadata: {
      recordId: record.id,
      spanId: record.spanId,
    },
  };
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
```

### 2. Validation Checks

| Check | Reason | Action |
|-------|--------|--------|
| `data` is valid `DataInfo` | Core structure | REJECT |
| `input.messages` array exists | Required for RFT | REJECT |
| Each message has valid `role` | system/user/assistant/tool | REJECT |
| **Last message is `user`** | RFT requirement | REJECT |
| User message not empty | No task to learn | REJECT |
| Tool calls have `id` | Required for matching | REJECT |
| Tool results have matching `tool_call_id` | Orphan results | REJECT |
| Token count < max | Context overflow | REJECT |

### 3. Validation Result Types

```typescript
type ValidationError =
  | 'invalid_data_structure'
  | 'missing_messages'
  | 'empty_messages'
  | 'invalid_role'
  | 'last_not_user'
  | 'empty_user_message'
  | 'user_message_too_short'
  | 'orphan_tool_result'
  | 'missing_tool_call_id'
  | 'exceeds_max_tokens'
  | 'duplicate';

interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
  details?: string;
}

interface ValidationConfig {
  minUserMessageLength: number;  // default: 10
  maxTokens: number;             // default: 8000
  allowedRoles: Set<string>;     // default: system, user, assistant, tool
}

const DEFAULT_CONFIG: ValidationConfig = {
  minUserMessageLength: 10,
  maxTokens: 8000,
  allowedRoles: new Set(['system', 'user', 'assistant', 'tool']),
};
```

---

## Complete Validation Code

```typescript
function validateRecord(
  record: DatasetRecord,
  config: ValidationConfig = DEFAULT_CONFIG
): ValidationResult {
  // 1. Check data structure
  const dataInfo = record.data as DataInfo;
  
  if (!dataInfo || typeof dataInfo !== 'object') {
    return { valid: false, error: 'invalid_data_structure' };
  }
  
  // 2. Check messages exist
  const messages = dataInfo.input?.messages;
  
  if (!messages) {
    return { valid: false, error: 'missing_messages' };
  }
  
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: 'empty_messages' };
  }
  
  // 3. Validate each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // Check role
    if (!msg.role || !config.allowedRoles.has(msg.role)) {
      return { 
        valid: false, 
        error: 'invalid_role',
        details: `Message ${i} has invalid role: ${msg.role}`,
      };
    }
  }
  
  // 4. Check last message is user
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') {
    return { valid: false, error: 'last_not_user' };
  }
  
  // 5. Validate user messages have content
  const userMessages = messages.filter(m => m.role === 'user');
  for (const userMsg of userMessages) {
    const content = userMsg.content;
    
    if (!content || (typeof content === 'string' && !content.trim())) {
      return { valid: false, error: 'empty_user_message' };
    }
    
    if (typeof content === 'string' && content.trim().length < config.minUserMessageLength) {
      return { valid: false, error: 'user_message_too_short' };
    }
  }
  
  // 6. Validate tool chain integrity
  const toolChainResult = validateToolChain(messages);
  if (!toolChainResult.valid) {
    return toolChainResult;
  }
  
  // 7. Check token limit (approximate)
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

function estimateTokens(messages: Message[]): number {
  // Rough approximation: 4 chars ≈ 1 token
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
```

---

## Batch Sanitization

```typescript
interface HygieneReport {
  timestamp: string;
  total: number;
  valid: number;
  rejected: number;
  rejectionRate: string;
  errorsByType: Record<ValidationError, number>;
  duplicatesRemoved: number;
  recommendations: string[];
}

async function sanitizeRecords(
  records: DatasetRecord[],
  config: ValidationConfig = DEFAULT_CONFIG
): Promise<{
  validRecords: DatasetRecord[];
  report: HygieneReport;
}> {
  const validRecords: DatasetRecord[] = [];
  const errorCounts: Record<string, number> = {};
  const seenHashes = new Set<string>();
  let duplicatesRemoved = 0;
  
  for (const record of records) {
    // Validate
    const result = validateRecord(record, config);
    
    if (!result.valid) {
      const errorType = result.error || 'unknown';
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      continue;
    }
    
    // Deduplicate using spanId or content hash
    const hash = record.spanId || computeContentHash(record);
    if (seenHashes.has(hash)) {
      duplicatesRemoved++;
      continue;
    }
    seenHashes.add(hash);
    
    validRecords.push(record);
  }
  
  const report: HygieneReport = {
    timestamp: new Date().toISOString(),
    total: records.length,
    valid: validRecords.length,
    rejected: records.length - validRecords.length - duplicatesRemoved,
    rejectionRate: `${((records.length - validRecords.length) / records.length * 100).toFixed(1)}%`,
    errorsByType: errorCounts as Record<ValidationError, number>,
    duplicatesRemoved,
    recommendations: generateRecommendations(errorCounts, records.length),
  };
  
  return { validRecords, report };
}

function computeContentHash(record: DatasetRecord): string {
  const dataInfo = record.data as DataInfo;
  const content = JSON.stringify(dataInfo.input?.messages || []);
  // Simple hash - in production use crypto
  return content.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(36);
}

function generateRecommendations(
  errors: Record<string, number>, 
  total: number
): string[] {
  const recommendations: string[] = [];
  
  const lastNotUserRate = (errors['last_not_user'] || 0) / total;
  if (lastNotUserRate > 0.1) {
    recommendations.push(
      `High 'last_not_user' rate (${(lastNotUserRate * 100).toFixed(1)}%) - check trace extraction logic`
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
  
  return recommendations;
}
```

---

## Hygiene Report Example

```typescript
const report: HygieneReport = {
  timestamp: "2025-01-22T10:00:00Z",
  total: 12453,
  valid: 11892,
  rejected: 473,
  rejectionRate: "4.5%",
  errorsByType: {
    last_not_user: 156,
    empty_user_message: 98,
    orphan_tool_result: 67,
    invalid_role: 45,
    user_message_too_short: 52,
    exceeds_max_tokens: 43,
    missing_tool_call_id: 12,
  },
  duplicatesRemoved: 88,
  recommendations: [
    "High 'last_not_user' rate - check trace extraction logic",
    "79 tool chain errors - check tool call/result pairing"
  ],
};
```

---

## Usage Example

```typescript
import { sanitizeRecords } from './sanitization';

async function prepareDataset(records: DatasetRecord[]) {
  const { validRecords, report } = await sanitizeRecords(records, {
    minUserMessageLength: 10,
    maxTokens: 8000,
    allowedRoles: new Set(['system', 'user', 'assistant', 'tool']),
  });
  
  console.log(`Sanitization complete:`);
  console.log(`  Valid: ${report.valid} (${100 - parseFloat(report.rejectionRate)}%)`);
  console.log(`  Rejected: ${report.rejected}`);
  console.log(`  Duplicates: ${report.duplicatesRemoved}`);
  
  if (report.recommendations.length > 0) {
    console.log(`\nRecommendations:`);
    report.recommendations.forEach(r => console.log(`  - ${r}`));
  }
  
  return validRecords;
}
```

---

## UI Display

```
┌─────────────────────────────────────────────┐
│ Data Sanitization                           │
├─────────────────────────────────────────────┤
│ Input: 12,453 records                       │
│                                             │
│ Processing... ████████████████████ 100%     │
│                                             │
│ Results:                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ ✓ Valid records:     11,892 (95.5%)     │ │
│ │ ✗ Rejected:             473 (3.8%)      │ │
│ │   - Last not user:      156             │ │
│ │   - Empty message:       98             │ │
│ │   - Tool chain error:    79             │ │
│ │   - Too short:           52             │ │
│ │   - Other:               88             │ │
│ │ ⊘ Duplicates removed:    88 (0.7%)      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [View Rejected] [Download Report] [Next →]  │
└─────────────────────────────────────────────┘
```

---

See [Code Reference](./10_Code_Reference.md) for additional implementations.

---

[Next: Topic & Categorization →](./04_Topic_Categorization.md)
