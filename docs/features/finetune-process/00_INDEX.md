# RFT Fine-Tuning From Traces
## Complete Specification Index

> **Goal:** Build an application feature that lets a semi-technical user create a high-quality **RFT (Reinforcement Fine-Tuned)** model from their existing **LLM traces**, in a **few clicks**.

**Spec Version:** 3.5  
**Last Updated:** January 23, 2026  
**Validation Status:** ✅ Verified against OpenAI, Azure, AWS Bedrock documentation

---

## Prerequisites

**Input:** `raw_traces.jsonl` - Production LLM interaction logs (from trace selection module)

---

## Quick Links

| Module | Description | When to Read |
|--------|-------------|--------------|
| [01 - Core Concepts](./01_Core_Concepts.md) | What is RFT, data formats, definitions | Start here |
| [02 - User Journey](./02_User_Journey.md) | Complete 7-step pipeline flow | Product/Design |
| [03 - Data Sanitization](./03_Data_Sanitization.md) | Automatic validation rules | Engineering |
| [04 - Topic & Categorization](./04_Topic_Categorization.md) | Topic hierarchy & record classification | Engineering |
| [05 - Coverage & Generation](./05_Coverage_Generation.md) | Distribution analysis & synthetic generation | Engineering |
| [06 - Grader Setup](./06_Grader_Setup.md) | Evaluation function configuration | Engineering |
| [07 - Dry Run Validation](./07_Dry_Run_Validation.md) | Pre-training validation (CRITICAL) | Engineering/QA |
| [08 - Training & Deploy](./08_Training_Deploy.md) | RFT execution & deployment | Engineering |
| [09 - UI Screens](./09_UI_Screens.md) | Canvas-based UI specification | Design/Frontend |
| [10 - Code Reference](./10_Code_Reference.md) | Implementation code examples | Engineering |
| [11 - Appendix](./11_Appendix.md) | Presets, platform notes, sources | Reference |

---

## Architecture Overview

### Canvas-Based Pipeline

The RFT product uses a **visual canvas** showing the pipeline as connected nodes. Users can click any step to see details and take actions.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATASET CANVAS                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  HEALTH INDICATOR (auto-validates on any data change)                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ✓ 1,008 valid    ⚠ 34 invalid (3%)           [View Issues]     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  7-STEP PIPELINE (visual nodes)                                         │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐                │
│  │Extract  │──▶│Topics & │──▶│Coverage │──▶│ Grader  │                │
│  │         │   │Categortic│   │         │   │         │                │
│  └─────────┘   └─────────┘   └─────────┘   └────┬────┘                │
│                                                  ▼                      │
│               ┌─────────┐   ┌─────────┐   ┌─────────┐                  │
│               │ Deploy  │◀──│  Train  │◀──│ Dry Run │                  │
│               └─────────┘   └─────────┘   └─────────┘                  │
│                                                                         │
│  DATA ACTIONS: [📥 Import] [📤 Export]                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Steps (7 Total)

| Step | Name | Category | Description |
|------|------|----------|-------------|
| 1 | Extract Records | Data Prep | Pull traces from gateway or import file |
| 2 | Topics & Categorization | Data Prep | Define hierarchy + assign topics to records |
| 3 | Review Coverage | Data Prep | Check balance, generate if needed |
| 4 | Define Grader | Validation | Configure scoring criteria |
| 5 | Dry Run | Validation | Test grader, GO/NO-GO decision |
| 6 | Train Model | Training | Run RFT training |
| 7 | Deploy | Training | Push to gateway |

### Health Indicator (Automatic Validation)

Data validation is **NOT a pipeline step**. It runs automatically:
- On initial data load
- After importing records
- After generating synthetic data
- After editing records

Invalid records are excluded from training but kept in database for review.

### Data Management

| Action | Description |
|--------|-------------|
| Import Records | Append or replace dataset (JSONL) |
| Export Records | Download dataset (JSONL) |
| Import Topics | Upload topic hierarchy (JSON) |
| Export Topics | Download topic hierarchy (JSON) |

---

## Key Principles

### 1. Visual Pipeline
Users see the entire pipeline as a canvas with connected nodes. Click any step to see details and take actions.

### 2. Automatic Validation
Data sanitization runs automatically — no manual "Sanitize" button. The Health Indicator shows status at all times.

### 3. Steps Are Re-triggerable
All pipeline steps can be re-run anytime. Steps that modify data show confirmation dialogs.

### 4. Balance Before Training
Imbalanced datasets lead to models that only excel in over-represented areas. Coverage step helps identify and fill gaps.

### 5. Validate Both Dataset AND Grader
Dry run tells you two things:
- **Dataset quality:** Can the base model do these tasks at all?
- **Grader quality:** Does the evaluation function differentiate good from bad?

### 6. RFT ≠ SFT
- RFT needs prompts + grader (not gold answers)
- Model generates responses during training
- Grader provides learning signal

---

## Data Storage

All data is stored in the database, not files:

| Data | Storage | Key Fields |
|------|---------|------------|
| Records | `DatasetRecord` table | `data`, `topic`, `is_generated`, `metadata` |
| Topics | `Dataset.topicHierarchy` | Topic tree JSON |
| Grader Config | `RFTJob.graderConfig` | Grader JSON |
| Training Results | `RFTJob` table | Model ID, metrics, status |

---

## Platform Support

| Platform | Models | Grader Types |
|----------|--------|--------------|
| OpenAI | o4-mini | string_check, text_similarity, score_model, python, multi |
| Azure | o4-mini, GPT-5 (preview) | Same as OpenAI |
| AWS Bedrock | Amazon Nova 2 Lite | Lambda functions, Model-as-Judge |

---

## Getting Started

1. **Product/Design:** Start with [User Journey](./02_User_Journey.md)
2. **Engineering:** Start with [Core Concepts](./01_Core_Concepts.md) → [Data Sanitization](./03_Data_Sanitization.md)
3. **QA:** Focus on [Dry Run Validation](./07_Dry_Run_Validation.md)
4. **Implementation:** See [Code Reference](./10_Code_Reference.md)
