# Finetune Workflow Guide

Detailed walkthrough of the full pipeline. Read SKILL.md first for the overview — this file adds depth to each step.

---

## Step 1: Define the Objective — In Depth

The objective shapes everything downstream: what topics you create, what data you generate, and what the grader rewards. Spend time getting it right.

### Asking the Right Questions

Beyond "what should the model do?", probe for:
- **Boundaries**: "What should it refuse to do?" — Every good objective has negative constraints.
- **Tone register**: "Should it be casual, professional, academic?" — Tone is hard to adjust after training.
- **Domain scope**: "Is there specific terminology or jargon it must use correctly?" — Domain accuracy matters.
- **Failure modes**: "What's the worst thing the model could do?" — Build your grader to penalize these.

### From Objective to System Prompt

Transform the objective into a concrete system prompt. The system prompt appears in every training conversation — it's how the model learns its role.

**Vague objective**: "Make a helpful coding assistant"

**Specific objective**: "Train a Python coding assistant that explains concepts with working code examples, uses type hints, follows PEP 8 conventions, acknowledges when a question is outside its expertise, and never generates code that could cause data loss without explicit warnings."

**System prompt**: "You are a Python coding assistant. You explain concepts clearly with working code examples that include type hints and follow PEP 8 conventions. If a question is outside your expertise, say so rather than guessing. When generating code that modifies or deletes data, include a clear warning."

---

## Step 2: Extract Documents — In Depth

### Choosing an Extraction Method

Pick the right tool for the job:

| Situation | Method | Why |
|-----------|--------|-----|
| Docker available, PDF has tables/images/complex layout | **Docling Serve** (hybrid chunk API) | Best quality — typed parts with tables, images, cross-references |
| No Docker, simple text-based PDF | **pdftotext** | Fast, no dependencies beyond poppler |
| Document is already markdown/text | **Skip extraction** | Read the file directly, proceed to topic building |

**Decision flow**: Check `curl -s http://127.0.0.1:5001/health` first. If Docling is running, use it. If not, and you have Docker, start it. If no Docker at all, fall back to pdftotext.

See `extraction-guide.md` for the complete Docling workflow — curl commands, response structure, knowledge_parts.json schema, and troubleshooting.

### Document Processing Strategy

When the user provides documents:

1. **Call Docling hybrid chunk API** — with `include_images=true` and `image_export_mode=embedded` to get complete extraction
2. **Read the document** — before writing any code, read the first 5-10 chunks to understand the document title, content type (textbook? reference? game collection?), heading patterns, and key entities. Then sample chunks from the middle and end. Note what the real section headings are vs noise (e.g., chess moves like "31... Rxd5" are NOT headings). Note domain-specific patterns that need special handling (game notation, formulas, multi-column layouts). This understanding is critical for writing a good extraction script.
3. **Write an extraction script** — dynamically create `knowledge_parts.json` from the response, tailored to the document. Use insights from step 2 to add domain-specific heading filters, noise removal, and the right image sourcing strategy (pictures[] vs pages{} fallback).
4. **Review the parts** — check that tables have headers/rows, images have base64 data, captions are linked
5. **Extract key concepts** — terms, procedures, and facts the model must know
6. **Note examples and edge cases** — real-world scenarios from the docs become training conversations
7. **Find gaps** — what does the document NOT cover that the objective requires?

### From Parts to Topics

The `knowledge_parts.json` output maps to your topic hierarchy:

- **Text parts** grouped by `extraction_path` → natural topic clusters
- **Table parts** may become their own topics (e.g., a comparison table → a "comparison" subtopic)
- **Image parts** provide context — figures illustrate concepts that become training scenarios
- Each document's `parts-index.json` is produced during extraction — a lightweight version of knowledge_parts.json with `{id, type, title, extraction_path, pages, content_preview, source_doc}` per part
- After all documents are processed, `knowledge/all-parts-index.json` merges all per-document indexes
- After topic design, the `relation-builder` subagent reads `all-parts-index.json` and `topics.json`, iteratively matches parts to topics using a retrieve-and-verify loop per leaf topic, and writes `relations.json`
- The mapping uses iterative retrieval+verification per topic, not single-pass classification — this produces higher-quality relations
- Group related parts under parent topics using `parent_id` for 2-3 levels of hierarchy

Example mapping (after JSON-decoding `extraction_path` strings):
```
knowledge_parts.json                                                    →  topics.json
  extraction_path: '["3 Model Architecture"]'                             →  topic: architecture (root)
  extraction_path: '["3 Model Architecture", "3.2 Attention"]'            →  topic: architecture/attention (leaf)
  type: "table", title: "3.4..."                                          →  topic: architecture/comparison (leaf)
```

### Organizing Extracted Knowledge

Keep extracted knowledge organized so you can reference it while generating data:

```
knowledge/
├── chess-tactics/              # Per-document subdirectory (slugified filename)
│   ├── docling-result.json    # Raw Docling response
│   ├── knowledge_parts.json   # Typed parts for this document
│   └── parts-index.json       # Part index for this document
├── strategy-guide/             # Second document
│   └── ...
├── all-parts-index.json       # Merged index across all documents
└── extraction-notes.md        # Summary with key concepts per document
```

The goal is having domain knowledge accessible when you write training prompts.

### Linking Knowledge to Topics and Records

After designing topics, the `relation-builder` subagent builds `relations.json` — a mapping of which parts are relevant to each topic. It reads `knowledge/all-parts-index.json` (merged across all documents) and `topics.json`, runs an iterative retrieve-and-verify loop per leaf topic, and writes the result. This keeps parts-index scanning out of main context.

During Step 6 (upload), `relations.json` is uploaded via the topic-source relations API:

```bash
if [ -f relations.json ]; then
  RELATIONS=$(cat relations.json)
  curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
    -H "Content-Type: application/json" \
    -d "{\"relations\": $RELATIONS}"
fi
```

This traceability helps during iteration — when a topic scores poorly in evaluation, you can query the relations to find the source parts and check whether the issue is missing knowledge, incorrect facts, or insufficient detail. See `topic-hierarchy.md` for the full approach.

---

## Step 3: Build Topic Hierarchy — In Depth

See `topic-hierarchy.md` for the full guide. Key additions:

### Two Approaches

**Topics-First** (have documents, no existing data):
1. Extract topics from document structure
2. Design hierarchy before generating any data
3. Generate data per-topic to ensure coverage

**Data-First** (have existing examples, no documents):
1. Start with seed records the user provides
2. Generate variants from those seeds
3. Create topics after to organize what you have
4. Fill gaps where needed

### The Balance Check

Before moving to evaluation, verify your dataset isn't lopsided. Count records per leaf topic:

```
billing/refunds:      18 records  ✓
billing/upgrades:     15 records  ✓
technical/api:         3 records  ✗ (under-represented)
technical/login:      22 records  ✓
account/permissions:   2 records  ✗ (under-represented)
```

Generate more data for under-represented topics before proceeding.

---

## Step 3.5: Categorize Existing Records — In Depth

If you have existing records (from seed data or a prior iteration), assign them to topics before generating new data. This ensures coverage analysis is accurate.

### Batch Topic Assignment via API

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/topics \
  -H "Content-Type: application/json" \
  -d '{"updates": [
    {"record_id": "rec-001", "topic": "billing/refunds"},
    {"record_id": "rec-002", "topic": "technical/api"}
  ]}'
```

Categorize all uncategorized records before running coverage analysis — uncategorized records create blind spots in the balance check.

---

## Step 4: Generate Training Data — In Depth

### The Generation Loop

Training data is **prompts only** — the model generates its own responses during training and the grader scores them. For each leaf topic:

1. **Set context**: Note the topic description, relevant knowledge chunks, and the system prompt
2. **Generate varied scenarios**: Use the per-topic checklist from SKILL.md
3. **Write the prompt**: System prompt → user message(s)
4. **Self-review**: Would this prompt elicit the behaviors from the objective?
5. **Add to JSONL file**: One JSON object per line

### RAG-Augmented Generation

This pipeline is inspired by the "Think Less, Label Better" approach (arXiv 2509.25736), which uses RAG at *data-generation time* (not inference time) to ground synthetic training examples in real domain knowledge. The key insight: retrieve relevant knowledge chunks before asking the LLM to generate questions — the LLM produces better, more specific prompts when it sees the actual source material.

Our pipeline supports two retrieval mechanisms (independent of each other):
1. **Topic-level RAG** (`--use-rag`, per topic): query = topic name + system_prompt → retrieves the most relevant chunks for the topic as a whole. All questions for that topic are generated from this shared context. **Optional** — only needed when relations are incomplete or absent.
2. **Source enrichment** (`--enrich-sources`, per question): query = the generated question itself → retrieves sharper, question-specific chunks. Each record gets its own `source_parts` tailored to what that specific question is asking. **Recommended** — supplements traceability after generation without polluting curated context. Independent of `--use-rag`, only requires `--workflow-id`.

> **Note on answer refinement:** The paper also has a refinement stage that rewrites LLM-generated answers using a second model. This does not apply to our pipeline — we generate **prompts only** for GRPO training. The fine-tuned model generates its own answers during training and the grader scores them. There is no answer to refine.

By default, `generate_records.py` gathers source material from pre-computed `relations.json`. With `--use-rag`, the script also queries the gateway's semantic search API dynamically:

1. **Query construction**: For each leaf topic, builds a search query from ancestor names + topic name + system_prompt (hierarchical context)
2. **Retrieval**: Calls `POST /finetune/workflows/{id}/knowledge/search` with the query and `top_k` (default 15)
3. **Deduplication**: Filters out parts already linked via relations.json (by part ID)
4. **Merge**: Appends RAG-retrieved parts after relation-linked parts. The existing 20-chunk cap applies to the combined list (curated relations get priority)

**When to use:**
- `--use-rag` — When relations exist but may be incomplete. RAG fills gaps without replacing curated mappings
- `--rag-only` — When skipping the relation-building step entirely. Useful for rapid prototyping or when the knowledge base is small enough that semantic search alone provides sufficient coverage
- `--enrich-sources` — Recommended for all runs. Enriches per-record `source_parts` with question-specific matches. Independent of `--use-rag`, only requires `--workflow-id`

**Embedding readiness**: Parts need embeddings before search works. The gateway's background job processes parts in batches of 32 every 30 seconds. After uploading knowledge, wait ~30s then verify: `finetune.py search-knowledge --workflow-id WF --phrase "test query"`

### Scenario Variation Techniques

To avoid repetitive prompts within a topic:

- **Rephrase the question**: "How do I get a refund?" → "I want my money back" → "Can you reverse a charge?"
- **Change specifics**: Different amounts, dates, product names, user situations
- **Vary complexity**: Simple yes/no → multi-step troubleshooting → escalation scenarios
- **Shift user emotion**: Neutral → frustrated → confused → demanding
- **Vary expected response depth**: Some prompts should elicit quick answers, others detailed walkthroughs

### Multi-turn Design

For multi-turn prompts, embed prior conversation context **inside the user message** — do NOT use `assistant` role messages. RFT uses prompts only (system + user), and `validate_dataset.py` will flag assistant messages as errors.

```
{"messages": [
  {"role": "system", "content": "You are..."},
  {"role": "user", "content": "I previously asked about handling file operations safely in Python, and you suggested using context managers. Now I want to know: what about writing to files?"}
], "id": "..."}
```

The prior conversation context is embedded in the user message itself. The model generates a fresh response and the grader scores it. See `reference/data-format.md` for more examples.

---

## Step 4.5: Generate Variants for Augmentation — In Depth

When you have good seed records but need more volume, generate variants rather than writing from scratch. Variants preserve the conversation structure and topic but change the final user message.

### Rules for Variants

1. **Only vary the final user message** — keep system prompt and conversation history identical
2. **Track lineage** — set `sourceRecordId` pointing to the original record
3. **3-5 variants per source** — enough for diversity without flooding a single scenario
4. **Vary along these axes**: phrasing, specificity, emotion, complexity, expected response depth

### Example

Source record (asking about refunds):
```json
{"id": "refund-001", "messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "How do I get a refund?"}]}
```

Variants:
```json
{"id": "refund-001-v1", "sourceRecordId": "refund-001", "messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "I want my money back for order #12345"}]}
{"id": "refund-001-v2", "sourceRecordId": "refund-001", "messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "Can you reverse a charge? I was double-billed."}]}
{"id": "refund-001-v3", "sourceRecordId": "refund-001", "messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "I'm frustrated — I requested a refund 3 days ago and heard nothing."}]}
```

---

## Step 5: Analyze Coverage — In Depth

### Computing Balance Score

```
For each leaf topic:
  actual_percentage = records_in_topic / total_records
  target_percentage = 1 / number_of_leaf_topics
  gap = |actual_percentage - target_percentage|

balance_score = 1 - (sum_of_gaps / 2)    // 0 to 1
```

| Score | Rating | What to Do |
|-------|--------|------------|
| 0.8-1.0 | Excellent | Proceed to grader |
| 0.6-0.8 | Good | Minor gaps, optional to fix |
| 0.4-0.6 | Fair | Generate more for weak topics |
| < 0.4 | Poor | Significant rebalancing needed |

---

## Step 6: Write the Grader — In Depth

See `grader-writing.md` for the full guide. The critical insight:

**Your grader is your training objective.** During fine-tuning, the model generates its own responses and the grader scores them. Whatever the grader rewards, the model learns to do. So:

- If your grader only checks response length → the model learns to write long
- If your grader only checks keyword presence → the model learns to stuff keywords
- If your grader checks accuracy + helpfulness + tone + completeness → the model learns all four

Design the grader to reward exactly the behaviors from your objective, and penalize the failure modes you identified.

---

## Step 6.5: Test the Grader Before Full Evaluation — In Depth

Run a mini evaluation on 3-5 records before committing to a full run. This catches grader bugs cheaply.

```bash
# Upload dataset, then run eval with limit=5
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --output-dir evaluations --limit 5
```

### Diagnostic Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| All scores 0 | Hard gate rejects everything | Loosen length/format checks |
| All scores 1 | Grader is a rubber stamp | Add meaningful criteria |
| Scores cluster at one value | No differentiation | Add more scoring dimensions |
| Reasons are generic | LLM judge prompt too vague | Make the prompt more specific |
| Reasons contradict score | Bug in scoring formula | Review the math |

Fix issues here — it's 10x cheaper than discovering them in a full evaluation.

---

## Step 7: Upload & Evaluate — In Depth

See `api-reference.md` for full endpoint documentation. Key workflow details:

### Upload Flow — Two Paths

**Path A: Workflow-integrated (recommended)**
1. Save records, topics, and evaluator via gateway local CRUD (Steps 3-5)
2. Gateway auto-uploads workflow data to the cloud when creating eval or training jobs (via `ensure_dataset_uploaded()`)
3. No manual upload step needed — the gateway handles sync automatically

**Path B: Direct workflow upload**
1. Write JSONL data to a file (e.g., `training.jsonl`)
2. Write grader to a file (e.g., `grader.js`)
3. Upload records: `python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --workflow-id $WF_ID --file training.jsonl`
4. Upload grader: `python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WF_ID --file grader.js`

### Evaluation Flow

1. Create an evaluation run: `POST /finetune/evaluations`
2. Track locally: `POST /finetune/workflows/{id}/eval-jobs` (for history)
3. Poll for results every 2-3 seconds: `GET /finetune/evaluations/{id}`
4. When `status` is `"completed"`, read per-record scores: `GET /finetune/workflows/{id}/records/scores`
5. Cancel if needed: `POST /finetune/workflows/{id}/jobs/{eval_id}/cancel`
6. Analyze the results

### What Happens During Evaluation

The backend takes each training prompt, feeds it to a rollout model (typically `gpt-4o-mini`) which generates a response, and runs your grader on that generated response. This tests whether your grader meaningfully differentiates good from bad responses.

### Re-uploading After Data Changes

After changing records, topics, or the evaluator, just re-upload the changed data via `finetune.py` commands. The gateway auto-uploads to the cloud when creating the next eval or training job (via `ensure_dataset_uploaded()`). No manual sync step needed.

---

## Step 8: Iterate — In Depth

See `iteration-strategy.md` for the full diagnostic framework.

### The Minimum Viable Iteration

1. Look at `summary.average_score` in the evaluation response
2. If it's > 0.6 with reasonable spread → GO, proceed to training
3. If not, look at the 5 lowest-scoring records
4. Read the grader's `reason` for each
5. Ask: "Is this a bad response, or is the grader wrong?"
6. Fix accordingly and re-evaluate

### When the Difficulty Probe Flags Trivial Prompts

If the difficulty probe (Step 7c+) reports many trivial prompts (score > 0.95), the user messages are too easy — all 8 completions score high, producing zero GRPO gradient. Use these techniques to make the user message harder while keeping the system prompt unchanged:

1. **Add Constraints** — add 2-3 extra requirements the answer must satisfy
2. **Deepen** — require "why/how" reasoning, not just "what" recall
3. **Increase Reasoning Steps** — require multi-step analysis where each step builds on the previous

See `readiness-gate.md` → "Fixing Trivial Prompts" for examples and rules.

### Typical Iteration Count

- First-time users: 3-5 iterations (learning the grader + data balance)
- Experienced users: 1-2 iterations (minor adjustments)
- Complex domains: 3-4 iterations (requires careful criteria tuning)

### Tracking Evaluator Versions

Every `PATCH /finetune/workflows/{id}/evaluator` creates a new version. View the history:

```bash
curl -s "http://localhost:9090/finetune/workflows/WORKFLOW_ID/evaluator/versions" | python3 -m json.tool
```

This shows git-style diffs between consecutive versions. Log version numbers in `iteration-log.md` alongside eval scores so you can trace which grader version produced which results. When starting a training job, you can pin a specific version via `evaluator_version` in the request body.

---

## Step 9: Train — In Depth

### Estimate Training Cost

Before committing to a training run, compare candidate models by cost and duration:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py estimate-training \
  --workflow-id $WORKFLOW_ID \
  --models "Qwen3.5-4B,Qwen3.5-0.8B"
```

This calls `POST /finetune/workflows/{id}/jobs/estimate` for all listed models in one request. If `config.json` includes `constraints` (`max_cost_usd`, `max_duration_minutes`), models exceeding limits are flagged and the agent narrows its selection accordingly.

### Base Model Selection

| Model | Parameters | Good For |
|-------|-----------|----------|
| `Qwen3.5-4B` | 4B | Fast experiments, narrow tasks |
| Larger models | 7B+ | Complex reasoning, broad domains |

Start with the smaller model for faster iteration. Scale up once you've validated your dataset and grader.

### Continuing from Previous Jobs

You can start new training from an earlier successful cloud job:

- `finetuned/{cloud_job_id}`: load final adapter from that job.
- `checkpointed/{cloud_job_id}`: load latest checkpoint from that job.

For checkpoint continuation, optional `resume_mode`:

- `weights-only` (default): restore adapter weights only.
- `full-state`: restore adapter and optimizer state when checkpoint contains `optimizer.pt`.

Example requests:

```bash
# Continue from final adapter
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "provider_finetune",
    "base_model": "finetuned/2b08db0e-6a5e-4d62-b89f-8d2e8b246d44",
    "output_model": "my-model-v2"
  }'
```

```bash
# Continue from latest checkpoint, restore full state when possible
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "provider_finetune",
    "base_model": "checkpointed/2b08db0e-6a5e-4d62-b89f-8d2e8b246d44",
    "resume_mode": "full-state",
    "output_model": "my-model-v3"
  }'
```

Continuation validation is mode-specific:
- `finetuned/{cloud_job_id}`: source job must be successful (`succeeded`).
- `checkpointed/{cloud_job_id}`: source job may be any terminal state (`succeeded`, `failed`, `cancelled`), which allows resuming from failed runs.

### Evaluating a Completed Fine-Tune

For post-training eval, use the same final-adapter model reference format:

```bash
TRAINED_MODEL="finetuned/${PROVIDER_JOB_ID}"
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-eval \
  --workflow-id $WORKFLOW_ID --model "$TRAINED_MODEL" --output-dir finetune-project/evaluations
```

`PROVIDER_JOB_ID` is the training job's `provider_job_id` (the cloud-side job ID). Do not pass raw `fine_tuned_model` or raw `provider_job_id` as the eval model; use `finetuned/<provider_job_id>`.

### Training Config Guidance (RFT/GRPO)

> **Note:** RFT needs significantly more epochs than SFT. The model must see each prompt multiple times, generating diverse responses each time, to learn from the reward signal. "Overfitting" in the SFT sense (memorization) is less of a concern because the model generates its own responses.

Adjust from the defaults (`finetune.py` uses lr=1e-6, beta=0.01, K=8, scale_rewards=none, adaptive epochs):
- **< 50 records**: epochs 8
- **50-200 records**: epochs 5
- **200-500 records**: epochs 3
- **> 500 records**: epochs 2 (arXiv:2505.22257: beyond ~80% of one epoch yields negligible gains)
- **Complex tasks**: Try `lora_rank: 16` for more model capacity
- **Simple tasks**: `lora_rank: 4` is sufficient and faster

### Monitoring Training

Poll `GET /finetune/workflows/{workflow_id}/jobs/{job_id}/status`. Watch for:
- `status: "running"` → Training is in progress
- `status: "succeeded"` → Model is ready to use
- `status: "failed"` → Check `error_message` field

You can also check per-epoch scores via `GET /finetune/workflows/{workflow_id}/finetune-evaluations` to see if the model is improving across training epochs.

### Monitoring Training Metrics

Poll `GET /finetune/workflows/{workflow_id}/jobs/{job_id}/metrics` while training runs. Key metrics:

| Metric | Healthy Range | Alert If |
|--------|--------------|----------|
| `reward` | Trending upward | Flat/declining after 50+ steps |
| `reward_std` | 0.05-0.30 | < 0.05 (collapsed) or > 0.30 (noisy) |
| `loss` | Decreasing | Increasing (diverging) |
| `kl` | Stable, < 0.5 | Rising > 1.5x over last steps |
| `grad_norm` | Stable | Spikes > 3x median |
| `completions/clipped_ratio` | < 0.20 | > 0.70 (critical — increase max_tokens) |
| `frac_reward_zero_std` | < 0.30 | > 0.60 (weak training signal) |

**Stop and investigate** if you see NaN/Inf in any metric, clipped ratio > 70%, or KL divergence rising sharply.

---

## Step 10: Test the Model — In Depth

### Systematic Testing

Test each topic area with queries the model hasn't seen in training:
- Use different phrasing than your training data
- Include edge cases not in the training set
- Test multi-turn conversations
- Try queries that should trigger refusal (if your objective includes constraints)

### Comparing to Base Model

Run the same test queries against both the base model and your fine-tuned model. Look for:
- Better adherence to the system prompt persona
- More accurate domain-specific responses
- Improved handling of edge cases
- Consistent tone and style

If the fine-tuned model isn't clearly better, your training data or grader may need more iteration.
