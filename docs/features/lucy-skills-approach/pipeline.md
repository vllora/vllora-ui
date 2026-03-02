# Skills Generation Pipeline

This document details the step-by-step pipeline for generating a Skill Package, mapping each step to existing infrastructure.

---

## Pipeline Overview

```
Step 1: Objective & Knowledge Setup        (REUSE existing)
Step 2: Knowledge Processing & Indexing    (EXTEND existing)
Step 3: Skill Structure Generation         (NEW — builds on existing topic system)
Step 4: Example Generation & Curation      (EXTEND existing data generation)
Step 5: Reasoning Template Extraction      (NEW)
Step 6: Skill Assembly & Testing           (EXTEND existing evaluation)
Step 7: Publishing                         (NEW)
```

```
Infrastructure Reuse Map:

  Current Pipeline Step          →    Skills Pipeline Step          Reuse %
  ──────────────────────              ────────────────────          ───────
  Topics Config                  →    Objective & Knowledge Setup     90%
  Knowledge Upload/Extract       →    Knowledge Processing            80%
  Categorization                 →    (merged into Structure Gen)     50%
  Coverage & Generation          →    Example Generation              60%
  Grader Config                  →    Evaluation Rubric               70%
  Dry Run                        →    Skill Testing                   50%
  Training                       →    (replaced by Skill Assembly)     0%
  Deployment                     →    Publishing                      20%
```

---

## Step 1: Objective & Knowledge Setup

### What Happens
User provides their objective and uploads reference documents. Identical to current Step 1.

### Reuse
- `upload_knowledge_source` tool — as-is
- `list_knowledge_sources` tool — as-is
- `update_objective` tool — as-is
- `KnowledgeSourcesContext` — as-is
- PDF extraction pipeline — as-is

### Flow
```
User sets objective: "Build an expert chess tutor that teaches opening theory"
User uploads: chess_openings.pdf, strategy_guide.pdf

→ Extract text from PDFs (semantic-pdf-extractor.ts)
→ Chunk and summarize (existing pipeline)
→ Store in IndexedDB (knowledgeSources store)
```

### Existing Files Used
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `steps/knowledge-sources.ts` | Upload, list, extract tools | None |
| `steps/semantic-pdf-extractor.ts` | PDF → chunks | None |
| `steps/analyze-knowledge-sources.ts` | Analyze uploaded docs | None |
| `contexts/KnowledgeSourcesContext.tsx` | Knowledge state | None |

---

## Step 2: Knowledge Processing & Indexing

### What Happens
Transform extracted chunks into a searchable knowledge index with embeddings.

### What's New vs Current
Currently, chunks are extracted and stored but only used as generation context. For Skills, chunks become **runtime artifacts** that need:
- Semantic embeddings for retrieval
- Keyword extraction for hybrid search
- Cross-reference mapping (which chunks relate to each other)
- Quality scoring (some chunks are more useful than others)

### Flow
```
For each knowledge source:
  1. Load extracted chunks (existing)
  2. Generate embedding for each chunk (NEW)
     - Model: text-embedding-3-small or local ONNX model
     - Store in chunks.embedding field
  3. Extract keywords per chunk (NEW)
     - TF-IDF or LLM extraction
     - Store in chunks.keywords field
  4. Build cross-references (NEW)
     - Adjacent chunks in same source → related
     - Chunks sharing keywords → related
     - Store in chunks.related_chunks field
  5. Score chunk quality (NEW)
     - LLM evaluates: is this chunk self-contained and useful?
     - Low-quality chunks (definitions-only, table of contents) get lower retrieval priority
```

### New Tool: `build_knowledge_index`
```typescript
{
  name: "build_knowledge_index",
  description: "Process knowledge chunks into a searchable index with embeddings",
  parameters: {
    dataset_id: string,
    embedding_model?: string,     // Default: "text-embedding-3-small"
    include_quality_scoring?: boolean  // Default: true
  },
  returns: {
    total_chunks: number,
    indexed_chunks: number,
    avg_quality_score: number,
    low_quality_chunks: number,   // Chunks below threshold
    embedding_dimensions: number
  }
}
```

### Existing Files Extended
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `steps/semantic-pdf-extractor.ts` | Chunk extraction | Add embedding generation |
| `services/datasets-db.ts` | IndexedDB operations | Add skill-related stores |

### New Files
| File | Purpose |
|------|---------|
| `steps/skill/build-knowledge-index.ts` | Embedding generation, keyword extraction, cross-refs |

---

## Step 3: Skill Structure Generation

### What Happens
Generate the expert system prompt, topic hierarchy for the skill, and identify what reasoning templates are needed.

### Flow
```
Inputs:
  - User objective
  - Knowledge source analysis (topics, terminology, structure)
  - Topic hierarchy (existing or auto-generated)

Generate:
  1. Expert System Prompt
     - LLM call with: objective + knowledge summary + topic list
     - Output: system_prompt.md (role, expertise, rules, style)

  2. Skill Structure
     - Map topic hierarchy → skill knowledge areas
     - Identify gaps: topics without knowledge chunks
     - Plan: which examples needed per topic

  3. Reasoning Template Plan
     - Analyze knowledge for common reasoning patterns
     - e.g., "If domain is medical: diagnostic reasoning template"
     - e.g., "If domain is legal: case analysis template"
     - Output: list of templates to generate in Step 5
```

### New Tool: `generate_skill_structure`
```typescript
{
  name: "generate_skill_structure",
  description: "Generate the skill's system prompt and structural plan",
  parameters: {
    dataset_id: string,
    objective: string,
    style_preferences?: {
      formality: "formal" | "casual" | "technical",
      detail_level: "concise" | "detailed" | "adaptive",
      audience: string
    }
  },
  returns: {
    system_prompt: string,          // Generated expert system prompt
    skill_areas: Array<{
      topic: string,
      chunk_count: number,
      examples_needed: number,
      has_gaps: boolean
    }>,
    reasoning_templates_needed: string[],
    estimated_context_tokens: number
  }
}
```

### Existing Files Used
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `steps/generate-topics/` | Topic hierarchy | Reuse for skill area mapping |
| `steps/analyze-knowledge-sources.ts` | Knowledge analysis | Extend to identify reasoning patterns |

### New Files
| File | Purpose |
|------|---------|
| `steps/skill/generate-skill-structure.ts` | System prompt + structure generation |

---

## Step 4: Example Generation & Curation

### What Happens
Generate high-quality examples, grade them, and curate the best ones into the skill package.

### Key Difference from Current
Current pipeline generates bulk data for training (quantity matters). Skills pipeline generates curated examples for few-shot context (quality matters, quantity secondary).

```
Current:  Generate 500 examples → Use all for training
Skills:   Generate 100 examples → Grade all → Keep top 30 → Organize by topic + difficulty
```

### Flow
```
For each topic area:
  1. Generate candidate examples (REUSE generate-initial-data.ts)
     - Use knowledge chunks as context (same as current)
     - Generate 10-20 candidates per topic
     - Include difficulty variation (beginner/intermediate/advanced)

  2. Grade each candidate (REUSE grader pipeline)
     - Run grader with knowledge-aware criteria
     - Score 0-1 on: accuracy, clarity, groundedness
     - NEW: Also check citation accuracy (does the example correctly reference sources?)

  3. Curate (NEW)
     - Filter: keep only score > 0.7
     - Diversity selection: ensure variety in question types, difficulty, reasoning style
     - Annotate: add selection_reason, source_chunk_refs, difficulty label
     - Target: 3-5 examples per topic

  4. Format for few-shot (NEW)
     - Convert to full conversation format (system + user + assistant)
     - Ensure assistant responses include citations
     - Validate: each example is self-contained and instructive
```

### New Tool: `generate_skill_examples`
```typescript
{
  name: "generate_skill_examples",
  description: "Generate and curate high-quality examples for the skill package",
  parameters: {
    dataset_id: string,
    candidates_per_topic?: number,    // Default: 15
    quality_threshold?: number,       // Default: 0.7
    target_per_topic?: number,        // Default: 5
    difficulty_distribution?: {       // Default: even split
      beginner: number,
      intermediate: number,
      advanced: number
    }
  },
  returns: {
    total_generated: number,
    total_graded: number,
    total_selected: number,
    by_topic: Record<string, {
      generated: number,
      selected: number,
      avg_score: number
    }>,
    quality_summary: {
      avg_score: number,
      min_score: number,
      max_score: number
    }
  }
}
```

### Existing Files Extended
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `steps/generate-initial-data.ts` | Data generation | Extract reusable generation logic |
| `steps/generate-preview.ts` | Preview generation | Reuse for candidate generation |
| `steps/configure-grader.ts` | Grader config | Extend for citation-aware grading |

### New Files
| File | Purpose |
|------|---------|
| `steps/skill/generate-skill-examples.ts` | Example generation + curation pipeline |
| `steps/skill/curate-examples.ts` | Diversity selection + annotation logic |

---

## Step 5: Reasoning Template Extraction

### What Happens
Extract domain-specific reasoning patterns from knowledge sources and convert them into reusable templates.

### Flow
```
Inputs:
  - Knowledge chunks (all)
  - Topic hierarchy
  - Template plan from Step 3

For each planned template:
  1. Identify relevant chunks
     - Find chunks that contain procedural/methodological content
     - e.g., "Step 1... Step 2..." patterns, decision trees, if-then rules

  2. Extract reasoning pattern (LLM call)
     - Input: relevant chunks + template type
     - Output: structured reasoning template
     - e.g., "For opening analysis: 1. Identify the opening name 2. Check move order
              3. Evaluate pawn structure 4. Suggest plans for both sides"

  3. Generate trigger patterns
     - What kinds of user questions should activate this template?
     - e.g., ["analyze.*opening", "what.*plan.*after", "how.*play.*against"]

  4. Validate template
     - Test against 3 sample questions
     - Verify the template produces coherent reasoning
```

### New Tool: `generate_reasoning_templates`
```typescript
{
  name: "generate_reasoning_templates",
  description: "Extract reasoning patterns from knowledge and create templates",
  parameters: {
    dataset_id: string,
    template_types?: string[],      // Override auto-detected types
    max_templates?: number          // Default: 5
  },
  returns: {
    templates_generated: number,
    templates: Array<{
      id: string,
      name: string,
      applicable_topics: string[],
      trigger_count: number
    }>
  }
}
```

### New Files
| File | Purpose |
|------|---------|
| `steps/skill/generate-reasoning-templates.ts` | Template extraction from knowledge |

---

## Step 6: Skill Assembly & Testing

### What Happens
Assemble all generated artifacts into a Skill Package, then test it against a test suite.

### Assembly
```
1. Collect all artifacts:
   - system_prompt.md (from Step 3)
   - knowledge/chunks.json + embeddings.json (from Step 2)
   - examples/ (from Step 4)
   - reasoning/templates.json (from Step 5)
   - evaluation/rubric.md (from grader config, REUSE)

2. Generate manifest.json
   - Compute stats (chunk count, example count, etc.)
   - Determine compatibility requirements
   - Set version to 1.0.0

3. Generate test suite (NEW)
   - For each topic: 2-3 test questions with expected behavior
   - Edge case tests: out-of-scope questions, ambiguous queries
   - Regression tests: questions that should cite specific chunks
```

### Testing
```
For each test case:
  1. Compose prompt using skill runtime logic
     - Load system prompt
     - Retrieve relevant chunks
     - Select examples
     - Apply reasoning template

  2. Call foundation model

  3. Evaluate response:
     - Grader score (REUSE existing grader)
     - Citation accuracy: do citations match actual chunks?
     - Relevance: does the response address the question?
     - Groundedness: are claims supported by knowledge chunks?

  4. Aggregate results
     - Pass/fail per test case
     - Overall score
     - Breakdown by topic, difficulty, question type
```

### New Tool: `test_skill`
```typescript
{
  name: "test_skill",
  description: "Run the test suite against the assembled skill package",
  parameters: {
    skill_id: string,
    model?: string,                 // Foundation model to test with
    test_subset?: string[],         // Specific test IDs (default: all)
    include_self_eval?: boolean     // Test self-evaluation (default: true)
  },
  returns: {
    total_tests: number,
    passed: number,
    failed: number,
    avg_score: number,
    by_topic: Record<string, { passed: number, failed: number, avg: number }>,
    failures: Array<{
      test_id: string,
      question: string,
      expected_behavior: string,
      actual_response: string,
      failure_reason: string
    }>,
    verdict: "PUBLISH" | "NEEDS_WORK" | "FAIL",
    recommendations: string[]
  }
}
```

### Existing Files Used
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `steps/configure-grader.ts` | Grader configuration | Reuse for skill rubric |
| `steps/test-grader.ts` | Sample testing | Extend for skill testing |

### New Files
| File | Purpose |
|------|---------|
| `steps/skill/assemble-skill.ts` | Collect artifacts, generate manifest |
| `steps/skill/test-skill.ts` | Test suite generation + execution |

---

## Step 7: Publishing

### What Happens
Package the skill for deployment. Support multiple output formats.

### Output Formats

#### Native (vLLora Skill Package)
```
skill-{id}.json — Single JSON file with all artifacts embedded
  Used by: vLLora skill runtime engine
```

#### OpenAI Custom GPT
```
├── instructions.md    — System prompt + rubric
├── knowledge/         — Files for GPT knowledge retrieval
│   ├── source_1.md
│   └── source_2.md
└── actions.json       — Tool definitions (if any)
```

#### Claude Project
```
├── project_prompt.md  — System prompt + rubric
├── knowledge/         — Project knowledge files
│   ├── source_1.md
│   └── source_2.md
└── (no tool export — Claude Projects don't support custom tools yet)
```

#### API Endpoint
```
Deploy as an API endpoint that wraps:
  - Skill loading
  - Chunk retrieval
  - Prompt composition
  - Foundation model call
  - Response post-processing
```

### New Tool: `publish_skill`
```typescript
{
  name: "publish_skill",
  description: "Package and publish the skill in the requested format",
  parameters: {
    skill_id: string,
    format: "native" | "openai-gpt" | "claude-project" | "api",
    options?: {
      model?: string,               // For API: which model to use
      endpoint_name?: string,       // For API: custom endpoint name
    }
  },
  returns: {
    format: string,
    artifact_url?: string,          // Download URL
    api_endpoint?: string,          // For API format
    size_bytes: number,
    manifest: SkillManifest
  }
}
```

### New Files
| File | Purpose |
|------|---------|
| `steps/skill/publish-skill.ts` | Package skill in requested format |
| `steps/skill/export-formats.ts` | Format-specific exporters |

---

## Complete File Structure (New Files)

```
src/lib/distri-finetune-tools/steps/skill/
├── index.ts                          # Exports all skill tools
├── build-knowledge-index.ts          # Step 2: Embedding + indexing
├── generate-skill-structure.ts       # Step 3: System prompt + structure
├── generate-skill-examples.ts        # Step 4: Example generation
├── curate-examples.ts                # Step 4: Example curation
├── generate-reasoning-templates.ts   # Step 5: Reasoning patterns
├── assemble-skill.ts                 # Step 6: Package assembly
├── test-skill.ts                     # Step 6: Skill testing
├── publish-skill.ts                  # Step 7: Publishing
├── export-formats.ts                 # Step 7: Format exporters
└── types.ts                          # Skill-specific TypeScript types
```

---

## Lucy Agent Integration

### New Workflow Steps

The skills pipeline adds an alternative path in the existing workflow:

```
Current workflow:
  topics_config → categorization → coverage_generation → grader_config → dry_run → training → deployment

Skills workflow (alternative):
  topics_config → knowledge_indexing → skill_generation → skill_testing → skill_publishing

Combined workflow (user chooses):
  topics_config → categorization → coverage_generation → grader_config →
    ├── [Finetune path] dry_run → training → deployment
    └── [Skills path]   knowledge_indexing → skill_generation → skill_testing → skill_publishing
```

### Lucy Conversation Example

```
Lucy: I've analyzed your knowledge sources and objective. You have two options:

  1. **Generate a Skill Package** (recommended)
     → Creates an AI specialist in ~5 minutes
     → Uses Claude/GPT-4 as the base with your knowledge as context
     → Easy to update and iterate

  2. **Train a Custom Model** (advanced)
     → Creates a finetuned small model (~2-4 hours)
     → Lower per-call cost at high volume
     → Requires more data and careful evaluation

Which approach would you like to take?

User: Let's try the skill approach

Lucy: Great! I'll generate your skill package. Here's the plan:

  ☐ Build knowledge index (embed 150 chunks)
  ☐ Generate expert system prompt
  ☐ Create curated examples (15 per topic, keep best 5)
  ☐ Extract reasoning templates
  ☐ Assemble and test skill
  ☐ Publish

Starting with the knowledge index...
```
