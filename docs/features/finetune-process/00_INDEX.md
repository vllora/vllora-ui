# RFT Fine-Tuning From Traces
## Complete Specification Index

> **Goal:** Build an application feature that lets a semi-technical user create a high-quality **RFT (Reinforcement Fine-Tuned)** model from their existing **LLM traces**, in a **few clicks**.

**Spec Version:** 3.0  
**Last Updated:** January 22, 2026  
**Validation Status:** ✅ Verified against OpenAI, Azure, AWS Bedrock documentation

---

## Prerequisites

**Input:** `raw_traces.jsonl` - Production LLM interaction logs (from trace selection module)

---

## Quick Links

| Module | Description | When to Read |
|--------|-------------|--------------|
| [01 - Core Concepts](./01_Core_Concepts.md) | What is RFT, data formats, definitions | Start here |
| [02 - User Journey](./02_User_Journey.md) | Complete 10-step UX flow (A-J) | Product/Design |
| [03 - Data Sanitization](./03_Data_Sanitization.md) | Hygiene filter & validation rules | Engineering |
| [04 - Topic & Categorization](./04_Topic_Categorization.md) | Topic hierarchy & record classification | Engineering |
| [05 - Coverage & Generation](./05_Coverage_Generation.md) | Distribution analysis & synthetic generation | Engineering |
| [06 - Grader Setup](./06_Grader_Setup.md) | Evaluation function configuration | Engineering |
| [07 - Dry Run Validation](./07_Dry_Run_Validation.md) | Pre-training validation (CRITICAL) | Engineering/QA |
| [08 - Training & Deploy](./08_Training_Deploy.md) | RFT execution & deployment | Engineering |
| [09 - UI Screens](./09_UI_Screens.md) | UI mockups for all 10 steps | Design/Frontend |
| [10 - Code Reference](./10_Code_Reference.md) | Implementation code examples | Engineering |
| [11 - Appendix](./11_Appendix.md) | Presets, platform notes, sources | Reference |

---

## Architecture Overview

### Two-Part Flow

The RFT pipeline has two distinct parts:

1. **Dataset Preparation** (Repeatable Actions) - User can run these anytime from Dataset Details page
2. **RFT Training** (Linear Wizard) - User enters this flow when dataset is ready

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 DATASET DETAILS PAGE (Repeatable)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Sanitize]  ←→  [Manage Topics]  ←→  [Generate Samples]               │
│       ↓              ↓                      ↓                           │
│   validates      categorizes           fills gaps                       │
│   records        records               with LLM                         │
│                                                                         │
│                   Coverage Dashboard (always visible)                   │
│                                                                         │
│                         [Start RFT →]                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                     RFT TRAINING WIZARD (Linear)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Configure   →   Define    →   Dry Run   →   Train   →   Deploy        │
│  Split           Grader        Validation     Model       Model         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Dataset Actions (Repeatable)

| Action | Button | When to Use |
|--------|--------|-------------|
| Sanitize | `[Sanitize Data]` | After upload, edit, generation |
| Topics | `[Manage Topics]` | Define/edit category hierarchy |
| Generate | `[Generate Samples]` | Fill coverage gaps |

### RFT Flow (Linear)

| Step | Name | Purpose |
|------|------|---------|
| F | Configure Split | Set train/validation ratio |
| G | Define Grader | Configure evaluation function |
| H | Dry Run | Validate dataset + grader quality |
| I | Train | Execute RFT training |
| J | Deploy | Ship to production |

---

## Key Principles

### 1. Actions Are Repeatable
Users can sanitize, categorize, and generate multiple times. This allows iterative improvement of the dataset.

### 2. Sanitize First
Clean data before investing time in categorization. Bad data = wasted effort.

### 3. Understand Your Data
Topic hierarchy and coverage analysis help you see what you have before deciding what to generate.

### 4. Balance Before Training
Imbalanced datasets lead to models that only excel in over-represented areas.

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
