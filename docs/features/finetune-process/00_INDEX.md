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

### Three-Phase Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 1: DATA PREPARATION                          │
├─────────────────────────────────────────────────────────────────────────┤
│  A: Sanitize    →   B: Define    →   C: Categorize   →   D: Review     │
│     Data            Topics           Records             Coverage       │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: DATA AUGMENTATION                         │
├─────────────────────────────────────────────────────────────────────────┤
│  E: Generate Samples    →    F: Review Final Distribution               │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 3: VALIDATION & TRAINING                     │
├─────────────────────────────────────────────────────────────────────────┤
│  G: Define      →   H: Dry Run   →   I: Train    →   J: Deploy         │
│     Grader          Validation        Model           Model             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step Summary

| Step | Name | Purpose | Output |
|------|------|---------|--------|
| **A** | Sanitize Data | Remove malformed records | `sanitized_prompts.jsonl` |
| **B** | Define Topics | Create category taxonomy | `topic_hierarchy.json` |
| **C** | Categorize Records | Assign prompts to topics | `categorized_prompts.jsonl` |
| **D** | Review Coverage | Analyze current distribution | `coverage_report.json` |
| **E** | Generate Samples | Fill gaps with LLM | `synthetic_prompts.jsonl` |
| **F** | Review Final | Confirm balanced dataset | `rft_prompts.train/valid.jsonl` |
| **G** | Define Grader | Configure evaluation function | `grader_config.json` |
| **H** | Dry Run | Validate dataset + grader quality | `dry_run_report.json` |
| **I** | Train | Execute RFT training | Fine-tuned model |
| **J** | Deploy | Ship to production | Deployed endpoint |

---

## Pipeline Diagram

```
INPUT: raw_traces.jsonl
       │
       ▼
┌──────────────┐
│ A: Sanitize  │──→ Validate structure, remove broken records
└──────┬───────┘
       ▼
┌──────────────┐
│ B: Define    │──→ Auto-generate or manually define topics
│    Topics    │
└──────┬───────┘
       ▼
┌──────────────┐
│ C: Categorize│──→ Classify each prompt into a topic
└──────┬───────┘
       ▼
┌──────────────┐
│ D: Review    │──→ See distribution, identify gaps
│    Coverage  │
└──────┬───────┘
       ▼
┌──────────────┐
│ E: Generate  │──→ LLM creates prompts for under-represented topics
└──────┬───────┘
       ▼
┌──────────────┐
│ F: Review    │──→ Confirm balance, create train/valid split
│    Final     │
└──────┬───────┘
       ▼
┌──────────────┐
│ G: Define    │──→ Configure how outputs are scored
│    Grader    │
└──────┬───────┘
       ▼
┌──────────────┐
│ H: Dry Run   │──→ Test dataset quality + grader quality
└──────┬───────┘
       │
   Pass? ──No──→ [Adjust grader] or [Use SFT first]
       │
      Yes
       ▼
┌──────────────┐
│ I: Train     │──→ Run RFT training
└──────┬───────┘
       ▼
┌──────────────┐
│ J: Deploy    │──→ Ship improved model
└──────────────┘
```

---

## Key Principles

### 1. Sanitize First
Clean data before investing time in categorization. Bad data = wasted effort.

### 2. Understand Your Data
Topic hierarchy and coverage analysis help you see what you have before deciding what to generate.

### 3. Balance Before Training
Imbalanced datasets lead to models that only excel in over-represented areas.

### 4. Validate Both Dataset AND Grader
Dry run tells you two things:
- **Dataset quality:** Can the base model do these tasks at all?
- **Grader quality:** Does the evaluation function differentiate good from bad?

### 5. RFT ≠ SFT
- RFT needs prompts + grader (not gold answers)
- Model generates responses during training
- Grader provides learning signal

---

## Output Artifacts

| Phase | Artifact | Description |
|-------|----------|-------------|
| Prep | `sanitized_prompts.jsonl` | Clean, valid prompts |
| Prep | `topic_hierarchy.json` | Category taxonomy |
| Prep | `categorized_prompts.jsonl` | Prompts with topic assignments |
| Prep | `coverage_report.json` | Distribution analysis |
| Aug | `synthetic_prompts.jsonl` | LLM-generated prompts |
| Aug | `rft_prompts.train.jsonl` | Training dataset (80-90%) |
| Aug | `rft_prompts.valid.jsonl` | Validation dataset (10-20%) |
| Val | `grader_config.json` | Evaluation function |
| Val | `dry_run_report.json` | Pre-training diagnostics |

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
