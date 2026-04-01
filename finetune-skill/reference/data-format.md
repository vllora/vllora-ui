# Training Data Format

## JSONL Structure

Training data uses JSONL format — one JSON object per line. Each line is a **prompt** the model will practice on during training. The model generates its own responses — the grader scores them. You only need to provide the system prompt and user messages.

```jsonl
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "..."}], "id": "record-1", "topic": "billing/refunds", "source_parts": ["p-001", "p-003"]}
{"messages": [{"role": "system", "content": "You are..."}, {"role": "user", "content": "A follow-up scenario..."}], "id": "record-2", "topic": "billing/refunds", "source_parts": ["p-002"]}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `messages` | Yes | Array of conversation messages (system + user prompts) |
| `id` | Yes | Unique identifier for tracking in evaluation results |
| `topic` | No | Leaf topic ID this record belongs to (e.g., `"billing/refunds"`) |
| `source_parts` | No | Array of knowledge part IDs used as grounding material for this record. Enables traceability from record → source document sections. Part IDs reference entries in `knowledge/{doc-slug}/knowledge_parts.json` (per-document subdirectories, named by slugified filename). |
| `ground_truth` | No | Optional evaluator-side reference string exposed as `input.ground_truth`. Often this is a concise source excerpt, but it can be any text you intentionally want the grader to use during evaluation. |

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

## Example: With ground_truth

```json
{"messages": [
  {"role": "system", "content": "You are an expert chess tutor who teaches tactical patterns clearly."},
  {"role": "user", "content": "What is the difference between a pin and a skewer in chess?"}
], "id": "tactics-001", "topic": "tactics/basics", "source_parts": ["chess-p-012", "chess-p-015"], "ground_truth": "A pin occurs when an attacking piece threatens a less valuable piece that cannot move without exposing a more valuable piece behind it. A skewer is the reverse: the more valuable piece is in front and must move, exposing the less valuable piece behind it."}
```

## Example: Multi-turn Context

For multi-turn scenarios, embed prior conversation turns directly in the user message as context. Do **not** use `assistant` role messages — `validate_dataset.py` will flag them as errors since RFT uses prompts only:

```json
{"messages": [
  {"role": "system", "content": "You are a senior Python developer who explains concepts clearly with code examples."},
  {"role": "user", "content": "I previously asked about handling file operations safely in Python, and you suggested using context managers (the `with` statement). Now I want to know: what about writing to files?"}
], "id": "python-file-ops-001"}
```

Multi-turn context is embedded in the user message itself, not as separate conversation turns. The model will generate a fresh response, and the grader will score it.

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
