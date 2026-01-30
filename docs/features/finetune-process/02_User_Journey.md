# 02 - User Journey

[← Back to Index](./00_INDEX.md) | [← Previous](./01_Core_Concepts.md)

---

## Overview

The RFT product follows a 7-step pipeline. Users can:
- Trigger any step to see details and take actions
- Re-trigger any step at any time
- Import/export data at any point

**Key Feature:** Data validation (sanitization) is **automatic**, not a step.

---

## Entry Points

### 1. Datasets List (`/finetune`)

View all datasets, each showing:
- Record count, topic count, balance score
- Mini pipeline progress (7 steps)
- Current status

**Actions:** Create new, open existing, duplicate, export, delete

### 2. Create Dataset (`/finetune/new`)

Two modes:
- **From Gateway Traces** — Filter and select traces from your LLM gateway
- **Upload File** — Import existing JSONL dataset

---

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

The Health Indicator shows validation status at all times. **This is NOT a pipeline step.**

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

### Step 1 — Extract Data

**Purpose:** Create initial dataset from traces or uploaded file.

**Actions:**
| Action | Description |
|--------|-------------|
| Pull New Traces | Extract new traces since last pull |
| View Records | Browse all extracted records |
| Import File | Upload JSONL file |

**Re-trigger:** Can pull new traces anytime. New records get validated automatically.

---

### Step 2 — Topics & Category

**Purpose:** Define topic hierarchy AND assign each record to a topic.

**Actions:**
| Action | Description |
|--------|-------------|
| Edit Topics | Modify topic hierarchy |
| Regenerate | Re-generate topics from data (clears assignments) |
| View Low Confidence | Show records with confidence < 0.7 |

**Topic Generation Options:**
1. **Auto-generate** — System clusters and labels topics using embeddings
2. **Use template** — Start from predefined industry templates  
3. **Manual define** — User creates custom hierarchy

**Auto-behavior:**
- After topics defined → Categorization runs automatically
- After topics edited → Re-categorization prompt offered

**Status Logic:**
| Condition | Status Badge |
|-----------|--------------|
| No topics defined | Waiting |
| Topics defined, categorizing... | Processing |
| All categorized, low confidence < 5% | Complete |
| All categorized, low confidence ≥ 5% | Attention |

---

### Step 3 — Coverage Analysis

**Purpose:** Analyze topic distribution and identify gaps.

**Auto-runs:** After categorization completes.

**Actions:**
| Action | Description |
|--------|-------------|
| View Dashboard | Detailed distribution charts |
| Generate | Open generation modal for gap topics |
| View Gaps | Show under-represented records |
| Skip | Continue to grader |

**Balance Score:**
- `> 0.6` = Good (Complete)
- `0.3–0.6` = Attention needed
- `< 0.3` = Poor (generate recommended)

---

### Step 4 — Grader Config

**Purpose:** Configure how model outputs will be scored during training.

**Does NOT auto-run:** Requires user configuration.

**Grader Types:**
| Type | Best For |
|------|----------|
| LLM as a Judge | Subjective quality assessment |
| Script | Format validation, deterministic checks |

**Actions:**
| Action | Description |
|--------|-------------|
| Edit Grader | Configure grader type and settings |
| Test Sample | Run grader on 5 random records |

---

### Step 5 — Dry Run

**Purpose:** Test dataset + grader quality before training.

**GO/NO-GO Criteria:**
| Metric | GO | CAUTION | NO-GO |
|--------|-----|---------|-------|
| Mean Score | > 0.2 | 0.1–0.2 | < 0.1 |
| % Scoring > 0 | > 70% | 50–70% | < 50% |
| Std Dev | > 0.10 | 0.05–0.10 | < 0.05 |

**Actions:**
| Action | Description |
|--------|-------------|
| Full Results | View detailed score distribution |
| Re-run | Run dry run again |
| Adjust Grader | Go back to grader config |

---

### Step 6 — Train Model

**Purpose:** Execute RFT training.

**Training Configuration:**
- Base model selection
- Train/validation split (default 90/10)
- Stratify by topic option

**Actions:**
| Action | Description |
|--------|-------------|
| Start Training | Begin RFT training |
| Cancel | Cancel in-progress training |
| View Logs | See training progress |

---

### Step 7 — Deploy

**Purpose:** Ship trained model to production.

**Deployment Options:**
- **Replace in gateway** — All traffic routes to fine-tuned model
- **New endpoint only** — Access via explicit model ID
- **A/B test** — Split traffic between base and fine-tuned

**Actions:**
| Action | Description |
|--------|-------------|
| Run Benchmarks | Test model against test set |
| Test Playground | Interactive testing |
| Deploy | Push to production |

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
