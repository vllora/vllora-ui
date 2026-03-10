# Training Data Format

## JSONL Structure

Training data uses JSONL format — one JSON object per line. Each line is a **prompt** the model will practice on during training. The model generates its own responses — the grader scores them. You only need to provide the system prompt and user messages.

```jsonl
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "..."}], "id": "record-1"}
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "A follow-up scenario..."}], "id": "record-2"}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `messages` | Yes | Array of conversation messages (system + user prompts) |
| `id` | Yes | Unique identifier for tracking in evaluation results |

### Message Roles

| Role | Purpose | Rules |
|------|---------|-------|
| `system` | Sets the model's behavior/persona | Optional. At most one. Must be first if present. |
| `user` | User input/question | At least one required. Content must be non-empty. |

### Validation Rules

A valid training record must:
1. Have at least one `user` message
2. Have non-empty content for all messages
3. User messages should be at least 10 characters
4. If `system` is present, it must be the first message

---

## Example: Single-turn

```json
{"messages": [
  {"role": "system", "content": "You are a customer support agent for Acme SaaS. You respond with empathy and accuracy."},
  {"role": "user", "content": "I was charged twice for my subscription last month. Can I get a refund?"}
], "id": "billing-refunds-001"}
```

## Example: Multi-turn

For multi-turn scenarios, include the conversation history as context so the model understands what follow-up it's responding to:

```json
{"messages": [
  {"role": "system", "content": "You are a senior Python developer who explains concepts clearly with code examples."},
  {"role": "user", "content": "How do I handle file operations safely in Python?"},
  {"role": "assistant", "content": "Use context managers (the `with` statement). This guarantees cleanup even if an exception occurs."},
  {"role": "user", "content": "What about writing to files?"}
], "id": "python-file-ops-001"}
```

In multi-turn examples, prior assistant messages serve as **conversation context** — they set up the scenario for the final user message. The model will generate a fresh response to the last user turn, and the grader will score it.

---

## Quality Guidelines

### What Makes Good Training Data

Good training data defines the **practice scenarios** the model works on during training. The grader — not reference answers — teaches the model what "good" looks like. So focus your effort on creating diverse, realistic prompts.

**Diversity** — Cover many scenarios within each topic:
- Happy paths (straightforward questions with clear answers)
- Edge cases (unusual or boundary conditions)
- Error scenarios (what to do when things go wrong)
- Ambiguous queries (questions that need clarification)
- Multi-turn conversations (follow-up questions, drilling deeper)

**Realism** — Mirror how actual users interact:
- Use natural language, not overly formal queries
- Include typos, abbreviations, and casual phrasing in user messages
- Vary the level of context the user provides

**Consistency** — Use the same system prompt across all records within a dataset. Varying it confuses the model about its role.

### Common Issues and Fixes

| Issue | Why It's Bad | Fix |
|-------|-------------|-----|
| Too few records per topic (<5) | Model undertrained on that area | Generate more for that topic |
| No edge cases | Model fails on unusual inputs | Add error handling, ambiguous queries |
| Very long conversations (>10 turns) | Training less efficient | Split into shorter 2-6 turn conversations |
| Repetitive phrasing | Model overfits to specific wording | Vary user question style and word choices |
| All prompts same complexity | Model doesn't learn range | Mix simple yes/no with multi-step troubleshooting |

### Dataset Size Guidelines

| Size | Total Records | Records per Topic | Good For |
|------|--------------|-------------------|----------|
| Small | 50-100 | 5-10 | Quick experiments, narrow domains |
| Medium | 100-500 | 10-25 | Production fine-tunes |
| Large | 500-2000 | 20-50 | Complex domains with many topics |

For most use cases, start with **100-200 records** across 5-10 topics. You can always add more based on evaluation results.
