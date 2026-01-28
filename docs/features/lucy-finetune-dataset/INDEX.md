# Lucy Finetune Agent - Documentation Index

## Overview

This folder contains modular documentation for the Lucy Finetune Agent. The docs are organized to support either:
1. **Single agent** - All docs combined into one agent prompt
2. **Multi-agent** - Each doc becomes a specialized sub-agent

## Current Architecture: Single Agent

```
┌─────────────────────────────────────────────────────────────┐
│                   vllora_finetune_agent                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Agent Prompt                        │   │
│  │  (gateway/agents/finetune/vllora-finetune-agent.md) │   │
│  │                    ~373 lines                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Tools: 18 total (workflow + step + data access)           │
└─────────────────────────────────────────────────────────────┘
```

## Potential Architecture: Multi-Agent

```
┌─────────────────────────────────────────────────────────────┐
│                   finetune_coordinator                      │
│                    (Main Agent)                             │
│                                                             │
│  sub_agents = ["analysis", "topics", "generation", "training"]
│                                                             │
└──────────┬──────────┬──────────┬──────────┬────────────────┘
           │          │          │          │
           ▼          ▼          ▼          ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ analysis │ │  topics  │ │generation│ │ training │
    │  agent   │ │  agent   │ │  agent   │ │  agent   │
    └──────────┘ └──────────┘ └──────────┘ └──────────┘
         │            │            │            │
         ▼            ▼            ▼            ▼
    02-analysis  03-topics   04-generation 05-training
       .md          .md          .md          .md
```

## Documentation Files

| File | Lines | Purpose | Potential Sub-Agent |
|------|-------|---------|---------------------|
| `01-overview.md` | 91 | Role, context, workflow overview | Shared (all agents) |
| `02-analysis.md` | 151 | Dataset analysis, initial suggestions | `analysis_agent` |
| `03-topics.md` | 138 | Topics config & categorization | `topics_agent` |
| `04-generation.md` | 153 | Coverage analysis & synthetic data | `generation_agent` |
| `05-training.md` | 248 | Grader, dry run, training, deploy | `training_agent` |
| `06-rules.md` | 192 | Critical rules & interaction patterns | Shared (all agents) |
| `README.md` | 1742 | Original design document | Reference only |

**Total modular docs: ~973 lines**

## Sub-Agent Tool Distribution

When splitting into sub-agents, tools would be distributed as:

### analysis_agent
```toml
[tools]
external = [
  "get_dataset_stats",
  "get_dataset_records"
]
```
- Read-only analysis
- Suggests topic hierarchy (text only, no tool calls)

### topics_agent
```toml
[tools]
external = [
  "start_finetune_workflow",
  "apply_topic_hierarchy",
  "categorize_records",
  "get_workflow_status"
]
```
- Initializes workflow
- Applies approved hierarchy
- Runs categorization

### generation_agent
```toml
[tools]
external = [
  "analyze_coverage",
  "generate_synthetic_data",
  "get_workflow_status",
  "advance_to_step"
]
```
- Coverage analysis
- Synthetic data generation
- Iterates until balanced

### training_agent
```toml
[tools]
external = [
  "configure_grader",
  "test_grader_sample",
  "upload_dataset",
  "sync_evaluator",
  "run_dry_run",
  "start_training",
  "check_training_status",
  "deploy_model",
  "get_workflow_status"
]
```
- Grader configuration
- Dry run validation
- Training execution
- Model deployment

## When to Split

Consider splitting into sub-agents when:

| Condition | Threshold |
|-----------|-----------|
| Agent prompt size | > 25-30 KB |
| Agent struggles to follow step-specific instructions | Frequently |
| Need different model settings per step | Yes |
| Token costs too high | Significant concern |

**Current status:** Single agent is sufficient (~12 KB prompt)

## How to Switch to Multi-Agent

1. **Create coordinator agent:**
```toml
---
name = "finetune_coordinator"
sub_agents = ["analysis_agent", "topics_agent", "generation_agent", "training_agent"]
---
# Coordinator instructions (minimal)
Route to appropriate sub-agent based on workflow state.
```

2. **Create sub-agent files:**
```
gateway/agents/finetune/
├── vllora-finetune-agent.md      (current single agent)
├── coordinator.md                 (new coordinator)
├── analysis-agent.md              (from 01-overview + 02-analysis + 06-rules)
├── topics-agent.md                (from 01-overview + 03-topics + 06-rules)
├── generation-agent.md            (from 01-overview + 04-generation + 06-rules)
└── training-agent.md              (from 01-overview + 05-training + 06-rules)
```

3. **Each sub-agent includes:**
   - `01-overview.md` - Shared context
   - Step-specific doc (`02-05`)
   - `06-rules.md` - Shared rules

## Session State Sharing

Sub-agents share context through:
- Same `session_id` - Access to shared session values
- Same `thread_id` - Related execution traces
- `workflow_id` - Passed between agents for state continuity

## File Organization

```
lucy-finetune-dataset/
├── INDEX.md              ← You are here
├── README.md             ← Original design document
├── 01-overview.md        ← Shared: Role, context, tools
├── 02-analysis.md        ← analysis_agent
├── 03-topics.md          ← topics_agent
├── 04-generation.md      ← generation_agent
├── 05-training.md        ← training_agent
└── 06-rules.md           ← Shared: Rules for all agents
```
