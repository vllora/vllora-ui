# 02 - User Journey

[← Back to Index](./00_INDEX.md) | [← Previous](./01_Core_Concepts.md)

---

## Prerequisites

**Input:** `raw_traces.jsonl` (from trace selection module)

---

## Journey Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA PREPARATION                              │
├─────────────────────────────────────────────────────────────────────────┤
│  A: Sanitize    →   B: Define    →   C: Categorize   →   D: Review     │
│     Data            Topics           Records             Coverage       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA AUGMENTATION                             │
├─────────────────────────────────────────────────────────────────────────┤
│  E: Generate    →   F: Review Final Distribution                        │
│     Samples                                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                           VALIDATION & TRAINING                         │
├─────────────────────────────────────────────────────────────────────────┤
│  G: Define      →   H: Dry Run   →   I: Train   →   J: Deploy          │
│     Grader          Validation                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Data Preparation

### Step A — Sanitize Data

**Purpose:** Clean raw traces, remove malformed records before investing time in categorization.

**Process:**
1. Validate JSON structure
2. Check message format (must end with user)
3. Validate tool call chains
4. Remove duplicates
5. Filter by token length

**User Sees:**
- Total records in / valid records out
- Rejection breakdown by error type
- "View rejected samples" option

**Output:** `sanitized_prompts.jsonl`

```
┌─────────────────────────────────────────────┐
│ Data Sanitization                           │
├─────────────────────────────────────────────┤
│ Input:  12,453 raw traces                   │
│                                             │
│ ✓ Valid structure     11,892 (95.5%)        │
│ ✗ Missing user msg       234 (1.9%)         │
│ ✗ Invalid JSON           127 (1.0%)         │
│ ✗ Broken tool chain      112 (0.9%)         │
│ ✗ Duplicates              88 (0.7%)         │
│                                             │
│ Output: 11,892 clean prompts                │
│                                             │
│ [View Rejected] [View Report]    [Next →]   │
└─────────────────────────────────────────────┘
```

---

### Step B — Define Topic Hierarchy

**Purpose:** Create the taxonomy for categorizing prompts.

**Options:**
1. **Auto-generate** - System clusters and labels topics using embeddings
2. **Use template** - Start from predefined industry templates
3. **Manual define** - User creates custom hierarchy

**User Sees:**
- Topic tree editor (add/edit/delete/reorder)
- Description per topic
- Suggested topics from auto-clustering

**Output:** `topic_hierarchy.json`

```
┌─────────────────────────────────────────────┐
│ Define Topic Hierarchy                      │
├─────────────────────────────────────────────┤
│ How would you like to define topics?        │
│                                             │
│ ● Auto-generate from data                   │
│   Cluster similar prompts automatically     │
│                                             │
│ ○ Use template                              │
│   Start from: [Customer Support ▼]          │
│                                             │
│ ○ Define manually                           │
│   Create your own hierarchy                 │
│                                             │
│                         [Generate Topics →] │
└─────────────────────────────────────────────┘
```

**After generation:**
```
┌─────────────────────────────────────────────┐
│ Topic Hierarchy                      [Edit] │
├─────────────────────────────────────────────┤
│ ▼ data_queries                              │
│   ├─ database_lookups                       │
│   ├─ api_requests                           │
│   └─ search_operations                      │
│ ▼ calculations                              │
│   ├─ aggregations                           │
│   ├─ conversions                            │
│   └─ financial_math                         │
│ ▼ content_generation                        │
│   ├─ summaries                              │
│   └─ formatting                             │
│ + Add Topic                                 │
│                                             │
│                            [Confirm →]      │
└─────────────────────────────────────────────┘
```

---

### Step C — Categorize Records

**Purpose:** Assign each sanitized prompt to a topic in the hierarchy.

**Process:**
1. Embed all prompts
2. Classify into topics (using embeddings or LLM)
3. Handle edge cases (multi-topic, uncategorized)

**User Sees:**
- Progress indicator
- Categorization confidence distribution
- Records needing manual review (low confidence)

**Output:** `categorized_prompts.jsonl` (with topic assignments)

```
┌─────────────────────────────────────────────┐
│ Categorizing Records...                     │
├─────────────────────────────────────────────┤
│ ████████████████░░░░ 80%                    │
│                                             │
│ Processed: 9,514 / 11,892                   │
│                                             │
│ High confidence (>0.8):    8,234 (86.5%)    │
│ Medium confidence:         1,012 (10.6%)    │
│ Needs review (<0.5):         268 (2.8%)     │
│                                             │
└─────────────────────────────────────────────┘
```

---

### Step D — Review Coverage Distribution

**Purpose:** Understand current dataset composition before augmentation.

**User Sees:**
- Distribution chart by topic
- Distribution by difficulty (if applicable)
- Gaps highlighted (topics with few samples)
- Target vs actual comparison

**Key Metrics:**
- Records per topic
- % of total per topic
- Min/max/std across topics

```
┌─────────────────────────────────────────────┐
│ Current Coverage Distribution               │
├─────────────────────────────────────────────┤
│                                             │
│ data_queries      ████████████████ 4,521    │
│ calculations      ████░░░░░░░░░░░░   892 ⚠️ │
│ content_gen       ████████████░░░░ 3,245    │
│ tool_usage        ██████████░░░░░░ 2,134    │
│ other             ████░░░░░░░░░░░░ 1,100    │
│                                             │
│ ⚠️ Imbalanced: "calculations" has only 7.5% │
│    Recommended: Generate ~1,500 more        │
│                                             │
│ [Adjust Targets]              [Continue →]  │
└─────────────────────────────────────────────┘
```

---

## Phase 2: Data Augmentation

### Step E — Generate Synthetic Samples

**Purpose:** Fill coverage gaps with LLM-generated prompts.

**User Configures:**
- Target distribution (or accept recommended)
- Generation method (few-shot from examples)
- Quality settings

**Process:**
1. For each under-represented topic:
   - Sample existing prompts as examples
   - Generate new prompts using LLM
   - Validate generated prompts (structure + quality)

**User Sees:**
- Generation progress per topic
- Validation pass rate
- Sample previews

**Output:** `synthetic_prompts.jsonl`

```
┌─────────────────────────────────────────────┐
│ Generate Synthetic Samples                  │
├─────────────────────────────────────────────┤
│ Filling coverage gaps...                    │
│                                             │
│ calculations:                               │
│   Target: +1,500  Generated: 1,423          │
│   ████████████████████ 95% valid            │
│                                             │
│ tool_usage:                                 │
│   Target: +800   Generated: 756             │
│   ██████████████████░░ 90% valid            │
│                                             │
│ Preview generated sample:                   │
│ ┌─────────────────────────────────────────┐ │
│ │ "Calculate the compound interest on..." │ │
│ └─────────────────────────────────────────┘ │
│ [Regenerate] [Edit]                         │
│                                             │
│                            [Continue →]     │
└─────────────────────────────────────────────┘
```

---

### Step F — Review Final Distribution

**Purpose:** Confirm combined dataset is balanced and ready.

**User Sees:**
- Before/after comparison
- Final distribution chart
- Train/validation split preview
- Total dataset size

**Output:** 
- `rft_prompts.train.jsonl`
- `rft_prompts.valid.jsonl`

```
┌─────────────────────────────────────────────┐
│ Final Dataset Distribution                  │
├─────────────────────────────────────────────┤
│                  Before    After            │
│ data_queries     38.0%  →  32.1%           │
│ calculations      7.5%  →  18.2%  ✓ Fixed  │
│ content_gen      27.3%  →  24.5%           │
│ tool_usage       17.9%  →  16.8%           │
│ other             9.3%  →   8.4%           │
│                                             │
│ Total: 11,892 → 14,071 (+18.3%)            │
│   From traces:    11,892 (84.5%)            │
│   Synthetic:       2,179 (15.5%)            │
│                                             │
│ Train/Valid Split: 12,664 / 1,407 (90/10)  │
│                                             │
│ [Adjust Split]                [Continue →]  │
└─────────────────────────────────────────────┘
```

---

## Phase 3: Validation & Training

### Step G — Define Evaluation Function (Grader)

**Purpose:** Configure how model outputs will be scored.

**User Chooses:**
1. **Preset** - Pre-configured for common goals
2. **Custom** - Build multi-dimensional grader

**Preset Options:**
| Preset | What it measures |
|--------|------------------|
| Correctness | Factual accuracy via LLM judge |
| Format Compliance | JSON validity, schema match |
| Tool Usage | Correct tool selection & execution |
| Conciseness | Length + completeness balance |

**Output:** `grader_config.json`

```
┌─────────────────────────────────────────────┐
│ Define Evaluation Function                  │
├─────────────────────────────────────────────┤
│ How should model outputs be scored?         │
│                                             │
│ ● Use Preset                                │
│   [Better Tool Usage ▼]                     │
│                                             │
│   Dimensions:                               │
│   • tool_selection (40%) - Right tool?      │
│   • tool_input (30%) - Valid parameters?    │
│   • result_usage (30%) - Used correctly?    │
│                                             │
│ ○ Custom Configuration                      │
│   Build your own multi-grader               │
│                                             │
│ [Preview Grader]              [Continue →]  │
└─────────────────────────────────────────────┘
```

---

### Step H — Dry Run Validation

**Purpose:** Test grader on sample data to assess:
1. **Dataset quality** - Are prompts answerable?
2. **Grader quality** - Does it differentiate good/bad?

**Process:**
1. Sample N prompts (recommend 200-500)
2. Generate responses with base model
3. Score with configured grader
4. Analyze distribution

**Interpretation Guide:**

| Signal | Dataset Issue | Grader Issue |
|--------|---------------|--------------|
| Mean < 0.10 | Prompts too hard | Grader too strict |
| Mean > 0.90 | Prompts too easy | Grader too lenient |
| Std < 0.10 | - | Grader can't differentiate |
| Bimodal (0 or 1) | - | Grader needs calibration |

**User Sees:**
- Score histogram
- Statistics (mean, std, min, max)
- Breakdown by topic
- Sample outputs with scores
- Diagnosis and recommendations

```
┌─────────────────────────────────────────────┐
│ Dry Run Validation                   [🟢 GO]│
├─────────────────────────────────────────────┤
│ Tested: 300 samples                         │
│                                             │
│ Score Distribution:                         │
│     ██                                      │
│    ████                                     │
│   ██████  ██                                │
│  ████████████  ██                           │
│ ██████████████████                          │
│ 0.0  0.2  0.4  0.6  0.8  1.0               │
│                                             │
│ Mean: 0.42  Std: 0.21                       │
│                                             │
│ ✓ Dataset quality: Good                     │
│   Base model can partially solve tasks      │
│                                             │
│ ✓ Grader quality: Good                      │
│   Scores differentiate outputs well         │
│                                             │
│ By Topic:                                   │
│   data_queries:  0.51 (good)                │
│   calculations:  0.38 (room to improve)     │
│   content_gen:   0.45 (good)                │
│                                             │
│ [View Samples] [Adjust Grader] [Train →]    │
└─────────────────────────────────────────────┘
```

**NO-GO Example:**
```
┌─────────────────────────────────────────────┐
│ Dry Run Validation              [🔴 NO-GO]  │
├─────────────────────────────────────────────┤
│ Tested: 300 samples                         │
│                                             │
│ Score Distribution:                         │
│ ████████████████████                        │
│ ██░░░░░░░░░░░░░░░░░░                        │
│ 0.0  0.2  0.4  0.6  0.8  1.0               │
│                                             │
│ Mean: 0.08  Std: 0.12                       │
│                                             │
│ ⚠️ Diagnosis:                               │
│                                             │
│ Possible causes:                            │
│ 1. Dataset issue: Prompts too difficult     │
│    → Base model can't perform these tasks   │
│    → Recommendation: Use SFT first          │
│                                             │
│ 2. Grader issue: Scoring too strict         │
│    → Grader rejects valid outputs           │
│    → Recommendation: Review grader config   │
│                                             │
│ [Review Dataset] [Adjust Grader] [Run SFT]  │
└─────────────────────────────────────────────┘
```

---

### Step I — Train RFT Model

**Purpose:** Execute reinforcement fine-tuning.

**User Configures:**
- Base model
- Training budget
- Evaluation frequency

**User Sees:**
- Training progress
- Reward curves (train + validation)
- ETA

```
┌─────────────────────────────────────────────┐
│ Training in Progress                        │
├─────────────────────────────────────────────┤
│ ████████████░░░░░░░░ 60%                    │
│                                             │
│ Epoch: 1 / 2                                │
│ Train Reward:  0.52 (+24% from baseline)    │
│ Valid Reward:  0.48 (+14% from baseline)    │
│ ETA: ~2 hours                               │
│                                             │
│ [Cancel Training]                           │
└─────────────────────────────────────────────┘
```

---

### Step J — Results & Deploy

**Purpose:** Review training results and deploy model.

**User Sees:**
- Before/after score comparison
- Improvement by topic
- Sample output comparisons
- Regression warnings (if any)

```
┌─────────────────────────────────────────────┐
│ Training Complete ✅                        │
├─────────────────────────────────────────────┤
│                                             │
│ Overall: 0.42 → 0.67  (+60% improvement)    │
│                                             │
│ By Topic:                                   │
│   data_queries:  0.51 → 0.72  (+41%)        │
│   calculations:  0.38 → 0.61  (+61%) 🎉     │
│   content_gen:   0.45 → 0.68  (+51%)        │
│                                             │
│ Sample Comparison:                          │
│ ┌───────────────────┬───────────────────┐   │
│ │ Before            │ After             │   │
│ │ Score: 0.35       │ Score: 0.72       │   │
│ │ [View Output]     │ [View Output]     │   │
│ └───────────────────┴───────────────────┘   │
│                                             │
│ [Run Benchmarks]           [Deploy Model →] │
└─────────────────────────────────────────────┘
```

---

## Visual Flow Summary

```
INPUT: raw_traces.jsonl
       │
       ▼
┌──────────────┐
│ A: Sanitize  │──→ Remove malformed records
│    Data      │
└──────┬───────┘
       ▼
┌──────────────┐
│ B: Define    │──→ Create topic taxonomy
│    Topics    │
└──────┬───────┘
       ▼
┌──────────────┐
│ C: Categorize│──→ Assign records to topics
│    Records   │
└──────┬───────┘
       ▼
┌──────────────┐
│ D: Review    │──→ See current distribution
│    Coverage  │    Identify gaps
└──────┬───────┘
       ▼
┌──────────────┐
│ E: Generate  │──→ Fill gaps with LLM
│    Samples   │
└──────┬───────┘
       ▼
┌──────────────┐
│ F: Review    │──→ Confirm balanced dataset
│    Final     │    Create train/valid split
└──────┬───────┘
       ▼
┌──────────────┐
│ G: Define    │──→ Configure reward function
│    Grader    │
└──────┬───────┘
       ▼
┌──────────────┐
│ H: Dry Run   │──→ Test: Is dataset good?
│    Validation│    Test: Is grader good?
└──────┬───────┘
       │
       │ Pass?
       ▼
┌──────────────┐
│ I: Train     │──→ Run RFT
│    Model     │
└──────┬───────┘
       ▼
┌──────────────┐
│ J: Deploy    │──→ Ship improved model
│    Model     │
└──────────────┘
```

---

[Next: Data Pipeline →](./03_Data_Pipeline.md)
