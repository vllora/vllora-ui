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

- **Text parts** grouped by `heading_path` → natural topic clusters
- **Table parts** may become their own topics (e.g., a comparison table → a "comparison" subtopic)
- **Image parts** provide context — figures illustrate concepts that become training scenarios
- Use `heading_path` values as `sourceChunkRefs` in topics.json (e.g., `"document-name:3.2 Attention"`)
- Group related parts under parent topics for 2-3 levels of hierarchy

Example mapping:
```
knowledge_parts.json                    →  topics.json
  heading_path: ["3 Model Architecture"]  →  topic: architecture (root)
  heading_path: ["3 Model Architecture",
    "3.2 Attention"]                      →  topic: architecture/attention (leaf)
  type: "table", heading: "3.4..."        →  topic: architecture/comparison (leaf)
```

### Organizing Extracted Knowledge

Keep extracted knowledge organized so you can reference it while generating data:

```
knowledge/
├── docling-result.json     # Raw Docling response (chunks + document)
├── knowledge_parts.json    # Typed parts: text, table, image (agent-created)
├── document-extraction.md  # Human-readable summary with key concepts
└── ...                     # Additional files per document
```

The goal is having domain knowledge accessible when you write training prompts.

### Linking Knowledge to Topics and Records

As you extract knowledge, keep a mental (or written) map of which parts relate to which topics. When you build the topic hierarchy later, add `sourceChunkRefs` to each topic node pointing back to the relevant parts (e.g., `"document-name:3.2 Attention"`).

This traceability helps during iteration — when a topic scores poorly in evaluation, you can quickly find the source material to check whether the issue is missing knowledge, incorrect facts, or insufficient detail. See `topic-hierarchy.md` for the full approach.

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

## Step 4: Generate Training Data — In Depth

### The Generation Loop

Training data is **prompts only** — the model generates its own responses during training and the grader scores them. For each leaf topic:

1. **Set context**: Note the topic description, relevant knowledge chunks, and the system prompt
2. **Generate varied scenarios**: Use the per-topic checklist from SKILL.md
3. **Write the prompt**: System prompt → user message(s)
4. **Self-review**: Would this prompt elicit the behaviors from the objective?
5. **Add to JSONL file**: One JSON object per line

### Scenario Variation Techniques

To avoid repetitive prompts within a topic:

- **Rephrase the question**: "How do I get a refund?" → "I want my money back" → "Can you reverse a charge?"
- **Change specifics**: Different amounts, dates, product names, user situations
- **Vary complexity**: Simple yes/no → multi-step troubleshooting → escalation scenarios
- **Shift user emotion**: Neutral → frustrated → confused → demanding
- **Vary expected response depth**: Some prompts should elicit quick answers, others detailed walkthroughs

### Multi-turn Design

For multi-turn prompts, include prior conversation context so the model knows what follow-up it's responding to:

```
{"messages": [
  {"role": "system", "content": "You are..."},
  {"role": "user", "content": "Broad question"},
  {"role": "assistant", "content": "Brief context from prior turn"},
  {"role": "user", "content": "Follow-up drilling into one detail"}
], "id": "..."}
```

The prior assistant messages are **conversation context**, not training targets. The model generates a fresh response to the final user message and the grader scores it. Keep multi-turn prompts to 2-4 user turns.

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

## Step 7: Upload & Evaluate — In Depth

See `api-reference.md` for full endpoint documentation. Key workflow details:

### Upload Flow

1. Write your JSONL data to a file (e.g., `training.jsonl`)
2. Write your grader to a file (e.g., `grader.js`)
3. Upload both together via `POST /finetune/datasets`
4. Save the returned `dataset_id` — you need it for everything else

### Evaluation Flow

1. Create an evaluation run: `POST /finetune/evaluations`
2. Poll for results every 2-3 seconds: `GET /finetune/evaluations/{id}`
3. When `status` is `"completed"`, analyze the results

### What Happens During Evaluation

The backend takes each training prompt, feeds it to a rollout model (typically `gpt-4o-mini`) which generates a response, and runs your grader on that generated response. This tests whether your grader meaningfully differentiates good from bad responses.

### Re-uploading After Data Changes

When you change the JSONL data, you must re-upload the entire dataset with a **new** `dataset_id`. The old backend dataset ID becomes stale. When you only change the grader, use `PATCH /finetune/workflows/{id}/evaluator` — no re-upload needed.

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

### Typical Iteration Count

- First-time users: 3-5 iterations (learning the grader + data balance)
- Experienced users: 1-2 iterations (minor adjustments)
- Complex domains: 3-4 iterations (requires careful criteria tuning)

---

## Step 9: Train — In Depth

### Base Model Selection

| Model | Parameters | Good For |
|-------|-----------|----------|
| `unsloth/Qwen3.5-4B` | 4B | Fast experiments, narrow tasks |
| Larger models | 7B+ | Complex reasoning, broad domains |

Start with the smaller model for faster iteration. Scale up once you've validated your dataset and grader.

### Training Config Guidance

The defaults work well for most cases. Adjust if:
- **Low data (<50 records)**: Reduce `epochs` to 1 to avoid overfitting
- **Large data (>500 records)**: Can increase `epochs` to 3-4
- **Complex tasks**: Try `lora_rank: 16` for more model capacity
- **Simple tasks**: `lora_rank: 4` is sufficient and faster

### Monitoring Training

Poll `GET /finetune/workflows/{workflow_id}/jobs/{job_id}/status`. Watch for:
- `status: "running"` → Training is in progress
- `status: "succeeded"` → Model is ready to use
- `status: "failed"` → Check `error_message` field

You can also check per-epoch scores via `GET /finetune/datasets/{dataset_id}/finetune-evaluations` to see if the model is improving across training epochs.

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
