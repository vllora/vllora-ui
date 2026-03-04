# Skill Package — Implementation Plan

## Overview

~26 files changed across 3 repos. Zero backend changes. Zero new APIs. One new dependency (JSZip).

Three categories of work:
1. **Unify generation** — Remove RFT/SFT branching, always produce user + assistant + score (Phases 1–2)
2. **Add skill packaging step** — State machine, tools, plan system (Phases 3–5)
3. **Cleanup + docs** — Delete dead code, update agent defs, update docs (Phases 6–8)

---

## Phase 1: Unify Primary Generation (`generate-initial-data.ts`)

### File: `src/lib/distri-finetune-tools/steps/generate-initial-data.ts`

**Effort**: Large (this is the biggest change — 1,138 lines, 3 RFT/SFT branching points)

#### Change 1: Remove mode-specific prompt templates

**Remove** (3 separate templates):
- `INITIAL_DATA_GENERATION_USER_RFT` (lines ~292-317)
- `INITIAL_DATA_GENERATION_USER_SFT` (lines ~319-346)
- `INITIAL_DATA_GENERATION_USER_STRUCTURED_RFT` (lines ~348-393)

**Replace with** one unified template:

```typescript
const INITIAL_DATA_GENERATION_USER = `Generate {{count}} diverse training examples for the following objective:

Training Objective:
{{objective}}
{{user_guidance}}
{{system_prompt_section}}
{{topic_context}}
{{knowledge_context}}
Generate a JSON array of complete conversation examples. Each example should demonstrate the ideal assistant behavior for this objective.

For each example, provide:
- user_message: A realistic user message/query that a real user would send
- assistant_response: An ideal, helpful response from the assistant described above
- expected_score: Quality score 0.0-1.0 rating how well this example represents the training objective (1.0 = perfect example, 0.5 = adequate, below 0.3 = weak)

${DIVERSITY_GUIDELINES}

Output Format:
{
  "examples": [
    {
      "user_message": "User's question or request...",
      "assistant_response": "Helpful and accurate response...",
      "expected_score": 0.85
    },
    ...
  ]
}

Generate exactly {{count}} examples.`;
```

#### Change 2: Remove mode-specific response schemas

**Remove** (2 separate schemas):
- `INITIAL_DATA_RESPONSE_SCHEMA_RFT` (lines ~395-419)
- `INITIAL_DATA_RESPONSE_SCHEMA_SFT` (lines ~421-446)

**Replace with** one unified schema:

```typescript
const INITIAL_DATA_RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "initial_training_data",
    strict: true,
    schema: {
      type: "object",
      properties: {
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              user_message: { type: "string" },
              assistant_response: { type: "string" },
              expected_score: { type: "number" },
            },
            required: ["user_message", "assistant_response", "expected_score"],
            additionalProperties: false,
          },
        },
      },
      required: ["examples"],
      additionalProperties: false,
    },
  },
};
```

#### Change 3: Update `GeneratedExample` interface

```typescript
// Before:
interface GeneratedExample {
  system_prompt?: string;
  user_message: string;
  assistant_response?: string;  // Optional
}

// After:
interface GeneratedExample {
  system_prompt?: string;
  user_message: string;
  assistant_response: string;   // Always present
  expected_score: number;        // Always present
}
```

#### Change 4: Simplify `exampleToDataInfo()`

Remove the `mode` parameter and RFT/SFT branching. Output is always empty (fine-tuning format):

```typescript
function exampleToDataInfo(
  example: GeneratedExample,
  tools: any[],
  systemPrompt: string,
): DataInfo {
  return {
    input: {
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: example.user_message },
      ],
      tools,
    },
    output: {},
  };
}
```

#### Change 5: Store skill data in record metadata

Update record construction (both topic-based and standard batch):

```typescript
// Topic-based generation (lines ~882-895):
const topicRecords = examples.map((example) => ({
  data: exampleToDataInfo(example, seedTools, topicPrompt),
  is_generated: true,
  topic: job.topic.name,
  metadata: {
    generation_source: "initial_data",
    generated_at_ms: Date.now(),
    topic_path: job.topic.path.join(" > "),
    sourceChunkRefs: job.topic.sourceChunkRefs?.length
      ? job.topic.sourceChunkRefs
      : fallbackChunkRefs,
    skillResponse: example.assistant_response,
    baseScore: example.expected_score,
  },
}));

// Standard batch generation (lines ~987-997):
const batchRecords = examples.map((example) => ({
  data: exampleToDataInfo(example, seedTools, genericSystemPrompt),
  is_generated: true,
  metadata: {
    generation_source: "initial_data",
    generated_at_ms: Date.now(),
    batch_index: batchIndex,
    sourceChunkRefs: fallbackChunkRefs,
    skillResponse: example.assistant_response,
    baseScore: example.expected_score,
  },
}));
```

#### Change 6: Remove `generation_mode` parameter threading

- Remove `mode` parameter from `callLLMForInitialData()` function signature
- Remove template/schema selection logic (lines ~501-551)
- Remove `generation_mode` from tool parameter schema
- Update `INITIAL_DATA_GENERATION_SYSTEM` constant to remove SFT/RFT mentions

#### Change 7: Update system prompt constant

```typescript
// Before:
"- For SFT mode, include helpful assistant responses"
"- For RFT mode, only generate the user prompt"

// After:
"- Always include a helpful assistant response demonstrating ideal behavior"
"- Rate each example with an expected_score (0.0-1.0) based on quality and relevance to the objective"
```

#### Change 8: Keep all generated records (no score-based filtering)

All generated records are saved to IndexedDB regardless of `expected_score`. No auto-discarding.

```typescript
// In callLLMForInitialData() or its caller:
// 1. Generate batch of examples (each has expected_score)
const batch = await callLLMForInitialData(topic, targetCount, llmClient);

// 2. Save ALL records — no filtering by expected_score
// Low-scored examples may be useful as negative demonstrations
// (multi-shot prompting: "this is a weak response, avoid this pattern")
const records = batch.map(example => ({
  data: exampleToDataInfo(example, seedTools, topicPrompt),
  metadata: {
    skillResponse: example.assistant_response,
    baseScore: example.expected_score,  // Stored as signal, not as filter gate
    // ... other metadata fields
  },
}));

// 3. User sees all records with scores in UI
// 4. User can tell Lucy to remove low-scored records if they want
// 5. Whatever remains in IndexedDB goes into skill package + fine-tuning
```

**Key design decisions**:
- **No threshold filtering** — all generated records are kept. Scores are informational.
- **User decides** — they see base_score in the UI and can tell Lucy to remove records.
- **Low-scored examples have value** — can serve as negative demonstrations in multi-shot prompting.
- **Both base_score and eval_scores** are included in JSONL output for maximum flexibility.
- **Filtering is a downstream decision**, not a generation-time decision.

---

## Phase 2: Unify Secondary Generation (`generate-traces/`)

The `generate-traces/` directory is a secondary generation system used by `generate_synthetic_data`. It currently has completely separate files for RFT and SFT modes. These must be unified to match the new single-mode approach.

### File: `src/lib/distri-dataset-tools/analysis/generate-traces/types.ts`

**Effort**: Small

#### Change 1: Remove `generation_mode` from params

```typescript
// Before:
export interface GenerateTracesParams {
  // ...
  generation_mode?: 'rft' | 'sft';
}

// After: Remove the generation_mode field entirely
export interface GenerateTracesParams {
  // ... (no generation_mode)
}
```

#### Change 2: Remove `generationMode` from task type

```typescript
// Before:
export interface TopicGenerationTask {
  // ...
  generationMode: 'rft' | 'sft';
}

// After: Remove the generationMode field entirely
export interface TopicGenerationTask {
  // ... (no generationMode)
}
```

### File: `src/lib/distri-dataset-tools/analysis/generate-traces/rft-generator.ts`

**Effort**: Medium — this file stays as the unified generator (renamed conceptually)

This file currently generates varied user messages with empty output. It must be updated to also produce `assistant_response` and `expected_score` in record metadata.

#### Change 1: Update `buildRFTDataInfo()` → `buildTraceDataInfo()`

```typescript
// Before: builds DataInfo with empty output only
export function buildRFTDataInfo(rec: SyntheticTraceRecord, tools: any[]): DataInfo {
  // ... normalizes messages, returns { input: { messages, tools }, output: { messages: undefined } }
}

// After: same DataInfo shape (output stays empty for fine-tuning),
// but the function is renamed for clarity
export function buildTraceDataInfo(rec: SyntheticTraceRecord, tools: any[]): DataInfo {
  // Same logic — output stays empty
  // assistant_response and baseScore go into record.metadata (handled by caller)
}
```

#### Change 2: Update batch prompts to request all 3 fields

The `BATCH_RFT_VARIATION_PROMPT` and `BATCH_RFT_FIRST_MESSAGE_PROMPT` in `prompts.ts` currently only ask for `user_messages: string[]`. Update to request:

```typescript
// Before (prompts.ts):
BATCH_RFT_RESPONSE_SCHEMA = { user_messages: string[] }

// After (prompts.ts):
BATCH_GENERATION_RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "batch_generation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              user_message: { type: "string" },
              assistant_response: { type: "string" },
              expected_score: { type: "number" },
            },
            required: ["user_message", "assistant_response", "expected_score"],
            additionalProperties: false,
          },
        },
      },
      required: ["examples"],
      additionalProperties: false,
    },
  },
}
```

#### Change 3: Update `generateBatchRFTRecords()` return shape

Currently returns `SyntheticTraceRecord[]` with only user messages. Must also carry `assistant_response` and `expected_score` through to the caller (via SyntheticTraceRecord or a new field).

**Option**: Add optional metadata fields to `SyntheticTraceRecord`:

```typescript
// types.ts
export interface SyntheticTraceRecord {
  topic_path: string[];
  persona: string;
  messages: SyntheticMessage[];
  // NEW — carried through to record.metadata by caller
  skillResponse?: string;
  baseScore?: number;
}
```

### File: `src/lib/distri-dataset-tools/analysis/generate-traces/sft-generator.ts`

**Effort**: Small

#### Change 1: Add `expected_score` to SFT output

The SFT generator currently produces full multi-turn conversations. We need to:
- Add `expected_score` to the assistant turn schema (or generate a score after the conversation completes)
- Store the final assistant response as `skillResponse` in the trace record

**Approach**: After `simulateConversation()` completes, extract the last assistant message's content as `skillResponse` and generate a self-assessment score.

```typescript
// In simulateConversation(), before returning:
const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
return {
  topic_path: topicPath,
  persona,
  messages,
  skillResponse: lastAssistantMsg?.content ?? '',
  baseScore: undefined, // SFT path may skip self-scoring
};
```

### File: `src/lib/distri-dataset-tools/analysis/generate-traces/prompts.ts`

**Effort**: Medium

#### Change 1: Rename and update batch prompts

```typescript
// Rename constants:
BATCH_RFT_VARIATION_PROMPT → BATCH_VARIATION_PROMPT
BATCH_RFT_FIRST_MESSAGE_PROMPT → BATCH_FIRST_MESSAGE_PROMPT
BATCH_RFT_RESPONSE_SCHEMA → BATCH_GENERATION_RESPONSE_SCHEMA

// Update prompt text to request all 3 fields instead of just user_messages
```

#### Change 2: Update RFT_USER_VARIATION_PROMPT

```typescript
// Rename: RFT_USER_VARIATION_PROMPT → USER_VARIATION_PROMPT
// Content stays similar but now requests assistant_response + expected_score too
```

### File: `src/lib/distri-dataset-tools/analysis/generate-traces/index.ts`

**Effort**: Medium

#### Change 1: Remove mode branching in `generateSingleRecord()`

```typescript
// Before (lines 76-141):
if (task.generationMode === "rft") {
  // RFT path
} else {
  // SFT path
}

// After: Single path — always use the batch/variation approach
// Remove the SFT branch entirely (multi-turn simulation is no longer needed)
// The unified generator always produces user_message + assistant_response + expected_score
```

#### Change 2: Remove mode branching in `generateRecordsForTopic()`

```typescript
// Before (lines 351-415):
if (task.generationMode === "rft") {
  return generateRFTRecordsForTopic(task, personaCache, callbacks);
}
// SFT mode: per-record generation...

// After: Always use the batch path (no mode check)
return generateRecordsForTopic(task, personaCache, callbacks);
```

#### Change 3: Remove `generation_mode` from `generateTraces()`

```typescript
// Before (line 434):
const { generation_mode = "rft", ... } = params;

// After: Remove generation_mode destructuring entirely
```

#### Change 4: Remove `generationMode` from task construction

```typescript
// Before (line 600):
generationMode: generation_mode,

// After: Remove this line from the task object
```

#### Change 5: Add `skillResponse` and `baseScore` to record metadata

```typescript
// In generateRFTRecordsForTopic() (line 282-294) and generateSingleRecord() (line 143-155):
const recordData = {
  data,
  metadata: {
    persona: simulated.persona,
    seed_record_id: seedRecord?.id,
    seed_topic_path: task.topicPath,
    generated_at_ms: Date.now(),
    sourceChunkRefs: task.sourceChunkRefs || [],
    skillResponse: simulated.skillResponse,   // NEW
    baseScore: simulated.baseScore,            // NEW
  },
  topic: task.topicId,
  is_generated: true,
  evaluation: undefined,
};
```

#### Change 6: Update tool definition

```typescript
// Remove generation_mode from tool parameters and description
// Remove SFT/RFT references from description
```

### File: `src/lib/distri-finetune-tools/steps/generate-synthetic.ts`

**Effort**: Small

#### Change 1: Remove `generation_mode` parameter

```typescript
// Before (line 31):
generation_mode = 'rft',

// After: Remove from destructuring

// Before (lines 146, 158):
generation_mode: generation_mode as 'rft' | 'sft',

// After: Remove from both generateTracesParams objects
```

#### Change 2: Remove `generation_mode` from tool parameter schema

```typescript
// Before (lines 326-331):
generation_mode: {
  type: 'string',
  enum: ['rft', 'sft'],
  // ...
},

// After: Remove entirely
```

---

## Diversity Audit (shared by Phase 1 & 2)

### The Problem

When generating 30-50 records per topic, the LLM often produces semantically duplicate questions — "What's the Najdorf?" vs "Can you explain the main Najdorf concept?" Users need visibility into this so they can decide whether to act on it.

### Key Principle: Visibility Only, User-Driven Action

**No automatic deduplication happens anywhere** — not during generation, not during packaging.

The diversity audit is purely informational: it flags duplicates in metadata so the UI can show indicators (badges, warnings, scores). The user reviews the indicators and explicitly tells Lucy to remove duplicates if they want. Whatever the user sees in the UI is exactly what goes into the skill package.

```
Generation time (Phase 1 & 2):
  Generate 50 records for "Sicilian Defense"
    ↓
  Diversity audit (1 LLM call): score 0.72, found 6 duplicate clusters
    ↓
  ALL 50 records saved to IndexedDB ✓ (12 flagged as isDuplicate=true)
  Each record gets: diversityScore=0.72, isDuplicate=true/false, duplicateClusterId

User reviews (UI):
  Sees diversity score per topic (e.g., "0.72 — 12 potential duplicates")
  Sees which records are flagged (badge or highlight in record list)
  User decides: "Lucy, remove the duplicates in Sicilian Defense"
    ↓
  Lucy deletes flagged records from IndexedDB → 38 remain
  OR: User says nothing → all 50 stay → all 50 go into skill package

Packaging time (Phase 4):
  Read whatever records exist in IndexedDB → ALL go into skill package
  No hidden filtering. What user sees = what user gets.
```

### File: `src/lib/distri-dataset-tools/analysis/diversity-audit.ts` (NEW)

**Effort**: Medium

#### Types

```typescript
interface DiversityCluster {
  readonly indices: readonly number[];        // indices into the input array
  readonly representativeIndex: number;       // best-phrased in cluster
  readonly theme: string;                     // what they have in common
}

interface DiversityAuditResult {
  readonly diversityScore: number;            // 0.0-1.0 (1.0 = perfectly diverse)
  readonly clusters: readonly DiversityCluster[];
  readonly uniqueIndices: readonly number[];  // indices not in any cluster
}

/** Metadata fields added to each record after audit */
interface DiversityMetadata {
  readonly diversityScore: number;            // per-topic score (same for all records in topic)
  readonly isDuplicate: boolean;              // true if record is a non-representative duplicate
  readonly duplicateClusterId?: number;       // which cluster (if any) this record belongs to
  readonly duplicateClusterTheme?: string;    // human-readable cluster label
}
```

#### LLM Prompt

```typescript
const DIVERSITY_AUDIT_SYSTEM = `You are a training data diversity auditor.
Given a list of user messages for a single topic, identify:
1. An overall diversity score (0.0-1.0) — how varied are these questions?
   - 1.0 = every message asks something meaningfully different
   - 0.5 = moderate overlap, some clusters of similar questions
   - 0.0 = all messages ask essentially the same thing
2. Clusters of semantically similar messages (messages asking the same thing
   in different words). Only cluster messages that are truly redundant — minor
   wording differences don't count, but same intent/question does.

For each cluster, identify the "representative" (clearest, most natural phrasing).
Messages NOT in any cluster are considered unique — do not force-cluster everything.`;

const DIVERSITY_AUDIT_USER = `Topic: {{topic_name}}

User Messages:
{{messages.map((m, i) => \`[\${i}] \${m}\`).join('\\n')}}

Respond in JSON:
{
  "diversity_score": 0.82,
  "clusters": [
    { "indices": [0, 3, 12], "representative_index": 0, "theme": "Najdorf basics" },
    { "indices": [5, 8], "representative_index": 5, "theme": "Dragon suitability" }
  ]
}`;
```

#### Response Schema

```typescript
const DIVERSITY_AUDIT_RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "diversity_audit",
    strict: true,
    schema: {
      type: "object",
      properties: {
        diversity_score: { type: "number" },
        clusters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              indices: { type: "array", items: { type: "number" } },
              representative_index: { type: "number" },
              theme: { type: "string" },
            },
            required: ["indices", "representative_index", "theme"],
            additionalProperties: false,
          },
        },
      },
      required: ["diversity_score", "clusters"],
      additionalProperties: false,
    },
  },
};
```

#### Core Functions

```typescript
/**
 * Audit diversity of user messages for a single topic.
 * Makes 1 LLM call via DistriClient.llm().
 */
export async function auditDiversity(
  topicName: string,
  userMessages: readonly string[],
  llmClient: DistriClient,
): Promise<DiversityAuditResult> {
  // Skip audit for small batches (< 5 messages are unlikely to have duplicates)
  if (userMessages.length < 5) {
    return {
      diversityScore: 1.0,
      clusters: [],
      uniqueIndices: userMessages.map((_, i) => i),
    };
  }

  const response = await llmClient.llm({
    systemPrompt: DIVERSITY_AUDIT_SYSTEM,
    userMessage: renderTemplate(DIVERSITY_AUDIT_USER, { topicName, messages: userMessages }),
    responseFormat: DIVERSITY_AUDIT_RESPONSE_SCHEMA,
  });

  const parsed = parseJsonResponse(response);
  const clusteredIndices = new Set(parsed.clusters.flatMap(c => c.indices));
  const uniqueIndices = userMessages
    .map((_, i) => i)
    .filter(i => !clusteredIndices.has(i));

  return {
    diversityScore: parsed.diversity_score,
    clusters: parsed.clusters,
    uniqueIndices,
  };
}

/**
 * Compute per-record diversity metadata from audit results.
 * Purely informational — adds visibility flags for the UI. Never removes records.
 */
export function computeDiversityMetadata(
  recordCount: number,
  audit: DiversityAuditResult,
  getScore: (index: number) => number,
): readonly DiversityMetadata[] {
  // Build a map: recordIndex → { clusterId, isRepresentative }
  const clusterMap = new Map<number, { clusterId: number; isRep: boolean; theme: string }>();

  for (let cIdx = 0; cIdx < audit.clusters.length; cIdx++) {
    const cluster = audit.clusters[cIdx];
    // Find the highest-scored record in this cluster → that's the representative
    const bestIndex = cluster.indices.reduce((best, idx) =>
      getScore(idx) > getScore(best) ? idx : best,
      cluster.indices[0],
    );
    for (const idx of cluster.indices) {
      clusterMap.set(idx, {
        clusterId: cIdx,
        isRep: idx === bestIndex,
        theme: cluster.theme,
      });
    }
  }

  return Array.from({ length: recordCount }, (_, i) => {
    const cluster = clusterMap.get(i);
    if (!cluster) {
      // Unique record — not in any cluster
      return { diversityScore: audit.diversityScore, isDuplicate: false };
    }
    return {
      diversityScore: audit.diversityScore,
      isDuplicate: !cluster.isRep,            // non-representative = duplicate
      duplicateClusterId: cluster.clusterId,
      duplicateClusterTheme: cluster.theme,
    };
  });
}
```

#### How It Integrates

**In Phase 1** (`generate-initial-data.ts`) — flag duplicates, save ALL records:

```typescript
// After callLLMForInitialData() returns examples for a topic:
const examples = await callLLMForInitialData(/* ... */);

const audit = await auditDiversity(
  topicName,
  examples.map(e => e.user_message),
  llmClient,
);
const diversityMeta = computeDiversityMetadata(
  examples.length,
  audit,
  (i) => examples[i].expected_score,
);

// Create records from ALL examples — none removed
const topicRecords = examples.map((example, i) => ({
  data: exampleToDataInfo(example, seedTools, topicPrompt),
  is_generated: true,
  topic: job.topic.name,
  metadata: {
    // ... existing fields ...
    skillResponse: example.assistant_response,
    baseScore: example.expected_score,
    ...diversityMeta[i],  // diversityScore, isDuplicate, duplicateClusterId, etc.
  },
}));

// Report to Lucy:
// "Topic: Sicilian Defense — 50 records (diversity: 0.72, 12 duplicates flagged)"
```

**In Phase 2** (`generate-traces/index.ts`) — same pattern:

```typescript
const records = await generateRecordsForTopic(task, personaCache, callbacks);

const audit = await auditDiversity(
  task.topicId,
  records.map(r => extractUserMessage(r)),
  llmClient,
);
const diversityMeta = computeDiversityMetadata(
  records.length,
  audit,
  (i) => records[i].baseScore ?? 0,
);

// Save ALL records with diversity metadata flags
const recordsWithDiversity = records.map((r, i) => ({
  ...r,
  metadata: { ...r.metadata, ...diversityMeta[i] },
}));
```

**In Phase 4** (`generate-skill-package.ts`) — NO filtering at all:

```typescript
// Read ALL records — no score filtering, no diversity filtering.
const records = await datasetsDB.getRecordsByDatasetId(datasetId);

// No auto-filtering by scores or diversity flags.
// If the user previously told Lucy to remove duplicates or bad records,
// those records are already gone from IndexedDB.
// Whatever is here goes into the package. True WYSIWYG.
// Both baseScore and eval_scores are included in JSONL output.
// The diversity score and avgBaseScore are available for the index.md table.
```

**Fine-tuning upload** — also uses whatever records exist (no filtering):

```typescript
// recordToTrainingFormat() reads record.data — no changes needed
// Whatever records are in IndexedDB go to fine-tuning
```

#### Design Decisions

| Decision | Why |
|----------|-----|
| **No auto-dedup anywhere** | The system never silently removes records. Not during generation, not during packaging. User gets exactly what they see. |
| **Visibility only** | Diversity flags (`isDuplicate`, `diversityScore`) exist purely so the UI can show indicators. They have no functional effect on packaging or training. |
| **User-driven dedup** | User reviews indicators → explicitly tells Lucy "remove duplicates" → Lucy deletes flagged records from IndexedDB. Transparent and reversible (user can regenerate). |
| **What you see = what you get** | Whatever records the user sees in the UI is exactly what goes into the skill package. No hidden filtering layer. |
| **1 LLM call per topic, not per record** | 12 calls for a dataset, not 500. Trivial cost. |
| **Skip audit for < 5 messages** | Small batches can't have meaningful duplication. Return 1.0. |
| **Best-scored = representative** | Within a cluster, the highest-scored record is marked as representative. Used for display (e.g., showing the "best" phrasing). |
| **Store flags in record.metadata** | Available for UI display and optional user-driven dedup without re-auditing. |
| **Use DistriClient.llm()** | Same LLM path as generateTraces. No new API dependencies. |

---

## Phase 3: State Machine Updates

### File: `src/services/finetune-workflow-db.ts`

**Effort**: Small

#### Change 1: Add `skill_packaging` to `FinetuneStep` type

```typescript
export type FinetuneStep =
  | 'not_started'
  | 'topics_config'
  | 'categorize'
  | 'coverage_generation'
  | 'grader_config'
  | 'dry_run'
  | 'skill_packaging'      // NEW
  | 'training'
  | 'deployment'
  | 'completed';
```

#### Change 2: Add `skillPackaging` to `FinetuneWorkflowState`

```typescript
// Add after the dryRun field:
skillPackaging: {
  recordCount: number;
  packagedAt: number;
  skillName: string;
} | null;
```

#### Change 3: Update `createInitialStepStatus()`

```typescript
function createInitialStepStatus(): Record<FinetuneStep, StepStatus> {
  return {
    not_started: 'completed',
    topics_config: 'pending',
    categorize: 'pending',
    coverage_generation: 'pending',
    grader_config: 'pending',
    dry_run: 'pending',
    skill_packaging: 'pending',    // NEW
    training: 'pending',
    deployment: 'pending',
    completed: 'pending',
  };
}
```

### File: `src/lib/distri-finetune-tools/workflow/index.ts`

**Effort**: Small

#### Change 1: Update `STEP_ORDER`

```typescript
const STEP_ORDER: FinetuneStep[] = [
  'not_started',
  'topics_config',
  'categorize',
  'coverage_generation',
  'grader_config',
  'dry_run',
  'skill_packaging',        // NEW
  'training',
  'deployment',
  'completed',
];
```

#### Change 2: Update `isValidStepTransition()`

Add new valid transitions:

```typescript
// Allow skill packaging directly after coverage_generation (skip eval)
if (to === 'skill_packaging' && from === 'coverage_generation') return true;

// Allow skill packaging after dry_run (user may have curated records)
// Already valid via toIndex === fromIndex + 1

// Allow skipping skill_packaging to go directly to training
if (to === 'training' && from === 'dry_run') return true;

// Allow training after skill_packaging
// Already valid via toIndex === fromIndex + 1

// Keep existing skip: grader_config → training (skips both dry_run and skill_packaging)
if (to === 'training' && from === 'grader_config') return true;
```

---

## Phase 4: New Skill Packaging Tools

### Package Output Specification

The skill package follows the [Agent Skills](https://agentskills.io) open standard used by Claude Code. User installs by extracting to `~/.claude/skills/` (personal) or `.claude/skills/` (project).

#### Folder Structure

```
{skill-name}/
├── SKILL.md                          # Main skill definition (directive orchestrator, < 500 lines)
├── knowledge/
│   └── domain-knowledge.md           # Extracted content from uploaded documents
├── examples/
│   ├── index.md                      # Topic map → file lookup table
│   ├── {topic-1-slug}.jsonl          # Examples for topic 1
│   ├── {topic-2-slug}.jsonl          # Examples for topic 2
│   └── ...                           # One file per leaf topic
└── rules/
    └── response-guidelines.md        # Behavioral rules from grader criteria
```

#### SKILL.md Template (what `buildSkillMarkdown()` generates)

SKILL.md is a **directive orchestrator** — it tells Claude who it is, how to behave, where to find examples, and exactly when to read supporting files. Small files (rules, index table) are inlined. Large files (knowledge, JSONL) are loaded on demand via explicit Read instructions.

```markdown
---
name: {slugified_skill_name}
description: {dataset.datasetObjective}
argument-hint: "<your question about {domain}>"
---

# {Skill Name}

## Role & Objective

You are an expert in {domain}. You have deep knowledge across {topic_count}
topics, backed by {example_count} curated examples and {source_count}
reference documents.

### Expertise Areas

{recursive_topic_hierarchy_as_nested_list}

## Response Guidelines

{INLINED — full content of rules/response-guidelines.md}

## Available Examples

{INLINED — full content of examples/index.md (topic map table)}

## How to Use Examples (IMPORTANT)

Before answering any question:
1. Read the topic map above to identify which topic file(s) match the user's question
2. Use your Read tool to load `examples/{topic}.jsonl` for the matching topic(s)
3. Study the examples for tone, format, and domain accuracy
4. Answer the user's question following those patterns

You have access to {example_count} examples across {topic_count} topics.
ALWAYS load relevant examples before responding.
DO NOT guess — check the examples first.

## Domain Knowledge

For deep reference material, use your Read tool to load:
  `knowledge/domain-knowledge.md`

Only load this when you need additional context beyond what the examples provide.

## Representative Examples

These are the highest-scored examples across major topic areas. Use them as
immediate reference — for more examples on any topic, load the relevant JSONL file.

### {Topic Name} (Score: {score})
**User**: {user_message}
**Assistant**: {assistant_response}

### {Topic Name} (Score: {score})
**User**: {user_message}
**Assistant**: {assistant_response}
```

**Constraints**:
- SKILL.md must be **under 500 lines** (official Claude Code recommendation)
- **Inlined**: Response Guidelines (~20-40 lines) + Examples Index table (~15-25 lines)
- **Inline representative examples**: max 3-5 (one per major topic area, highest scored)
- **Read on demand**: Knowledge doc (can be long) + per-topic JSONL files
- If no knowledge sources: omit knowledge/ folder and Domain Knowledge section
- If no grader configured: response guidelines section falls back to generic best practices

#### examples/index.md Format (what `buildExamplesIndex()` generates)

```markdown
# Examples Index

{total_count} examples across {topic_count} topics.
Each example includes base_score (LLM self-assessment) and eval_scores (external grader, per-job).

## Topic Map

| Topic | File | Examples | Avg Score | Diversity |
|-------|------|----------|-----------|-----------|
| {Topic Path 1} | [{slug-1}.jsonl]({slug-1}.jsonl) | {count} | {avg} | {diversity} |
| {Topic Path 2} | [{slug-2}.jsonl]({slug-2}.jsonl) | {count} | {avg} | {diversity} |
| ... | ... | ... | ... | ... |
```

The **Diversity** column shows the per-topic diversity score (0.0-1.0) from the diversity audit. Values below 0.6 indicate the topic may have too many semantically similar examples.

#### examples/{topic}.jsonl Format (what `buildTopicJsonl()` generates)

One JSON object per line, sorted by baseScore descending. `topic` field omitted (redundant with filename). Both `base_score` and `eval_scores` included — scores are data that preserves optionality for downstream use (positive demos, negative demos, filtering decisions).

```jsonl
{"system":"You are a chess tutor...","user":"I keep losing after White plays d4...","assistant":"This is one of the most common problems...","base_score":0.85,"eval_scores":{"eval-job-abc":0.78},"sources":["mco15:chunk-042"]}
```

| Field | Type | Source |
|-------|------|--------|
| `system` | `string` | `record.data.input.messages[0].content` (role=system) |
| `user` | `string` | `record.data.input.messages[1].content` (role=user) |
| `assistant` | `string` | `record.metadata.skillResponse` |
| `base_score` | `number` | `record.metadata.baseScore` |
| `eval_scores` | `Record<string, number>` | `record.evaluations` → `{ [jobId]: score }`. Empty `{}` if no eval. |
| `sources` | `string[]` | `record.metadata.sourceChunkRefs` |

#### knowledge/domain-knowledge.md (what `buildKnowledgeDoc()` generates)

Extracted content from uploaded knowledge sources, organized by document.

#### rules/response-guidelines.md (what `buildResponseGuidelines()` generates)

Behavioral rules derived from `dataset.evalScript` grader criteria. Falls back to generic best practices if no grader is configured.

#### How Claude Code Uses It

1. **Description always in context** — Claude sees `description: {objective}` at all times
2. **Auto-invokes on match** — when user asks a domain question, Claude loads full SKILL.md
3. **SKILL.md already contains**: rules (inlined) + topic map table (inlined) + top examples → Claude has immediate behavioral context, zero Read calls needed so far
4. **Reads examples/{topic}.jsonl** — Claude sees the topic map table, finds the right file, loads it (1 Read call)
5. **Reads knowledge/domain-knowledge.md on demand** — only when deeper reference context is needed (1 Read call)
6. **No `context: fork`** — skill runs inline, alongside the user's project context

---

### File: `src/lib/distri-finetune-tools/steps/generate-skill-package.ts` (NEW)

**Effort**: Medium

**Zero LLM calls** — reads existing data from IndexedDB and assembles the multi-file package.

#### Types

```typescript
interface TopicExamples {
  readonly topicPath: string;       // e.g. "Semi-Open > Sicilian Defense"
  readonly slug: string;            // e.g. "sicilian-defense"
  readonly records: readonly DatasetRecord[];
  readonly avgBaseScore: number;    // average baseScore for human-readable index table
}

interface SkillPackageFiles {
  readonly skillMd: string;                         // SKILL.md content
  readonly examplesIndex: string;                    // examples/index.md content
  readonly topicFiles: ReadonlyMap<string, string>;  // slug → JSONL content
  readonly knowledgeDoc: string | null;              // knowledge/domain-knowledge.md or null
  readonly rulesDoc: string;                         // rules/response-guidelines.md content
}

interface GenerateSkillPackageResult {
  readonly success: boolean;
  readonly skillName: string;
  readonly recordCount: number;
  readonly topicCount: number;
  readonly package: SkillPackageFiles;
}
```

#### Core logic

```typescript
export async function generateSkillPackage(params: {
  dataset_id: string;
  skill_name?: string;
  include_knowledge?: boolean; // Default true
}): Promise<GenerateSkillPackageResult> {

  // 1. Read dataset metadata
  const dataset = await datasetsDB.getDatasetById(params.dataset_id);
  const { datasetObjective: objective, topicHierarchy, evalScript } = dataset;

  // 2. Read ALL records — no filtering. Scores included in output but never used to auto-filter.
  const records = await datasetsDB.getRecordsByDatasetId(params.dataset_id);

  // 3. Group records by topic → per-topic JSONL files
  const topicGroups = groupByTopic(records);
  // Returns: TopicExamples[] — one entry per leaf topic

  // 4. Build per-topic JSONL files
  const topicFiles = new Map<string, string>();
  for (const group of topicGroups) {
    const lines = group.records
      .map(r => buildExampleLine(r))
      .map(line => JSON.stringify(line));
    topicFiles.set(group.slug, lines.join('\n'));
  }

  // 5. Build examples/index.md
  const examplesIndex = buildExamplesIndex({
    topicGroups,
    totalCount: records.length,
  });

  // 6. Read knowledge sources (optional)
  let knowledgeDoc: string | null = null;
  if (params.include_knowledge !== false) {
    const sources = await knowledgeDB.getByDatasetId(params.dataset_id);
    const readySources = sources.filter(s => s.status === 'ready' && s.extractedContent);
    if (readySources.length > 0) {
      knowledgeDoc = buildKnowledgeDoc(readySources);
    }
  }

  // 7. Build rules/response-guidelines.md
  const rulesDoc = buildResponseGuidelines({ evalScript, objective });

  // 8. Build SKILL.md (directive orchestrator — inlines rules + index, references large files)
  const skillName = params.skill_name ?? deriveSkillName(objective);
  const skillMd = buildSkillMarkdown({
    skillName,
    objective,
    topicHierarchy,
    topExamples: selectTopExamples(topicGroups, 3),
    totalExamples: records.length,
    sourceCount: knowledgeDoc ? 1 : 0,
    hasKnowledge: knowledgeDoc !== null,
    inlinedRules: rulesDoc,           // inlined into SKILL.md (small)
    inlinedExamplesIndex: examplesIndex, // inlined into SKILL.md (small table)
  });

  // 9. Return multi-file package (download handled by separate tool)
  return {
    success: true,
    skillName,
    recordCount: records.length,
    topicCount: topicGroups.length,
    package: {
      skillMd,
      examplesIndex,
      topicFiles,
      knowledgeDoc,
      rulesDoc,
    },
  };
}
```

#### Helper functions (in same file)

```typescript
/** Group all records by topic, produce slug + stats per group */
function groupByTopic(
  records: readonly DatasetRecord[],
): readonly TopicExamples[] {
  const groups = new Map<string, DatasetRecord[]>();
  for (const r of records) {
    const topicPath = r.metadata?.topic_path ?? r.topic ?? 'general';
    const existing = groups.get(topicPath) ?? [];
    groups.set(topicPath, [...existing, r]);
  }
  return [...groups.entries()].map(([topicPath, recs]) => ({
    topicPath,
    slug: slugify(topicPath),         // "Semi-Open > Sicilian Defense" → "sicilian-defense"
    records: sortByBaseScoreDesc(recs),
    avgBaseScore: avgBaseScore(recs),
  }));
}

/** Slugify: take last segment of topic path, lowercase, hyphenate */
function slugify(topicPath: string): string {
  const lastSegment = topicPath.split('>').pop()?.trim() ?? topicPath;
  return lastSegment.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Build one JSONL line — both scores included, no topic (redundant with filename) */
function buildExampleLine(record: DatasetRecord) {
  // Collect per-job evaluation scores → flat { [jobId]: score } map
  const evalScores: Record<string, number> = {};
  if (record.evaluations) {
    for (const [jobId, evalData] of Object.entries(record.evaluations)) {
      if (evalData?.score != null) {
        evalScores[jobId] = evalData.score;
      }
    }
  }

  return {
    system: extractSystemPrompt(record),
    user: extractUserMessage(record),
    assistant: record.metadata?.skillResponse ?? '',
    base_score: record.metadata?.baseScore ?? 0,
    eval_scores: evalScores,
    sources: record.metadata?.sourceChunkRefs ?? [],
  };
}
```

### File: `src/lib/distri-finetune-tools/steps/download-skill-package.ts` (NEW)

**Effort**: Small

Triggers browser download of the assembled multi-file ZIP:

```typescript
import JSZip from 'jszip';
import type { SkillPackageFiles } from './generate-skill-package';

export async function downloadSkillPackage(params: {
  dataset_id: string;
  skill_name: string;
  package: SkillPackageFiles;
}): Promise<{ success: boolean; filename: string }> {

  const zip = new JSZip();
  const folderName = params.skill_name.toLowerCase().replace(/\s+/g, '-');
  const root = zip.folder(folderName)!;

  // 1. SKILL.md — top-level
  root.file('SKILL.md', params.package.skillMd);

  // 2. examples/ — index + per-topic JSONL files
  const examples = root.folder('examples')!;
  examples.file('index.md', params.package.examplesIndex);
  for (const [slug, jsonlContent] of params.package.topicFiles) {
    examples.file(`${slug}.jsonl`, jsonlContent);
  }

  // 3. knowledge/ — only if knowledge sources exist
  if (params.package.knowledgeDoc !== null) {
    const knowledge = root.folder('knowledge')!;
    knowledge.file('domain-knowledge.md', params.package.knowledgeDoc);
  }

  // 4. rules/ — always present
  const rules = root.folder('rules')!;
  rules.file('response-guidelines.md', params.package.rulesDoc);

  // 5. Generate ZIP and trigger browser download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${folderName}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return { success: true, filename: `${folderName}.zip` };
}
```

### File: `src/lib/distri-finetune-tools/steps/index.ts`

**Effort**: Small — register the 2 new tools

```typescript
import { generateSkillPackage } from './generate-skill-package';
import { downloadSkillPackage } from './download-skill-package';

// Add to stepToolHandlers:
generate_skill_package: generateSkillPackage,
download_skill_package: downloadSkillPackage,

// Add to STEP_TOOL_NAMES:
'generate_skill_package',
'download_skill_package',
```

---

## Phase 5: Plan System Integration

### File: `src/lib/distri-finetune-tools/workflow/plan-step-normalization.ts`

**Effort**: Tiny

```typescript
// Add 'package' to canonical step IDs:
export const CANONICAL_PLAN_STEP_IDS = [
  'topics', 'adjust_topics', 'categorize', 'generate',
  'grader', 'upload', 'dryrun', 'package',  // NEW
  'finetune',
] as const;
```

Add normalization mapping:

```typescript
// In the step normalization map:
'package': 'package',
'skill': 'package',
'skill_package': 'package',
'skill_packaging': 'package',
```

---

## Phase 6: Remove Dead Code

### File: `src/lib/distri-finetune-tools/steps/generate-topics/backend.ts` — DELETE

**Effort**: Tiny

This file (98 lines) calls `/v1/finetune/topic-hierarchy/generate` backend endpoint. The feature is gated behind `USE_BACKEND_TOPIC_GENERATION = false` and has never been enabled. Delete the entire file.

### File: `src/lib/distri-finetune-tools/steps/generate-topics/index.ts`

**Effort**: Tiny

#### Change 1: Remove backend import

```typescript
// Before (line 17):
import { generateTopicsViaBackend } from "./backend";

// After: Delete this line
```

#### Change 2: Remove feature flag

```typescript
// Before (line 61):
const USE_BACKEND_TOPIC_GENERATION = false;

// After: Delete this line
```

#### Change 3: Remove backend branch in `generateTopicsCore()`

```typescript
// Before (lines 123-147):
if (USE_BACKEND_TOPIC_GENERATION) {
  const records = await datasetsDB.getRecordsByDatasetId(datasetId);
  // ... 25 lines of dead code ...
}

// After: Delete this entire if block
// The function now always uses the frontend path directly
```

---

## Phase 7: Agent Definition Updates

### File: `gateway/agents/finetune/vllora-finetune-agent.md` (Orchestrator)

**Changes**:
1. Add `generate_skill_package` and `download_skill_package` to `[tools] external`
2. Add step mapping: `package` → `generate_skill_package`
3. Remove all SFT/RFT mode references
4. Add skill packaging flow description
5. Update `steps_to_execute` documentation

### File: `gateway/agents/finetune/finetune-workflow-agent.md`

**Changes**:
1. Add `generate_skill_package` and `download_skill_package` to `[tools] external`
2. Add skill packaging as a workflow step
3. Remove SFT/RFT references
4. Document when to trigger skill packaging (after coverage_generation or after dry_run)

### File: `gateway/agents/finetune/data-generation-agent.md`

**Changes**:
1. Remove SFT/RFT mode distinction from generation descriptions
2. Update to reflect unified generation (always produces all three fields)

### File: `gateway/agents/finetune/finetune-topics-agent.md`

**Changes**: Minor — mention that topics feed into skill packaging (topic hierarchy appears in SKILL.md).

> **Important**: After editing any agent .md file, run `scripts/restart-backend.sh` to restart the Distri server and vLLora gateway.

---

## Phase 8: Dependencies + Documentation

### JSZip

```bash
pnpm add jszip
pnpm add -D @types/jszip
```

Used only in `download-skill-package.ts` for client-side ZIP generation.

### Documentation Updates

#### `docs/features/lucy-finetune-dataset/state-machine.md`

- Add `skill_packaging` step to step list and diagram
- Add transition rules for skill packaging
- Update skip path documentation

#### `docs/features/lucy-finetune-dataset/architecture.md`

- Add `generate_skill_package` and `download_skill_package` to tool registry
- Remove SFT/RFT mode documentation
- Document unified generation mode

#### `docs/features/lucy-finetune-dataset/guided-onboarding.md`

- Add `package` to plan steps
- Document skill packaging in plan flow

#### `docs/features/lucy-finetune-dataset/data-generation-agent.md`

- Remove SFT/RFT references
- Document unified generation output: `user_message` + `assistant_response` + `expected_score`
- Document metadata fields: `skillResponse`, `baseScore`
- Document that all records are kept (no auto-filtering by baseScore or eval scores)
- Document that evaluation scores are per-job and informational only
- Document that both base_score and eval_scores are included in JSONL

---

## Implementation Order

| # | Phase | What | Why this order |
|---|-------|------|----------------|
| 1 | Diversity | `diversity-audit.ts` (new) — shared audit utility | Must exist before generation phases can use it |
| 2 | Phase 1 | `generate-initial-data.ts` — unify primary generation + diversity flags | Biggest change, produces the new data shape everything depends on |
| 3 | Phase 2 | `generate-traces/` — unify secondary generation + diversity flags | Align the secondary generator with the new unified format |
| 4 | Phase 2 | `generate-synthetic.ts` — remove mode param | Depends on generate-traces types being updated first |
| 5 | Phase 3 | `finetune-workflow-db.ts` — add step type + state | Unblocks step tools |
| 6 | Phase 3 | `workflow/index.ts` — step order + transitions | Unblocks skill packaging navigation |
| 7 | Phase 4 | `generate-skill-package.ts` (new) | Core packaging logic (reads diversityScore from metadata) |
| 8 | Phase 4 | `download-skill-package.ts` (new) | ZIP + browser download |
| 9 | Phase 4 | `steps/index.ts` — register new tools | Wire up to tool system |
| 10 | Phase 5 | `plan-step-normalization.ts` | Add `package` to plan steps |
| 11 | Phase 6 | Delete `generate-topics/backend.ts` | Dead code removal |
| 12 | Phase 6 | Clean `generate-topics/index.ts` | Remove flag + import |
| 13 | Phase 8 | Add JSZip dependency | `pnpm add jszip` |
| 14 | Phase 7 | Agent .md files (4 files) | Update agent definitions |
| 15 | Phase 7 | `scripts/restart-backend.sh` | Restart backend to pick up agent changes |
| 16 | Phase 8 | Documentation (4-5 files) | Update feature docs |

---

## Files Changed Summary

| Action | File | Phase | Effort |
|--------|------|-------|--------|
| **Create** | `src/lib/distri-dataset-tools/analysis/diversity-audit.ts` | Diversity | Medium |
| **Modify** | `src/lib/distri-finetune-tools/steps/generate-initial-data.ts` | 1 + Diversity | Large |
| **Modify** | `src/lib/distri-dataset-tools/analysis/generate-traces/types.ts` | 2 | Small |
| **Modify** | `src/lib/distri-dataset-tools/analysis/generate-traces/rft-generator.ts` | 2 | Medium |
| **Modify** | `src/lib/distri-dataset-tools/analysis/generate-traces/sft-generator.ts` | 2 | Small |
| **Modify** | `src/lib/distri-dataset-tools/analysis/generate-traces/prompts.ts` | 2 | Medium |
| **Modify** | `src/lib/distri-dataset-tools/analysis/generate-traces/index.ts` | 2 + Diversity | Medium |
| **Modify** | `src/lib/distri-finetune-tools/steps/generate-synthetic.ts` | 2 | Small |
| **Modify** | `src/services/finetune-workflow-db.ts` | 3 | Small |
| **Modify** | `src/lib/distri-finetune-tools/workflow/index.ts` | 3 | Small |
| **Create** | `src/lib/distri-finetune-tools/steps/generate-skill-package.ts` | 4 | Medium |
| **Create** | `src/lib/distri-finetune-tools/steps/download-skill-package.ts` | 4 | Small |
| **Modify** | `src/lib/distri-finetune-tools/steps/index.ts` | 4 | Small |
| **Modify** | `src/lib/distri-finetune-tools/workflow/plan-step-normalization.ts` | 5 | Tiny |
| **Delete** | `src/lib/distri-finetune-tools/steps/generate-topics/backend.ts` | 6 | Tiny |
| **Modify** | `src/lib/distri-finetune-tools/steps/generate-topics/index.ts` | 6 | Tiny |
| **Modify** | `gateway/agents/finetune/vllora-finetune-agent.md` | 7 | Medium |
| **Modify** | `gateway/agents/finetune/finetune-workflow-agent.md` | 7 | Medium |
| **Modify** | `gateway/agents/finetune/data-generation-agent.md` | 7 | Small |
| **Modify** | `gateway/agents/finetune/finetune-topics-agent.md` | 7 | Tiny |
| **Modify** | `docs/features/lucy-finetune-dataset/state-machine.md` | 8 | Medium |
| **Modify** | `docs/features/lucy-finetune-dataset/architecture.md` | 8 | Medium |
| **Modify** | `docs/features/lucy-finetune-dataset/guided-onboarding.md` | 8 | Small |
| **Modify** | `docs/features/lucy-finetune-dataset/data-generation-agent.md` | 8 | Small |

**Total: ~26 files (15 modify, 3 create, 1 delete, 4 agent defs, 4 docs), 0 backend changes, 0 new APIs**
