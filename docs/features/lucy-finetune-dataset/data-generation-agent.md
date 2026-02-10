# Data Generation Agent

## Overview

The Data Generation Agent is an interactive sub-agent for creating high-quality RFT training data. Unlike 1-shot generation tools, this agent engages in dialogue with users to understand requirements, show previews, and iterate until satisfied.

## Problem Statement

Current data generation tools (`generate_initial_data`, `generate_synthetic_data`, `generate_record_variants`) are 1-shot executors:
- No interactive refinement
- No knowledge source support
- No preview before batch generation
- Limited user guidance options

Users need:
- Interactive preview → feedback → iterate workflow
- Knowledge-grounded generation (PDFs, books, documentation)
- Coverage-aware recommendations
- Quality feedback during generation

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Finetune Orchestrator                        │
│                                                                 │
│  Delegates data generation tasks to specialized sub-agent      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Data Generation Agent                          │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Knowledge  │  │  Generation │  │   Dataset   │             │
│  │   Source    │  │    Tools    │  │    Tools    │             │
│  │   Tools     │  │             │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  - upload_knowledge_source     - generate_preview               │
│  - list_knowledge_sources      - generate_batch                 │
│  - extract_topics_from_source  - generate_from_knowledge        │
│  - search_knowledge            - generate_record_variants       │
│                                                                 │
│                                - get_dataset_info               │
│                                - get_dataset_records            │
│                                - analyze_coverage               │
└─────────────────────────────────────────────────────────────────┘
```

## RFT Data Format

Generated data must follow the RFT format:

```json
{
  "input": {
    "messages": [
      {"role": "system", "content": "..."},
      {"role": "user", "content": "..."}
    ]
  },
  "output": {}  // Empty - model generates response during training
}
```

## Knowledge Sources

### Supported Types

| Type | Use Case | Processing |
|------|----------|------------|
| PDF/Documents | Chess books, manuals, documentation | Extract structure, index content |
| Images | Chess positions, diagrams, screenshots | Vision analysis, position extraction |
| URLs | Documentation sites, reference pages | Fetch and parse content |
| Existing Records | High-quality examples | Use as templates for variants |

### Processing Flow

```
Upload → Extract Structure → Index Content → Use in Generation
```

### Knowledge-Grounded Generation

When generating from knowledge sources:
1. Reference specific concepts from the source
2. Ground examples in the source material
3. Cite chapter/section when relevant
4. Ensure accuracy matches the source

## Generation Modes

### 1. From Scratch (No Knowledge Source)

Based only on training objective:

```
User: "Generate some chess opening questions"
Agent: "I'll create 3 preview examples. What skill level - beginner, intermediate, or advanced?"
```

### 2. From Knowledge Source

Grounded in uploaded documents:

```
User: "Generate questions based on chapter 3 of My System"
Agent: "Chapter 3 covers 'The Isolated Pawn'. I'll generate questions about:
- Strengths and weaknesses of isolated pawns
- Typical plans for both sides
- Famous games featuring this structure

Here are 3 previews..."
```

### 3. From Existing Record (Variants)

Create variations of a specific record:

```
User: "Make variants of record rec-abc123"
Agent: "This record asks about the Italian Game. I'll vary:
- The specific position/move being asked about
- The phrasing style (formal → casual)
- The complexity level

Here are 3 variant previews..."
```

### 4. Hybrid (Knowledge + Coverage)

Fill coverage gaps using knowledge sources:

```
Agent: "Your 'Endgames' topic has only 5 records (needs 50+).
I found 23 endgame positions in your uploaded book.
Should I generate training data from these examples?"
```

## Interaction Patterns

### Preview → Feedback → Iterate Loop

**Step 1: Generate Preview (3-5 samples)**

```
"Here are 3 sample records for 'Opening Principles':

1. [SYS] You are a chess tutor...
   [USR] I just started a game and moved my knight to c3 first. My opponent said that's not the best. Why do people usually move pawns first in chess openings?

2. [SYS] You teach chess strategy...
   [USR] What's the idea behind controlling the center with pawns? I see grandmasters do e4 and d4 a lot.

3. [SYS] You explain chess concepts simply...
   [USR] My coach says "develop your pieces" but what does that actually mean and why is it important?

How do these look? Should I:
- Adjust the difficulty level?
- Change the question style?
- Focus on different concepts?
- Generate more like these?"
```

**Step 2: Collect Feedback**

```
User: "These are good but too basic. Make them more challenging."

Agent: "Got it! Here are 3 more advanced versions:

1. [USR] In the Italian Game, after 1.e4 e5 2.Nf3 Nc6 3.Bc4, why is 3...Nf6 (the Two Knights Defense) considered more aggressive than 3...Bc5 (the Giuoco Piano)? What are the strategic implications of each?

2. [USR] I understand pawns control the center, but when is it correct to delay central pawn moves in favor of hypermodern setups like the King's Indian? What am I trading off?

..."
```

**Step 3: Confirm and Generate Batch**

```
User: "Perfect, generate 20 more like that"

Agent: "Generating 20 intermediate-level opening questions...
[Progress: ████████░░ 16/20]

Done! Created 20 records:
- All assigned to 'Openings' topic
- Difficulty: Intermediate
- Styles: Mix of positional and tactical questions

Your coverage for 'Openings' improved from 12% to 18%.
Want me to continue or move to another topic?"
```

### Handling Knowledge Source Uploads

```
User: [Uploads chess_tactics_workbook.pdf]

Agent: "I received 'chess_tactics_workbook.pdf' (142 pages).

Processing... I found:
- 8 chapters organized by tactical theme
- 312 puzzle positions with solutions
- Themes: pins, forks, skewers, discovered attacks, back rank mates

This maps well to training data! I can:

1. **Extract puzzles as training prompts**
   "Given this position [FEN], find the winning tactic"

2. **Generate conceptual questions**
   "Explain how a pin works and when to look for one"

3. **Create scenario-based problems**
   "Your opponent's king is on the back rank with no escape squares. What should you look for?"

Which approach interests you? Or a mix of all three?"
```

## Coverage-Aware Generation

Always consider the current dataset state:

```
"Looking at your current coverage:

Topic                  | Records | Coverage | Status
-----------------------|---------|----------|--------
Opening Principles     |    45   |   22%    | ✓ Good
Tactical Patterns      |    12   |    6%    | ⚠️ Low
Endgame Technique      |     3   |    1%    | ❌ Critical
Strategic Concepts     |    28   |   14%    | ✓ OK
Position Evaluation    |     8   |    4%    | ⚠️ Low

I recommend focusing on 'Endgame Technique' first.
You have endgame content in your uploaded book (Chapter 8-10).

Should I generate endgame training data using that material?"
```

## Quality Feedback

Proactively flag quality issues during generation:

```
"I generated 15 records, but I noticed some issues:

⚠️ 3 records are very similar to existing ones (high overlap)
⚠️ 2 records might be too simple for your target level
✓ 10 records look good and diverse

Options:
a) Keep all 15 (some redundancy is OK)
b) Regenerate the 5 flagged ones with more diversity
c) Let me show you the flagged ones so you can decide"
```

## Tools Specification

### Knowledge Source Tools

| Tool | Description |
|------|-------------|
| `upload_knowledge_source` | Upload PDF, image, or URL as knowledge source |
| `list_knowledge_sources` | List all uploaded knowledge sources for dataset |
| `extract_topics_from_source` | Extract topic structure from knowledge source |
| `search_knowledge` | Search indexed knowledge for specific concepts |

#### `upload_knowledge_source` Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dataset_id` | string | Yes | - | The dataset to associate the knowledge source with |
| `name` | string | Yes | - | Filename or identifier for the source |
| `type` | string | Yes | - | Type: `pdf`, `image`, `url`, or `text` |
| `content` | string | Yes | - | Base64-encoded data (files), URL string, or plain text |
| `mime_type` | string | No | - | MIME type of the content |
| `extraction_mode` | string | No | `llm` | PDF extraction mode: `llm` or `basic` |

#### PDF Extraction Modes

| Mode | Speed | Quality | Use Case |
|------|-------|---------|----------|
| `llm` (default) | Slower (~5-10s) | High | Production - filters noise, extracts meaningful topics |
| `basic` | Fast (~1s) | Lower | Development/testing - regex-based, may include noise |

**LLM Mode Benefits:**
- Filters out metadata sections (copyright, preface, bibliography)
- Extracts meaningful topics relevant to the document subject
- Provides document summary and type classification
- Automatically falls back to basic mode if LLM fails

**Basic Mode:**
- Uses regex patterns to detect headings and capitalized phrases
- May include noise like "Page Break", author names, section headers
- Useful for quick testing or when LLM is unavailable

### Generation Tools

| Tool | Description |
|------|-------------|
| `generate_preview` | Generate 3-5 preview samples for user review |
| `generate_batch` | Generate batch of records after preview approval |
| `generate_from_knowledge` | Generate records grounded in knowledge sources |
| `generate_record_variants` | Create variations of existing records |

### Dataset Tools

| Tool | Description |
|------|-------------|
| `get_dataset_info` | Get dataset metadata and objective |
| `get_dataset_records` | Retrieve existing records |
| `analyze_coverage` | Analyze topic coverage and identify gaps |

## Agent Definition

```toml
[agent]
name = "data_generation"
description = "Interactive data generation agent with knowledge source support"
max_iterations = 30
tool_format = "provider"

[tools]
builtin = ["final", "write_todos"]
external = [
  # Knowledge source tools
  "upload_knowledge_source",
  "list_knowledge_sources",
  "extract_topics_from_source",
  "search_knowledge",

  # Generation tools
  "generate_preview",
  "generate_batch",
  "generate_from_knowledge",
  "generate_record_variants",

  # Dataset tools
  "get_dataset_info",
  "get_dataset_records",
  "analyze_coverage"
]

[model_settings]
model = "gpt-4.1"
temperature = 0.3
```

## Integration with Existing Tools

The agent wraps and extends existing generation functions:

| Existing Tool | Agent Enhancement |
|---------------|-------------------|
| `generate_initial_data` | Preview workflow, user guidance iteration |
| `generate_synthetic_data` | Coverage-aware recommendations, batch with progress |
| `generate_record_variants` | Multi-variant preview, variation strategies |

## Core Principles

1. **Always preview first** - Never generate large batches without showing samples
2. **Iterate based on feedback** - Adjust generation based on user reactions
3. **Ground in knowledge** - Use uploaded sources when available
4. **Explain quality signals** - Help users understand what makes good training data
5. **Suggest improvements** - Proactively identify coverage gaps and quality issues

## Restrictions

- **Never generate without preview first** for batches > 5
- **Never ignore user feedback** - always acknowledge and adjust
- **Never claim certainty** about domain facts without knowledge source backing
- **Always track lineage** - generated records should reference their source
- **Respect rate limits** - batch appropriately, show progress for long operations

## Future Enhancements

1. **Multi-modal knowledge extraction** - Better image/diagram processing
2. **Collaborative editing** - Real-time refinement of generated examples
3. **Quality scoring** - Automatic quality assessment of generated data
4. **Version control** - Track generation history and allow rollback
