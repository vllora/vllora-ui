# 01 - Core Concepts

[← Back to Index](./00_INDEX.md)

---

## What is RFT?

**Reinforcement Fine-Tuning (RFT)** optimizes a model's behavior using:
- A dataset of **prompts** (inputs only)
- A **grader** (reward function) that scores outputs

### The Training Loop
```
prompt → model generates response → grader scores (0.0-1.0) → update weights → repeat
```

---

## RFT vs SFT

| Aspect | SFT (Supervised) | RFT (Reinforcement) |
|--------|------------------|---------------------|
| Training data | Prompt + ideal answer | **Prompt only** |
| Learning method | Copy the answer | Explore & optimize |
| Answer source | Human-provided | Model-generated |
| Grader role | N/A | Scores every output |

> **Key insight:** RFT does NOT require "gold answers" like SFT does.

---

## RFT Prompt Record Format

```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant..."},
    {"role": "user", "content": "What is the capital of France?"}
  ],
  "tools": [],
  "reference_answer": "Paris",
  "metadata": {
    "source": "trace",
    "topic": "geography",
    "difficulty": "easy"
  }
}
```

### Requirements
- `messages` **must end with `user` role**
- No assistant response (model generates during training)
- `reference_answer` is optional (grader metadata, not the answer)

---

## The `reference_answer` Field

This is **metadata for the grader**, NOT the expected assistant response.

| Use Case | Needed? |
|----------|---------|
| Comparing output to expected value | Yes |
| Text similarity checks | Yes |
| Code execution (test pass/fail) | No |
| Format validation (valid JSON?) | No |
| LLM-as-judge with rubric | No |

---

## Grader Template Variables

OpenAI graders use these templates:

| Variable | Description |
|----------|-------------|
| `{{sample.output_text}}` | Model's generated text |
| `{{sample.output_json}}` | Parsed JSON (if valid) |
| `{{sample.output_tools}}` | Model's tool calls |
| `{{item.reference_answer}}` | Reference from dataset |
| `{{item.field_name}}` | Any custom field |

---

## Key Terms

| Term | Definition |
|------|------------|
| **Trace** | Production log of LLM interaction |
| **Seed Prompt** | Prompt extracted from traces |
| **Synthetic Prompt** | Generated prompt to fill gaps |
| **Topic Tree** | Hierarchical taxonomy of categories |
| **Grader** | Function scoring outputs (0.0-1.0) |
| **Dry Run** | Pre-training grader validation |
| **Reward Hacking** | Model gaming the grader without real quality |

---

[Next: User Journey →](./02_User_Journey.md)
