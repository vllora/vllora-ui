# 02 - User Journey

[← Back to Index](./00_INDEX.md) | [← Previous](./01_Core_Concepts.md)

---

## Overview

The RFT product uses a **visual canvas** showing an 7-step pipeline as connected nodes. Users can:
- Click any step to see details and take actions
- Re-trigger any step at any time
- Import/export data at any point

**Key Feature:** Data validation (sanitization) is **automatic**, not a step. The Health Indicator shows validation status at all times.

---

## Entry Points

### 1. Datasets List (`/optimization`)

View all datasets, each showing:
- Record count, topic count, balance score
- Mini pipeline progress (7 steps)
- Current status

**Actions:** Create new, open existing, duplicate, export, delete

### 2. Create Dataset (`/optimization/new`)

Two modes:
- **From Gateway Traces** — Filter and select traces from your LLM gateway
- **Upload File** — Import existing JSONL dataset

---

## Dataset Canvas (`/optimization/:id`)

The main view for working with a dataset.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ chess-tutor                          [📊 Records] [📥 Import] [⚙️]     │
├─────────────────────────────────────────────────────────────────────────┤
│ HEALTH: ✓ 1,008 valid    ⚠ 34 invalid (3%)            [View Issues]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐                │
│  │1.Extract│──▶│2.Topics │──▶│3.Cover. │──▶│4.Grader │                │
│  │   ✅    │   │  & Cat. │   │   ⚠️    │   │   ✅    │                │
│  └─────────┘   │   ✅    │   └────┬────┘   └────┬────┘                │
│                └─────────┘        │              │                      │
│                                   ▼              ▼                      │
│                ┌─────────┐   ┌─────────┐   ┌─────────┐                 │
│                │7.Deploy │◀──│6.Train  │◀──│5.DryRun │                 │
│                │   ⬜    │   │   ⬜    │   │   ✅    │                 │
│                └─────────┘   └─────────┘   └─────────┘                 │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ DETAIL PANEL (selected step)                                           │
│ 3. Review Coverage                                      ⚠️ Attention   │
│ Balance: 0.35 • 2 topics under-represented                             │
│ [📊 Dashboard] [✨ Generate] [📋 View Records] [Skip →]                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Steps (7 Total)

| Step | Name | Auto-Runs? | User Actions |
|------|------|------------|--------------|
| 1 | Extract Records | On create | Pull new traces, view records |
| 2 | Topics & Categorization | Yes (auto-generate + assign) | Edit topics, regenerate, view low confidence |
| 3 | Review Coverage | Yes (after categorize) | View dashboard, generate samples |
| 4 | Define Grader | No (needs user input) | Configure grader, test on sample |
| 5 | Dry Run | No (manual trigger) | View results, re-run |
| 6 | Train Model | No (manual trigger) | Start training, cancel |
| 7 | Deploy | No (manual trigger) | Deploy, test in playground |

---

## Health Indicator (Automatic Validation)

The Health Indicator bar shows validation status at all times. **This is NOT a pipeline step.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ✓ 1,008 valid records    ⚠ 34 invalid (3%)            [View Issues]   │
└─────────────────────────────────────────────────────────────────────────┘
```

**When validation runs:**
- Initial dataset creation
- After importing records
- After generating synthetic data
- After editing records

**Validation checks:**
- JSON structure valid
- Messages array exists
- Has user message
- Tool calls properly formed
- Within token limits

**Invalid records are:**
- Excluded from training
- Kept in database for review
- Viewable via "View Issues" button

---

## Typical User Workflows

### Workflow 1: First Time from Traces
```
1. Click [+ New Dataset] from list
2. Filter traces (time range, model, etc.)
3. Select traces, provide name and objective
4. Click [Create & Start] → Canvas opens
5. Pipeline auto-runs: Extract → Topics → Categorize → Coverage
6. Review coverage → Generate if needed
7. Configure grader → Dry run → Check GO/NO-GO
8. Start training → Deploy
```

### Workflow 2: Upload Existing Dataset
```
1. Click [+ New Dataset] from list
2. Switch to "Upload File" tab
3. Drag & drop JSONL file
4. Provide name and objective
5. Click [Create & Start] → Canvas opens
6. Continue from step 5 above
```

### Workflow 3: Add More Data to Existing Dataset
```
1. Open dataset from list → Canvas
2. Click [📥 Import] → "Append Records"
3. Upload additional JSONL file
4. Health Indicator validates automatically
5. Click Step 2 (Topics & Categorization) → Re-categorize unlabeled
6. Review coverage → Generate if needed
7. Re-run dry run → Verify quality
```

### Workflow 4: Iterate Based on Dry Run
```
1. Dry run shows NO-GO (scores too low)
2. Check: Is it data issue or grader issue?
   
   If DATA issue:
   - Generate more samples for weak topics
   - Import higher quality examples
   - Delete poor records
   
   If GRADER issue:
   - Adjust grader configuration
   - Change scoring weights
   - Try different preset
   
3. Re-run dry run → Check improvement
4. Repeat until GO
```

### Workflow 5: Update Topics
```
1. Current topics don't reflect data well
2. Click Step 2 (Topics & Categorization) → "Regenerate Topics"
3. ⚠️ Warning: "This will clear topic assignments"
4. Confirm → Topics regenerated, auto-categorization runs
5. Review new coverage distribution
```

### Workflow 6: Export and Share
```
1. Open dataset → Click [📥 Import] menu
2. Select "Download Records" → JSONL file saved
3. Select "Download Topics" → JSON file saved
4. Share files with team
5. Team member creates new dataset → Upload mode
```

---

## Step-by-Step Details

### Step 1 — Extract Records

**Purpose:** Create initial dataset from traces or uploaded file.

**On Canvas:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Extract Records                                          ✅ Complete │
│                                                                         │
│ 1,042 records extracted from gateway traces                             │
│ Source: Last 7 days • Model: gpt-4o                                    │
│                                                                         │
│ [↻ Pull New Traces] [📋 View Records]                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Actions:**
| Action | Description |
|--------|-------------|
| Pull New Traces | Extract new traces since last pull (append) |
| View Records | Open records overlay |

**Re-trigger:** Can pull new traces anytime. New records get validated automatically.

---

### Step 2 — Topics & Categorization

**Purpose:** Define topic hierarchy AND assign each record to a topic.

**On Canvas (Complete state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Topics & Categorization                                  ✅ Complete │
│                                                                         │
│ 7 topics • 1,008 records categorized (100%)                            │
│ High confidence: 892 (88%) • Medium: 98 (10%) • Low: 18 (2%)           │
│                                                                         │
│ [✏️ Edit Topics] [↻ Regenerate] [📋 Low Confidence]                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**On Canvas (In Progress state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Topics & Categorization                                  ⏳ Running  │
│                                                                         │
│ 7 topics defined                                                        │
│ Categorizing... ████████████████░░░░░░░░░░░░░░  52%                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**On Canvas (Attention state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Topics & Categorization                                 ⚠️ Attention │
│                                                                         │
│ 7 topics • 1,008 records categorized                                   │
│ ⚠️ 89 records (9%) have low confidence — review recommended            │
│                                                                         │
│ [✏️ Edit Topics] [↻ Regenerate] [📋 Low Confidence]                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Topic Generation Options:**
1. **Auto-generate** — System clusters and labels topics using embeddings
2. **Use template** — Start from predefined industry templates  
3. **Manual define** — User creates custom hierarchy

**Actions:**
| Action | Description |
|--------|-------------|
| Edit Topics | Open topic editor modal |
| Regenerate | Warning, then regenerate topics + re-categorize |
| Low Confidence | View records with confidence < 0.7 |

**Auto-behavior:**
- After topics defined → Categorization runs automatically
- After topics edited → Re-categorization prompt offered

**Status Logic:**
| Condition | Status |
|-----------|--------|
| No topics defined | ⬜ Waiting |
| Topics defined, categorizing... | ⏳ Running |
| All categorized, low confidence < 5% | ✅ Complete |
| All categorized, low confidence ≥ 5% | ⚠️ Attention |

---

### Step 3 — Review Coverage

**Purpose:** Analyze topic distribution and identify gaps.

**On Canvas (Attention state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. Review Coverage                                      ⚠️ Attention    │
│                                                                         │
│ Balance Score: 0.35 (Poor)                                              │
│                                                                         │
│ Topic Distribution:                                                     │
│ openings   ████████████████░░░░  38%  (target: 25%)                    │
│ tactics    ████░░░░░░░░░░░░░░░░   8%  (target: 20%)  🔴 -120 records   │
│ endgames   ██████████████░░░░░░  27%  (target: 25%)                    │
│ strategy   ██████████░░░░░░░░░░  18%  (target: 20%)  🟡 -20 records    │
│                                                                         │
│ [📊 Full Dashboard] [✨ Generate] [📋 View Gaps] [Skip →]              │
└─────────────────────────────────────────────────────────────────────────┘
```

**Auto-runs:** After categorization completes.

**Actions:**
| Action | Description |
|--------|-------------|
| Full Dashboard | Open coverage modal with detailed charts |
| Generate | Open generation modal (pre-filled for gap topics) |
| View Gaps | Show records from under-represented topics |
| Skip | Continue to grader (if imbalance is acceptable) |

**Balance Score:**
- `1.0` = Perfect balance
- `> 0.6` = Good
- `0.3–0.6` = Attention needed
- `< 0.3` = Poor (generate recommended)

---

### Step 4 — Define Grader

**Purpose:** Configure how model outputs will be scored during training.

**On Canvas (LLM Judge configured):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Define Grader                                            ✅ Complete │
│                                                                         │
│ Type: LLM as a Judge                                                    │
│ Model: gpt-4o-mini • Temperature: 0                                     │
│                                                                         │
│ Prompt: "Rate the response quality from 0 to 1..."                      │
│                                                                         │
│ [✏️ Edit Grader] [🧪 Test Sample]                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**On Canvas (Script configured):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. Define Grader                                            ✅ Complete │
│                                                                         │
│ Type: Script (JavaScript)                                               │
│ Code: function grade(input) { ... }                                     │
│                                                                         │
│ [✏️ Edit Grader] [🧪 Test Sample]                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Does NOT auto-run:** Requires user configuration.

**Grader Types:**
| Type | Best For | Configuration |
|------|----------|---------------|
| LLM as a Judge | Subjective quality assessment | Prompt + JSON schema + model config |
| Script | Format validation, deterministic checks | JavaScript code |

**Actions:**
| Action | Description |
|--------|-------------|
| Edit Grader | Open grader configuration modal |
| Test Sample | Run grader on 5 random records |

---

### Step 5 — Dry Run

**Purpose:** Test dataset + grader quality before training.

**On Canvas (GO state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Dry Run                                              ✅ 🟢 GO        │
│                                                                         │
│ Tested 300 samples • Mean: 0.45 • Std: 0.18                            │
│                                                                         │
│ Score Distribution:                                                     │
│      ██                                                                 │
│     ████                                                                │
│    ██████  ██                                                           │
│   ████████████████                                                      │
│   0.0   0.2   0.4   0.6   0.8   1.0                                    │
│                                                                         │
│ [📊 Full Results] [↻ Re-run] [🚀 Start Training]                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**On Canvas (NO-GO state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Dry Run                                              ❌ 🔴 NO-GO     │
│                                                                         │
│ Tested 300 samples • Mean: 0.08 • Std: 0.09                            │
│                                                                         │
│ ⚠️ Problem: Scores too low                                              │
│                                                                         │
│ Likely causes:                                                          │
│ 1. Dataset too hard — base model can't perform tasks                   │
│ 2. Grader too strict — valid outputs scored as failures                │
│                                                                         │
│ [📊 Full Results] [✏️ Adjust Grader] [↻ Re-run]                        │
└─────────────────────────────────────────────────────────────────────────┘
```

**GO/NO-GO Criteria:**
| Metric | GO | CAUTION | NO-GO |
|--------|-----|---------|-------|
| Mean Score | > 0.2 | 0.1–0.2 | < 0.1 |
| % Scoring > 0 | > 70% | 50–70% | < 50% |
| Std Dev | > 0.10 | 0.05–0.10 | < 0.05 |

---

### Step 6 — Train Model

**Purpose:** Execute RFT training.

**On Canvas (Ready state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. Train Model                                              ⬜ Ready    │
│                                                                         │
│ Ready to start training                                                 │
│                                                                         │
│ Dataset: 1,008 valid records                                            │
│ Grader: Tool Usage                                                      │
│ Dry Run: 🟢 GO (mean: 0.45)                                            │
│                                                                         │
│                        [🚀 Start Training →]                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**On Canvas (Training state):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. Train Model                                           ⏳ Training    │
│                                                                         │
│ ████████████████░░░░░░░░░░░░░░  45%                                    │
│                                                                         │
│ Epoch: 1 / 2                                                            │
│ Train Reward: 0.52 (+24%)                                               │
│ Valid Reward: 0.48 (+14%)                                               │
│ ETA: ~2 hours                                                           │
│                                                                         │
│ [Cancel Training]                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Training Configuration (in Start Training modal):**
- Base model selection
- Train/validation split (default 90/10)
- Stratify by topic option

---

### Step 7 — Deploy

**Purpose:** Ship trained model to production.

**On Canvas:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. Deploy                                                   ⬜ Ready    │
│                                                                         │
│ Model ready: ft:gpt-4o:chess-tutor:abc123                              │
│ Improvement: 0.45 → 0.67 (+49%)                                        │
│                                                                         │
│ [Run Benchmarks] [Test Playground] [🚀 Deploy →]                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Deployment Options:**
- **Replace in gateway** — All traffic routes to fine-tuned model
- **New endpoint only** — Access via explicit model ID
- **A/B test** — Split traffic between base and fine-tuned

---

## Data Management Actions

Available from the header menu at any time.

### Import Records

**Modes:**
- **Append** — Add to existing records
- **Replace** — Delete all, import fresh

**Format:** JSONL with `messages` array per line.

**After import:**
1. Health Indicator validates automatically
2. New records appear as "uncategorized"
3. User can re-run categorization

### Export Records

Downloads all records as JSONL file.

### Import/Export Topics

**Export:** Download topic hierarchy as JSON
**Import:** Upload hierarchy (with option to keep or clear assignments)

---

## Next Steps

See detailed specifications:
- [03 - Data Sanitization](./03_Data_Sanitization.md) — Validation rules
- [04 - Topic & Categorization](./04_Topic_Categorization.md) — Topic system
- [05 - Coverage & Generation](./05_Coverage_Generation.md) — Balance and synthetic data
- [06 - Grader Setup](./06_Grader_Setup.md) — Evaluation configuration
- [07 - Dry Run Validation](./07_Dry_Run_Validation.md) — GO/NO-GO criteria
- [08 - Training & Deploy](./08_Training_Deploy.md) — RFT execution
