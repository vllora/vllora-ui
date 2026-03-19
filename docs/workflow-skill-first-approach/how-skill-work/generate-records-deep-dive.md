# How Record Generation Works — Deep Dive

The data generation step (Step 4) produces the actual training records — the prompts the model will practice on during fine-tuning. This document explains the generation strategy, how records are grounded in source material, the LLM calls involved, and the validation process.

## What Records Are

A training record is a **prompt** — a system message + user message that the model will respond to during training. The model generates its own response, and the grader scores it. You only provide the input side.

```json
{
  "messages": [
    {"role": "system", "content": "You are an expert chess tutor...\n\nSpecialize in: tactical chess patterns and combinations.\n\nFocus on: fork tactics — knight forks, pawn forks, queen forks."},
    {"role": "user", "content": "Explain the knight fork and when it's most effective"}
  ],
  "id": "forks-001",
  "topic": "forks",
  "source_parts": ["chess-tactics-chapter-3-forks", "strategy-guide-section-5"]
}
```

**Key insight**: This is **RFT (Reinforcement Fine-Tuning)** — no assistant messages are included. The model learns by generating responses and getting scored by the grader, not by copying reference answers.

**Note**: The system message is a **composed prompt** — it combines the root persona (`--system-prompt`), ancestor topic system_prompts, and the leaf topic's system_prompt. See [System Prompt Composition](#system-prompt-composition) below for details.

## The Generation Flow

```
  topics.json ──────────────────────┐
                                    │
  relations.json ───────────────────┤
                                    ▼
  {doc-slug}/knowledge_parts.json   ┌─────────────────────────┐
  (full content per doc)  ────►│  For each leaf topic:    │
                               │  1. Find linked parts    │
                               │  2. Read part content    │
                               │  3. Build LLM prompt     │
                               │  4. Call chat_completion  │──► LLM API
                               │  5. Parse response       │    (gpt-4o-mini)
                               │  6. Write records        │
                               └────────────┬────────────┘
                                            │
                                            ▼
                                    training.jsonl
                                    (grows incrementally,
                                     one topic at a time)
```

## Step-by-Step Process

### 1. Load structured data

The agent reads:
- **`topics.json`** — to identify leaf topics (topics that aren't parents of any other topic)
- **`relations.json`** — to find which parts are linked to each topic
- **`{doc-slug}/knowledge_parts.json`** — to read the full content of linked parts

```python
# Identify leaf topics
parent_ids = {t['parent_id'] for t in topics if t['parent_id']}
leaves = [t for t in topics if t['id'] not in parent_ids]
```

### 2. For each leaf topic: gather source material

```python
# Find parts linked to this topic
part_ids = [r['part_identifier'] for r in relations
            if r['topic_identifier'] == topic['id']]

# Read full content from the relevant {doc-slug}/knowledge_parts.json
chunks = [parts[pid] for pid in part_ids if pid in parts]
```

The source material gives the LLM concrete content to generate grounded prompts from — not generic questions, but questions that reference specific concepts, examples, and details from the documents.

### 3. Build the LLM prompt

The agent constructs a meta-prompt that asks the LLM to generate training prompts:

```
Generate 10 diverse user prompts for fine-tuning.

Topic: Forks
Focus: Focus on fork tactics — knight forks, pawn forks, queen forks

Source material:
[chess-tactics-chapter-3-forks] Chapter 3: Fork Tactics
The fork is a tactic where a single piece attacks two or more pieces...
---
[strategy-guide-section-5] Common Fork Patterns
Knight forks are the most common. The knight's unique movement...

Each prompt should be a realistic question/request grounded in the source material.
Vary: difficulty, tone, type (explain-why, compare, what-if, analyze, teach-me).
Return JSON: {"prompts": ["prompt1", "prompt2", ...]}
```

### 4. Call the LLM via `generate_records.py`

The primary method is `scripts/generate_records.py`, which automates the full generation loop:

```bash
uv run scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are an expert chess tutor..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 10
```

The script:
1. Loads topics, relations, and all knowledge parts from per-document `knowledge_parts.json` files
2. Finds leaf topics (topics that aren't parents of any other topic) and builds a topic index via `build_topic_index()`
3. For each leaf topic: walks up the hierarchy via `get_ancestor_chain()` to collect ancestors, then calls `compose_system_prompt()` to build a hierarchical system prompt from the root persona + ancestor system_prompts + leaf system_prompt
4. Gathers linked source chunks via `relations.json`, calls `chat_completion.py` to generate grounded user prompts, writes records incrementally with the composed system prompt
5. Reports progress per topic and summarizes failures at the end

**Customizing generation**: Adapt `--records-per-topic`, `--model`, and `--temperature` to the project.

If some topics fail, use `--append` to retry only the missing ones without overwriting existing records:
```bash
uv run scripts/generate_records.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge-dir finetune-project/knowledge \
  --system-prompt "You are an expert chess tutor..." \
  --output finetune-project/training.jsonl \
  --records-per-topic 10 \
  --append
```

**Under the hood**: `generate_records.py` calls `scripts/chat_completion.py` for each LLM request. `chat_completion.py` reads a JSON request from stdin, calls the OpenAI API, and writes the response to stdout. It validates JSON output when `response_format` is `json_object`.

**Time per call**: 3-10 seconds depending on the model and prompt length.

### 5. Parse and write records

The LLM returns a JSON object with a `prompts` array. The agent wraps each prompt into a full training record:

```python
# Compose hierarchical system prompt for this leaf topic
ancestors = get_ancestor_chain(topic, topic_index)
composed_prompt = compose_system_prompt(root_system_prompt, ancestors, topic)

for prompt_text in llm_response['prompts']:
    record = {
        'messages': [
            {'role': 'system', 'content': composed_prompt},  # root + ancestors + leaf
            {'role': 'user', 'content': prompt_text}
        ],
        'id': f'{topic_id}-{counter:03d}',
        'topic': topic_id,
        'source_parts': part_ids  # traceability
    }
    # Append to training.jsonl
```

Records are written incrementally — `training.jsonl` grows as each topic is processed.

## Generation Strategies

### Single pass (basic)

One LLM call per leaf topic, generating 10 prompts each.
- **Pros**: Fast, simple
- **Cons**: May miss edge cases, limited diversity

### Multi-pass

Multiple rounds with different prompt styles:
1. **Pass 1**: Basic questions (explain, describe, define)
2. **Pass 2**: Edge cases (what-if, unusual scenarios, error conditions)
3. **Pass 3**: Multi-turn (follow-up questions building on prior context)

### Variant generation (Step 4.5)

If some topics are under-represented after the initial pass:
1. Identify under-represented topics (< 50% of average record count per topic)
2. Select seed records from those topics
3. Call `chat_completion.py` asking the LLM to create 3-5 variants per seed — same scenario, different specifics/difficulty/tone
4. Each variant gets `source_record_id` pointing to the original seed record for lineage tracking
5. Keep system prompt and prior turns unchanged — vary only the final user message
6. Append variants to `training.jsonl`

**Checking for under-representation**:
```bash
python3 -c "
import json, collections
c = collections.Counter()
for line in open('finetune-project/training.jsonl'):
    c[json.loads(line).get('topic','?')] += 1
avg = sum(c.values()) / len(c)
for t, n in c.most_common():
    flag = ' ← needs variants' if n < avg * 0.5 else ''
    print(f'  {t}: {n}{flag}')
"
```

## System Prompt Composition

Each training record gets a **composed** system prompt, not just the root `--system-prompt`. The `compose_system_prompt()` function in `generate_records.py` builds it by walking the topic hierarchy:

1. **`build_topic_index(topics)`** — creates a lookup dict from topic ID to topic dict
2. **`get_ancestor_chain(topic, topic_index)`** — walks from leaf to root via `parent_id`, returns `[root, ..., parent]` (excludes the leaf)
3. **`compose_system_prompt(root_prompt, ancestors, leaf)`** — joins segments with `\n\n`:
   - `root_prompt` (the `--system-prompt` CLI argument — the model persona)
   - Each ancestor's `system_prompt` (falls back to `"Specialize in: {name}"` if missing)
   - The leaf's `system_prompt` (falls back to `"Focus on: {name}"` if missing)

**Example**: For a 3-level topic hierarchy with leaf topic "Knight Forks":

```
Root persona:     "You are an expert chess tutor who teaches tactical and strategic concepts."
Root topic:       "Specialize in: tactical chess patterns and combinations."
Leaf topic:       "Focus on: knight fork tactics — attacking king and rook simultaneously."
```

The composed prompt in `messages[0].content` becomes all three segments joined by `\n\n` (target: 50-150 words total, 3 segments for a 3-level hierarchy).

Records for different leaf topics get **different composed prompts**, even though they share the same root persona and may share intermediate ancestors. This gives each topic's training records a progressively narrower focus.

---

## Record Format — What Each Field Means

| Field | Required | Example | Purpose |
|-------|----------|---------|---------|
| `messages` | Yes | `[{role, content}, ...]` | The training prompt (system + user) |
| `id` | Yes | `"forks-001"` | Unique ID, appears in eval results |
| `topic` | No | `"forks"` | Links record to topic for coverage analysis |
| `source_parts` | No | `["chess-tactics-ch3"]` | Links record to source material for traceability |

### Message roles in training records

| Role | When to include | Count |
|------|----------------|-------|
| `system` | Always (sets the model persona) | Exactly 1, first message |
| `user` | Always (the prompt to practice on) | At least 1 |

**Important**: RFT records contain only `system` + `user` messages — no `assistant` messages. `validate_dataset.py` will flag assistant messages as errors. For multi-turn context, embed prior conversation turns directly in the user message.

## Validation (Step 5.5)

Before upload, `validate_dataset.py` checks every record:

| Check | What it catches |
|-------|----------------|
| Valid JSON | Malformed lines |
| Has `messages` array | Missing required field |
| Has `id` | Missing required field |
| Has at least one `user` message | System-only records |
| User message ≥ 10 chars | Empty or trivially short prompts |
| No assistant-only messages | Records that don't follow RFT format |
| No duplicate IDs | Collision from multiple generation passes |
| Record count ≥ 50 | Too few records for meaningful training |

## How Records Flow to the Gateway

Records are uploaded **immediately after generation** (not at the end) via `finetune.py`:

```bash
uv run scripts/finetune.py upload-records --workflow-id $WORKFLOW_ID --file training.jsonl
```

The script transforms each record from skill format to gateway format automatically:

```python
# training.jsonl (skill format — what the agent writes)
{"messages": [...], "id": "forks-001", "topic": "forks", "source_parts": ["chess-tactics-ch3"]}

# ↓ finetune.py transforms to gateway format ↓

# POST /finetune/workflows/{id}/records body
{
  "records": [{
    "id": "forks-001",
    "data": {"input": {"messages": [...]}, "output": {}},
    "topic": "forks",
    "metadata": "{\"source_parts\": [\"chess-tactics-ch3\"]}",
    "is_generated": true
  }]
}
```

Key transformations:
- `messages` moves into `data.input.messages`
- `source_parts` moves into stringified `metadata`
- `output` is set to empty object (RFT — model generates its own output)
- Records are batched 200 per API call to avoid large payloads

The gateway DB stores the **wrapped format** (`data.input.messages`). The UI handles both formats via `extractMessages()` — checking for `data.input.messages` (gateway) and `data.messages` (OpenAI).

## How to Monitor Progress

### During generation

```bash
# Records generated so far
wc -l finetune-project/training.jsonl 2>/dev/null || echo "not started"

# Records per topic
python3 -c "
import json, collections
c = collections.Counter()
for line in open('finetune-project/training.jsonl'):
    c[json.loads(line).get('topic','unknown')] += 1
for t, n in c.most_common():
    print(f'  {t}: {n}')
print(f'Total: {sum(c.values())}')
" 2>/dev/null
```

### After upload (gateway DB)

```bash
DB=~/.vllora/vllora.db
WF_ID=$(sqlite3 $DB "SELECT id FROM workflows ORDER BY created_at DESC LIMIT 1;")

# Total records
sqlite3 $DB "SELECT COUNT(*) FROM workflow_records WHERE workflow_id='$WF_ID';"

# Records per topic
sqlite3 $DB "SELECT topic, COUNT(*) FROM workflow_records WHERE workflow_id='$WF_ID' GROUP BY topic;"

# Sample record format
sqlite3 $DB "SELECT substr(data,1,200) FROM workflow_records WHERE workflow_id='$WF_ID' LIMIT 1;"
```

## Common Issues

### Few or no records generated

| Symptom | Cause | Fix |
|---------|-------|-----|
| 0 records | LLM API key missing or invalid | Check if `OPENAI_API_KEY` is set |
| 0 records | `chat_completion.py` not found | Check `scripts/chat_completion.py` exists (or `.claude/skills/vllora-finetune/scripts/` if installed) |
| <10 records per topic | LLM returned fewer prompts than requested | Re-run with explicit count in prompt |
| All records in one topic | Agent only processed one leaf topic | Check if it looped over all leaves |

### Records not grounded in source material

- **Symptom**: Prompts are generic ("Tell me about chess") instead of specific ("Explain the Lucena position from Chapter 8")
- **Cause**: `relations.json` is empty, or the generation prompt didn't include source material
- **Check**: Look at `source_parts` in records — empty arrays mean no grounding

### Duplicate or repetitive prompts

- **Cause**: Low temperature, or same prompt template reused without variation
- **Fix**: Use temperature ≥ 0.7, vary prompt types (explain-why, compare, what-if, analyze, teach-me)

### Records have assistant messages (wrong format)

- **Cause**: The LLM generated full conversations instead of prompts only
- **Check**: `python3 -c "import json; [print(l.strip()[:100]) for l in open('training.jsonl') if '\"assistant\"' in l]"`
- **Fix**: Validation script catches this — remove assistant messages, keep only system + user

### Topic distribution is heavily skewed

- **Symptom**: One topic has 50 records, another has 3
- **Fix**: Run Step 4.5 (variant generation) for under-represented topics, or add another generation pass targeting the weak topics
- **Check**:
```bash
python3 -c "
import json, collections
c = collections.Counter()
for line in open('finetune-project/training.jsonl'):
    c[json.loads(line).get('topic','?')] += 1
avg = sum(c.values()) / len(c)
for t, n in c.most_common():
    flag = ' ⚠️' if n < avg * 0.5 else ''
    print(f'  {t}: {n}{flag}')
"
```
