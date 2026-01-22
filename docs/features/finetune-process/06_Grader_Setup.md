# 06 - Grader Setup

[← Back to Index](./00_INDEX.md) | [← Previous](./05_Coverage_Generation.md)

---

## Action G — Define Grader

**Trigger:** `[Define Grader]` button in Dataset Details  
**Can Repeat:** ✅ Yes - iterate on grader configuration anytime

**Purpose:** Configure how model outputs will be scored during training and dry run.

**When to Use:**
- Before running dry run
- After dry run shows grader issues  
- When changing evaluation criteria
- To test different grader configurations

---

## What is a Grader?

A **grader** (reward function) scores model outputs from **0.0 to 1.0**.

During RFT training:
```
prompt → model generates response → grader scores (0.0-1.0) → update weights
```

---

## Grader Types (OpenAI)

| Type | Use Case | Example |
|------|----------|---------|
| `string_check` | Exact/contains match | Check for keywords |
| `text_similarity` | Fuzzy matching | Compare to reference |
| `score_model` | LLM-as-judge | Quality assessment |
| `python` | Custom logic | Code execution, JSON validation |
| `multi` | Combine graders | Weighted average of dimensions |

---

## Preset Configurations

### Preset: Correctness

```json
{
  "type": "multi",
  "graders": {
    "accuracy": {
      "type": "score_model",
      "model": "gpt-4o-mini",
      "input": [
        {
          "role": "user",
          "content": "Rate the factual accuracy of this response (0-1):\n\nQuestion: {{item.user_message}}\nResponse: {{sample.output_text}}"
        }
      ],
      "range": [0, 1]
    },
    "completeness": {
      "type": "score_model",
      "model": "gpt-4o-mini",
      "input": [
        {
          "role": "user",
          "content": "Does this response fully address the question? Rate 0-1:\n\n{{sample.output_text}}"
        }
      ],
      "range": [0, 1]
    }
  },
  "calculate_output": "0.7 * accuracy + 0.3 * completeness"
}
```

### Preset: Format Compliance

```json
{
  "type": "multi",
  "graders": {
    "valid_json": {
      "type": "python",
      "source": "import json\ntry:\n    json.loads(sample['output_text'])\n    return 1.0\nexcept:\n    return 0.0"
    },
    "has_required_fields": {
      "type": "python",
      "source": "import json\ntry:\n    obj = json.loads(sample['output_text'])\n    required = ['result', 'status']\n    return 1.0 if all(k in obj for k in required) else 0.5\nexcept:\n    return 0.0"
    }
  },
  "calculate_output": "0.5 * valid_json + 0.5 * has_required_fields"
}
```

### Preset: Tool Usage

```json
{
  "type": "multi",
  "graders": {
    "tool_selected": {
      "type": "python",
      "source": "tools = sample.get('output_tools', [])\nreturn 1.0 if len(tools) > 0 else 0.0"
    },
    "tool_params_valid": {
      "type": "python",
      "source": "# Check if tool parameters are valid JSON\nimport json\nfor tool in sample.get('output_tools', []):\n    try:\n        json.loads(tool.get('arguments', '{}'))\n    except:\n        return 0.0\nreturn 1.0"
    },
    "result_used": {
      "type": "score_model",
      "model": "gpt-4o-mini",
      "input": [
        {
          "role": "user",
          "content": "Did the assistant appropriately use the tool results in its response? Rate 0-1.\n\nResponse: {{sample.output_text}}"
        }
      ],
      "range": [0, 1]
    }
  },
  "calculate_output": "0.3 * tool_selected + 0.3 * tool_params_valid + 0.4 * result_used"
}
```

### Preset: Conciseness

```json
{
  "type": "multi",
  "graders": {
    "answers_question": {
      "type": "score_model",
      "model": "gpt-4o-mini",
      "input": [
        {
          "role": "user",
          "content": "Does this response answer the question? Rate 0-1.\n\nQuestion: {{item.user_message}}\nResponse: {{sample.output_text}}"
        }
      ],
      "range": [0, 1]
    },
    "conciseness": {
      "type": "python",
      "source": "length = len(sample['output_text'])\nif length < 50:\n    return 0.5  # Too short\nelif length < 500:\n    return 1.0  # Good\nelif length < 1000:\n    return 0.7  # Acceptable\nelse:\n    return 0.3  # Too long"
    }
  },
  "calculate_output": "0.6 * answers_question + 0.4 * conciseness"
}
```

---

## Custom Grader Builder

For advanced users who need custom dimensions:

### Multi-Grader Structure

```json
{
  "type": "multi",
  "graders": {
    "dimension_1": { ... },
    "dimension_2": { ... },
    "dimension_3": { ... }
  },
  "calculate_output": "w1 * dimension_1 + w2 * dimension_2 + w3 * dimension_3"
}
```

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{sample.output_text}}` | Model's generated text |
| `{{sample.output_json}}` | Parsed JSON (if valid) |
| `{{sample.output_tools}}` | Tool calls made |
| `{{item.user_message}}` | Last user message |
| `{{item.reference_answer}}` | Reference (if provided) |
| `{{item.field_name}}` | Any custom field |

---

## Grader Anti-Patterns

| Problem | Symptom | Fix |
|---------|---------|-----|
| Too lenient | All scores > 0.9 | Add stricter criteria |
| Too strict | All scores < 0.1 | Relax criteria or use SFT first |
| No variance | Std < 0.1 | Add discriminating dimensions |
| Reward hacking | High scores, bad outputs | Add multiple orthogonal dimensions |
| Expensive | Slow training | Use cheaper models for some dimensions |

---

## UI Mockup

```
┌─────────────────────────────────────────────┐
│ Define Evaluation Function                  │
├─────────────────────────────────────────────┤
│ How should model outputs be scored?         │
│                                             │
│ ● Use Preset                                │
│   [Tool Usage ▼]                            │
│                                             │
│   This preset measures:                     │
│   • tool_selected (30%) - Correct tool?     │
│   • tool_params (30%) - Valid parameters?   │
│   • result_used (40%) - Used appropriately? │
│                                             │
│ ○ Custom Configuration                      │
│   Build your own multi-grader               │
│                                             │
│ [Preview Grader] [Test on Sample]           │
│                                             │
│                            [Continue →]     │
└─────────────────────────────────────────────┘
```

---

[Next: Dry Run Validation →](./07_Dry_Run_Validation.md)
