# 06 - Grader Setup

[← Back to Index](./00_INDEX.md) | [← Previous](./05_Coverage_Generation.md)

---

## Step 4 — Define Grader

**Purpose:** Configure how model outputs will be scored during training and dry run.

**When to Use:**
- Before running dry run
- After dry run shows grader issues  
- When changing evaluation criteria

---

## What is a Grader?

A **grader** (reward function) scores model outputs from **0.0 to 1.0**.

During RFT training:
```
prompt → model generates response → grader scores (0.0-1.0) → update weights
```

---

## Grader Types

We support **2 types** of graders:

| Type | Use Case | Configuration |
|------|----------|---------------|
| **LLM as a Judge** | Quality assessment, correctness, style | Prompt + JSON schema + model config |
| **Script** | Deterministic checks, format validation | JavaScript code |

---

## Type 1: LLM as a Judge

Uses an LLM to evaluate model outputs. Best for subjective quality assessment.

### Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Prompt** | ✅ | Evaluation prompt with mustache variables |
| **Output Schema** | ✅ | JSON schema defining expected response structure |
| **Model** | ✅ | Which model to use (e.g., `gpt-4o-mini`) |
| **Temperature** | Optional | Model temperature (default: 0) |
| **Max Tokens** | Optional | Max response tokens (default: 256) |

### Mustache Variables

Use these in your prompt to inject data:

| Variable | Description |
|----------|-------------|
| `{{messages}}` | Full conversation history (JSON array) |
| `{{response}}` | Model's generated response text |
| `{{lastUserMessage}}` | The last user message only |
| `{{tools}}` | Available tools (if any) |
| `{{toolCalls}}` | Tool calls made by model (if any) |
| `{{systemPrompt}}` | System prompt (if present) |

### Output Schema

The grader LLM must return structured JSON. Define the schema to extract the score.

**Example schema:**
```json
{
  "type": "object",
  "properties": {
    "score": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Overall quality score from 0 to 1"
    },
    "reasoning": {
      "type": "string",
      "description": "Explanation for the score"
    }
  },
  "required": ["score", "reasoning"]
}
```

### Example: Quality Grader

**Prompt:**
```
You are evaluating an AI assistant's response.

## Conversation
{{messages}}

## Assistant's Response
{{response}}

## Task
Rate the response quality on a scale of 0 to 1:
- 1.0 = Excellent: Accurate, helpful, well-formatted
- 0.7 = Good: Mostly correct with minor issues
- 0.4 = Fair: Partially addresses the question
- 0.1 = Poor: Wrong, unhelpful, or off-topic
- 0.0 = Fail: Completely wrong or harmful

Consider: accuracy, helpfulness, clarity, and relevance.
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "score": { "type": "number", "minimum": 0, "maximum": 1 },
    "reasoning": { "type": "string" }
  },
  "required": ["score"]
}
```

**Model Config:**
- Model: `gpt-4o-mini`
- Temperature: `0`
- Max Tokens: `256`

### Example: Tool Usage Grader

**Prompt:**
```
You are evaluating whether an AI assistant correctly used tools.

## Available Tools
{{tools}}

## User Request
{{lastUserMessage}}

## Assistant's Tool Calls
{{toolCalls}}

## Assistant's Response
{{response}}

## Evaluation Criteria
1. Did the assistant select the appropriate tool(s)?
2. Were the tool parameters correct and complete?
3. Did the assistant properly use the tool results in the response?

Rate from 0 to 1:
- 1.0 = All tools used correctly with proper parameters
- 0.5 = Correct tools but some parameter issues
- 0.0 = Wrong tools or completely incorrect usage
```

---

## Type 2: Script (JavaScript)

Write JavaScript code for deterministic checks. Best for format validation, keyword checks, or measurable criteria.

### Interface

```javascript
/**
 * @param {Object} input - The evaluation input
 * @param {Array} input.messages - Conversation history
 * @param {string} input.response - Model's response text
 * @param {Array} input.toolCalls - Tool calls made (if any)
 * @param {Object} input.metadata - Record metadata
 * @returns {number} Score from 0.0 to 1.0
 */
function grade(input) {
  // Your logic here
  return score;
}
```

### Example: JSON Validity Check

```javascript
function grade(input) {
  try {
    JSON.parse(input.response);
    return 1.0;
  } catch (e) {
    return 0.0;
  }
}
```

### Example: Length Check

```javascript
function grade(input) {
  const length = input.response.length;
  
  if (length < 50) return 0.3;      // Too short
  if (length < 500) return 1.0;     // Good
  if (length < 1000) return 0.7;    // Acceptable  
  return 0.4;                        // Too long
}
```

### Example: Required Keywords

```javascript
function grade(input) {
  const response = input.response.toLowerCase();
  const required = ['conclusion', 'recommendation'];
  
  let found = 0;
  for (const keyword of required) {
    if (response.includes(keyword)) found++;
  }
  
  return found / required.length;
}
```

### Example: Tool Call Validation

```javascript
function grade(input) {
  const toolCalls = input.toolCalls || [];
  
  if (toolCalls.length === 0) {
    return 0.0; // Expected tool usage
  }
  
  // Check each tool call has valid JSON arguments
  for (const call of toolCalls) {
    try {
      JSON.parse(call.function.arguments);
    } catch (e) {
      return 0.5; // Tool used but invalid args
    }
  }
  
  return 1.0; // All good
}
```

---

## Combining Graders

You can use **multiple graders** with weighted averaging:

| Grader | Type | Weight |
|--------|------|--------|
| Quality | LLM Judge | 60% |
| Format Valid | Script | 20% |
| Length Check | Script | 20% |

**Final Score:** `0.6 * quality + 0.2 * format + 0.2 * length`

---

## Grader Anti-Patterns

| Problem | Symptom | Fix |
|---------|---------|-----|
| Too lenient | All scores > 0.9 | Add stricter criteria in prompt |
| Too strict | All scores < 0.1 | Relax criteria or lower expectations |
| No variance | Std < 0.1 | LLM judge may be too vague — be specific |
| Expensive | Slow dry run | Use `gpt-4o-mini` instead of `gpt-4o` |
| Inconsistent | Same input, different scores | Lower temperature to 0 |

---

## Testing Your Grader

Before running a full dry run, test on a few samples:

1. Click **[🧪 Test Sample]** in Step 4
2. System runs grader on 5 random records
3. Review scores and reasoning
4. Adjust prompt/script if needed

---

## Data Structures

```typescript
// Grader configuration stored in Dataset
interface GraderConfig {
  type: 'llm-judge' | 'script';
  
  // For LLM Judge
  prompt?: string;              // Mustache template
  outputSchema?: JSONSchema;    // Expected response structure
  model?: string;               // e.g., "gpt-4o-mini"
  temperature?: number;         // Default: 0
  maxTokens?: number;           // Default: 256
  
  // For Script
  script?: string;              // JavaScript code
  
  // Common
  weight?: number;              // For multi-grader (0-1)
}

// Multi-grader config
interface MultiGraderConfig {
  graders: GraderConfig[];
  weights: number[];            // Must sum to 1
}

// Grader result
interface GraderResult {
  score: number;                // 0.0 - 1.0
  reasoning?: string;           // From LLM judge
  error?: string;               // If grader failed
}
```

---

[Next: Dry Run Validation →](./07_Dry_Run_Validation.md)
