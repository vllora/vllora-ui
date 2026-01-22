# 02 - User Journey

[← Back to Index](./00_INDEX.md) | [← Previous](./01_Core_Concepts.md)

---

## Dataset Details Page

The RFT pipeline starts from the **Dataset Details** page. Users can perform actions on their dataset at any time.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Dataset: Customer Support Traces                                        │
├─────────────────────────────────────────────────────────────────────────┤
│ Records: 12,453 total │ Valid: 11,892 │ Invalid: 561                    │
│ Topics: 5 defined     │ Categorized: 11,234 (94.5%)                     │
│ Generated: 1,434      │ Last sanitized: 2 hours ago                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Sanitize Data]  [Manage Topics]  [Generate Samples]  [Start RFT →]   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Available Actions

| Action | When to Use | Can Repeat? |
|--------|-------------|-------------|
| **Sanitize Data** | After upload, after edits, after generation | ✅ Anytime |
| **Manage Topics** | Define/edit topic hierarchy | ✅ Anytime |
| **Categorize** | After topics defined, after new data | ✅ Anytime |
| **Generate Samples** | After coverage gaps identified | ✅ Anytime |
| **Start RFT** | When dataset is ready | ✅ Multiple runs |

---

## Flexible Workflow

Unlike a linear pipeline, users can perform actions in any order and repeat as needed:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATASET ACTIONS (Repeatable)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│   │   Sanitize   │ ←─→ │    Topics    │ ←─→ │  Categorize  │           │
│   │    Data      │     │   & Coverage │     │   Records    │           │
│   └──────────────┘     └──────────────┘     └──────────────┘           │
│          ↑                    ↑                    ↑                    │
│          │                    │                    │                    │
│          └────────────────────┴────────────────────┘                    │
│                               ↑                                         │
│                      ┌──────────────┐                                   │
│                      │   Generate   │                                   │
│                      │   Samples    │                                   │
│                      └──────────────┘                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                ↓
                    (When ready, user clicks "Start RFT")
                                ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         RFT TRAINING FLOW (Linear)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  Define Grader  →   Dry Run Validation   →   Train   →   Deploy        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Typical User Workflows

### Workflow 1: First Time Setup
```
1. Upload traces to dataset
2. Click [Sanitize Data] → see valid/invalid counts
3. Click [Manage Topics] → auto-generate topics
4. Records get categorized automatically
5. Review coverage → click [Generate Samples] if gaps exist
6. Click [Start RFT] → define grader → dry run → train
```

### Workflow 2: Add More Data
```
1. Upload additional traces (or import from file)
2. Click [Sanitize Data] → validates new + existing records
3. New records get categorized into existing topics
4. Review coverage → generate more if needed
```

### Workflow 3: Fix Bad Generated Data
```
1. Review generated samples → some are low quality
2. Delete bad generated records
3. Click [Generate Samples] again with different settings
4. Click [Sanitize Data] to revalidate
```

### Workflow 4: Retrain with Updated Data
```
1. Production data shows new patterns
2. Upload new traces
3. [Sanitize] → [Categorize] → maybe adjust topics
4. Click [Start RFT] for new training run
```

---

## Journey Overview

### Phase 1: Dataset Preparation (Repeatable Actions)

| Step | Action | Trigger | Notes |
|------|--------|---------|-------|
| A | Sanitize Data | Manual button | Run after any data changes |
| B | Define Topics | Manual button | Can edit anytime |
| C | Categorize Records | Auto after topics, or manual | Assigns topics to records |
| D | Review Coverage | Automatic | Shows distribution stats |
| E | Generate Samples | Manual button | Fill coverage gaps |

### Phase 2: RFT Training (Linear Flow)

| Step | Action | Trigger | Notes |
|------|--------|---------|-------|
| F | Define Grader | Start of RFT flow | Configure evaluation |
| G | Dry Run | Automatic | Validates dataset + grader |
| H | Train Model | After dry run passes | Execute RFT |
| I | Deploy | After training | Ship to production |

---

## Phase 1: Dataset Preparation (Repeatable Actions)

### Action A — Sanitize Data

**Trigger:** `[Sanitize Data]` button in Dataset Details  
**Can Repeat:** ✅ Yes - run after uploads, edits, or generation

**Purpose:** Validate all records, mark invalid ones, remove duplicates.

**When to Run:**
- After uploading new traces
- After editing records manually
- After generating synthetic samples
- After importing from file
- Anytime data quality is uncertain

**Process:**
1. Validate JSON structure
2. Check message format (must end with user)
3. Validate tool call chains
4. Remove duplicates
5. Filter by token length

**User Sees:**
- Total records / valid / invalid counts
- Rejection breakdown by error type
- "View rejected samples" option

**Updates:** Sets `valid` flag on each record

```
┌─────────────────────────────────────────────┐
│ Sanitize Data                        [Run]  │
├─────────────────────────────────────────────┤
│ Records to validate: 12,453                 │
│                                             │
│ Processing... ████████████████████ 100%     │
│                                             │
│ Results:                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ ✓ Valid:             11,892 (95.5%)     │ │
│ │ ✗ Invalid:              473 (3.8%)      │ │
│ │   - Last not user:      156             │ │
│ │   - Empty message:       98             │ │
│ │   - Tool chain error:    79             │ │
│ │   - Other:              140             │ │
│ │ ⊘ Duplicates:            88 (0.7%)      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [View Invalid Records] [Download Report]    │
└─────────────────────────────────────────────┘
```

---

### Action B — Manage Topics

**Trigger:** `[Manage Topics]` button in Dataset Details  
**Can Repeat:** ✅ Yes - edit hierarchy anytime

**Purpose:** Create/edit the taxonomy for categorizing records.

**Options:**
1. **Auto-generate** - System clusters and labels topics using embeddings
2. **Use template** - Start from predefined industry templates
3. **Manual define** - User creates custom hierarchy

**User Sees:**
- Topic tree editor (add/edit/delete/reorder)
- Description per topic
- Record count per topic
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

### Action C — Categorize Records

**Trigger:** Automatic after topics saved, or `[Re-categorize]` button  
**Can Repeat:** ✅ Yes - re-run after topic changes or new data

**Purpose:** Assign each record to a topic in the hierarchy.

**When to Run:**
- Automatically after defining/editing topics
- After uploading new data
- After sanitization flags new valid records
- Manually to re-categorize with updated settings

**Process:**
1. Embed all uncategorized records
2. Classify into topics (using embeddings or LLM)
3. Handle edge cases (multi-topic, uncategorized)

**User Sees:**
- Progress indicator
- Categorization confidence distribution
- Records needing manual review (low confidence)

**Updates:** Sets `topic` field on each record

```
┌─────────────────────────────────────────────┐
│ Categorize Records                   [Run]  │
├─────────────────────────────────────────────┤
│ ████████████████░░░░ 80%                    │
│                                             │
│ Processed: 9,514 / 11,892                   │
│                                             │
│ High confidence (>0.8):    8,234 (86.5%)    │
│ Medium confidence:         1,012 (10.6%)    │
│ Needs review (<0.5):         268 (2.8%)     │
│                                             │
│ [View Low Confidence]                       │
└─────────────────────────────────────────────┘
```

---

### Step D — Review Coverage Distribution

---

### Display D — Coverage Distribution

**Trigger:** Automatic - always visible in Dataset Details  
**Updates:** Automatically when records change

**Purpose:** Show current dataset composition and identify gaps.

**User Sees:**
- Distribution chart by topic
- Gaps highlighted (topics with few samples)
- Target vs actual comparison
- Balance score

**Key Metrics:**
- Records per topic
- % of total per topic
- Balance score (min/max ratio)

```
┌─────────────────────────────────────────────┐
│ Coverage Distribution              [Refresh]│
├─────────────────────────────────────────────┤
│                                             │
│ data_queries      ████████████████ 4,521    │
│ calculations      ████░░░░░░░░░░░░   892 ⚠️ │
│ content_gen       ████████████░░░░ 3,245    │
│ tool_usage        ██████████░░░░░░ 2,134    │
│ other             ████░░░░░░░░░░░░ 1,100    │
│                                             │
│ Balance Score: 0.20 (Poor)                  │
│ ⚠️ "calculations" has only 7.5%             │
│    Recommended: Generate ~1,500 more        │
│                                             │
│ [Set Targets]                               │
└─────────────────────────────────────────────┘
```

---

### Action E — Generate Samples

**Trigger:** `[Generate Samples]` button in Dataset Details  
**Can Repeat:** ✅ Yes - generate more anytime

**Purpose:** Fill coverage gaps with LLM-generated records.

**When to Run:**
- After identifying coverage gaps
- After deleting bad generated records
- To increase dataset size for specific topics

**User Configures:**
- Target counts per topic (or accept recommended)
- Generation method (few-shot from examples)
- Quality settings

**Process:**
1. For each under-represented topic:
   - Sample existing records as examples
   - Generate new records using LLM
   - Validate generated records (structure + quality)

**Creates:** New `DatasetRecord` with `is_generated: true`

```
┌─────────────────────────────────────────────┐
│ Generate Samples                     [Run]  │
├─────────────────────────────────────────────┤
│ Topics to fill:                             │
│ ☑ calculations    +1,500 (current: 892)     │
│ ☑ tool_usage      +300   (current: 2,134)   │
│ ☐ other           +0     (current: 1,100)   │
│                                             │
│ Total to generate: 1,800 records            │
│                                             │
│                    [Cancel] [Start Generation]│
└─────────────────────────────────────────────┘
```

**During generation:**
```
┌─────────────────────────────────────────────┐
│ Generating Samples...                       │
├─────────────────────────────────────────────┤
│ calculations:                               │
│   Target: +1,500  Generated: 1,423          │
│   ████████████████████ 95% valid            │
│                                             │
│ tool_usage:                                 │
│   Target: +300   Generated: 285             │
│   ██████████████████░░ 95% valid            │
│                                             │
│ Preview:                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ "Calculate the compound interest on..." │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Stop] [View Generated]                     │
└─────────────────────────────────────────────┘
```

---

### Display F — Dataset Summary

**Trigger:** Automatic - always visible in Dataset Details  
**Updates:** After any action (sanitize, generate, categorize)

**Purpose:** Show overall dataset readiness for RFT training.

**User Sees:**
- Total records breakdown
- Source distribution (traces vs generated)
- Validation status
- Balance score

```
┌─────────────────────────────────────────────┐
│ Dataset Summary                             │
├─────────────────────────────────────────────┤
│ Total Records:    14,071                    │
│   From traces:    11,892 (84.5%)            │
│   Generated:       2,179 (15.5%)            │
│                                             │
│ Validation:                                 │
│   Valid:          13,856 (98.5%)            │
│   Invalid:           215 (1.5%)             │
│                                             │
│ Coverage:                                   │
│   Categorized:    14,071 (100%)             │
│   Balance Score:  0.75 (Good)               │
│                                             │
│ Ready for RFT: ✅ Yes                        │
│                                             │
│                           [Start RFT →]     │
└─────────────────────────────────────────────┘
```

---

## Phase 2: RFT Training (Linear Flow)

When the user clicks `[Start RFT]`, they enter a linear wizard flow.

### Step F — Configure Train/Validation Split

**Purpose:** Define how to split records for training.

**User Configures:**
- Train/validation ratio (default 90/10)
- Stratification options
- Minimum validation size

```
┌─────────────────────────────────────────────┐
│ Configure Dataset Split                     │
├─────────────────────────────────────────────┤
│ Total valid records: 13,856                 │
│                                             │
│ Train/Validation Split:                     │
│ [████████████████████░░] 90% / 10%          │
│                                             │
│ Train set:       12,470 records             │
│ Validation set:   1,386 records             │
│                                             │
│ ☑ Stratify by topic (recommended)           │
│ ☐ Include generated data in validation      │
│                                             │
│              [← Back]  [Continue →]         │
└─────────────────────────────────────────────┘
```

---

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
┌─────────────────────────────────────────────────────────────────────────┐
│                    DATASET DETAILS PAGE                                 │
│                    (Repeatable Actions)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐                                                      │
│   │  [Sanitize]  │ ←──── Run anytime: after upload, edit, generation   │
│   │    Button    │                                                      │
│   └──────┬───────┘                                                      │
│          │ validates records                                            │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │  [Manage     │ ←──── Define/edit topic hierarchy                   │
│   │   Topics]    │                                                      │
│   └──────┬───────┘                                                      │
│          │ triggers categorization                                      │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │  Categorize  │ ←──── Auto or manual, assigns topic to records      │
│   │   Records    │                                                      │
│   └──────┬───────┘                                                      │
│          │ updates coverage                                             │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │  Coverage    │ ←──── Always visible, shows distribution            │
│   │  Dashboard   │                                                      │
│   └──────┬───────┘                                                      │
│          │ shows gaps                                                   │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │  [Generate   │ ←──── Fill gaps with LLM-generated records          │
│   │   Samples]   │                                                      │
│   └──────────────┘                                                      │
│          │                                                              │
│          │ (user can repeat any action above)                           │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ [Start RFT]  │ ←──── When dataset is ready                         │
│   └──────────────┘                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         RFT TRAINING WIZARD                             │
│                         (Linear Flow)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐                                                      │
│   │ F: Configure │──→ Set train/validation split                       │
│   │    Split     │                                                      │
│   └──────┬───────┘                                                      │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ G: Define    │──→ Configure grader (preset or custom)              │
│   │    Grader    │                                                      │
│   └──────┬───────┘                                                      │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ H: Dry Run   │──→ Validate dataset + grader quality                │
│   └──────┬───────┘                                                      │
│          │                                                              │
│      Pass? ──No──→ [Back to adjust grader or dataset]                   │
│          │                                                              │
│         Yes                                                             │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ I: Train     │──→ Execute RFT training                             │
│   │    Model     │                                                      │
│   └──────┬───────┘                                                      │
│          ▼                                                              │
│   ┌──────────────┐                                                      │
│   │ J: Deploy    │──→ Ship to production                               │
│   └──────────────┘                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

[Next: Data Sanitization →](./03_Data_Sanitization.md)
