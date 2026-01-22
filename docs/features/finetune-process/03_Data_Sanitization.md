# 03 - Data Sanitization

[← Back to Index](./00_INDEX.md) | [← Previous](./02_User_Journey.md)

---

## Step A — Sanitize Data

**Purpose:** Clean raw traces and remove malformed records BEFORE investing time in categorization.

**Input:** `raw_traces.jsonl`  
**Output:** `sanitized_prompts.jsonl`, `hygiene_report.json`

---

## Why Sanitize First?

1. **Avoid wasted effort** - Don't categorize broken records
2. **Grader compatibility** - Malformed data crashes graders
3. **Training quality** - Noisy data = noisy training signal
4. **Cost savings** - Don't pay to process invalid records

---

## Validation Pipeline

### 1. Extract Prompts from Traces

Convert full conversation traces into RFT prompt format (state before assistant responds).

```python
def extract_prompts(trace: dict) -> list[dict]:
    """Extract prompt candidates from a trace"""
    messages = trace.get("messages", [])
    candidates = []
    
    for i, msg in enumerate(messages):
        if msg["role"] == "assistant":
            prompt_messages = messages[:i]
            if prompt_messages and prompt_messages[-1]["role"] == "user":
                candidates.append({
                    "messages": prompt_messages,
                    "tools": trace.get("tools"),
                    "metadata": {"trace_id": trace.get("id")}
                })
    
    return candidates
```

### 2. Structural Validation

| Check | Reason | Action |
|-------|--------|--------|
| Valid JSON | Can't parse | REJECT |
| `messages` array exists | Core structure | REJECT |
| Each message has `role` | Required field | REJECT |
| Each message has `content` | Required field | REJECT |
| `role` is valid enum | system/user/assistant/tool | REJECT |
| **Last message is `user`** | RFT requirement | REJECT |

### 3. Content Validation

| Check | Reason | Action |
|-------|--------|--------|
| User message not empty | No task to learn | REJECT |
| Min length (default: 10 chars) | Too short = ambiguous | REJECT |
| No null content values | Template errors | REJECT |
| No control characters | Encoding issues | REJECT |

### 4. Tool Chain Validation

| Check | Reason | Action |
|-------|--------|--------|
| Tool calls have `id` | Required for matching | REJECT |
| Tool results have matching `tool_call_id` | Orphan results | REJECT |
| No circular references | Invalid chain | REJECT |

### 5. Length Validation

| Check | Reason | Action |
|-------|--------|--------|
| Total tokens < max (default: 8000) | Context overflow | REJECT |

### 6. Deduplication

| Check | Reason | Action |
|-------|--------|--------|
| Exact duplicate | Wastes training budget | DEDUPE |
| Near-duplicate (optional) | Reduces diversity | DEDUPE or WARN |

---

## Quick Validation Code

```python
def validate_prompt(record: dict, config: dict = None) -> tuple[bool, str]:
    """Validate a single prompt record"""
    config = config or {}
    
    # Structure
    if "messages" not in record:
        return False, "missing_messages"
    
    messages = record["messages"]
    if not messages:
        return False, "empty_messages"
    
    if messages[-1].get("role") != "user":
        return False, "last_not_user"
    
    # Content
    for i, msg in enumerate(messages):
        if msg.get("role") not in {"system", "user", "assistant", "tool"}:
            return False, f"invalid_role_{i}"
        
        content = msg.get("content")
        if msg["role"] == "user":
            if not content or not content.strip():
                return False, "empty_user_message"
            if len(content.strip()) < config.get("min_length", 10):
                return False, "user_message_too_short"
    
    # Tool chain
    if has_tools(record):
        valid, err = validate_tool_chain(record)
        if not valid:
            return False, err
    
    return True, "ok"
```

---

## Hygiene Report

```json
{
  "timestamp": "2025-01-22T10:00:00Z",
  "input_file": "raw_traces.jsonl",
  "output_file": "sanitized_prompts.jsonl",
  "statistics": {
    "total_traces": 12453,
    "prompts_extracted": 15234,
    "valid_prompts": 11892,
    "rejected": 3342,
    "duplicates_removed": 412,
    "rejection_rate": "21.9%"
  },
  "errors_by_type": {
    "last_not_user": 1523,
    "empty_user_message": 892,
    "invalid_json": 234,
    "orphan_tool_result": 312,
    "exceeds_max_tokens": 156,
    "user_message_too_short": 225
  },
  "recommendations": [
    "High 'last_not_user' rate - check trace extraction logic",
    "Many empty messages - review data collection"
  ]
}
```

---

## UI Display

```
┌─────────────────────────────────────────────┐
│ Data Sanitization                           │
├─────────────────────────────────────────────┤
│ Input: 12,453 raw traces                    │
│                                             │
│ Processing... ████████████████████ 100%     │
│                                             │
│ Results:                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ ✓ Valid prompts:     11,892 (78.1%)     │ │
│ │ ✗ Rejected:           3,342 (21.9%)     │ │
│ │   - Last not user:    1,523             │ │
│ │   - Empty message:      892             │ │
│ │   - Invalid JSON:       234             │ │
│ │   - Tool chain error:   312             │ │
│ │   - Other:              381             │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [View Rejected Samples] [Download Report]   │
│                                             │
│                            [Continue →]     │
└─────────────────────────────────────────────┘
```

---

See [Code Reference](./10_Code_Reference.md) for complete validation implementations.

---

[Next: Topic & Categorization →](./04_Topic_Categorization.md)
