# 11 - Appendix

[← Back to Index](./00_INDEX.md) | [← Previous](./10_Code_Reference.md)

---

## Goal Presets

### Preset: Correctness

```json
{
  "name": "correctness",
  "objectives": ["accuracy", "completeness"],
  "grader_weights": {
    "accuracy": 0.7,
    "completeness": 0.3
  },
  "evaluation_model": "gpt-4o-mini"
}
```

### Preset: Tool Usage

```json
{
  "name": "tool_usage",
  "objectives": ["tool_selection", "tool_execution", "result_usage"],
  "grader_weights": {
    "tool_selected": 0.3,
    "tool_params_valid": 0.3,
    "result_used_correctly": 0.4
  }
}
```

### Preset: Format Compliance

```json
{
  "name": "format_compliance",
  "objectives": ["valid_json", "schema_match"],
  "grader_weights": {
    "valid_json": 0.5,
    "has_required_fields": 0.5
  },
  "grader_type": "python"
}
```

### Preset: Conciseness

```json
{
  "name": "conciseness",
  "objectives": ["answers_question", "brevity"],
  "grader_weights": {
    "answers_question": 0.6,
    "conciseness": 0.4
  },
  "constraints": {
    "max_output_tokens": 200
  }
}
```

---

## Platform Reference

### OpenAI

| Item | Value |
|------|-------|
| Models | o4-mini (o-series only) |
| API | `fine_tuning.jobs.create` |
| Method | `{"type": "reinforcement"}` |
| Grader Types | string_check, text_similarity, score_model, python, multi |
| Required | train + validation datasets |

### Azure / Foundry

| Item | Value |
|------|-------|
| Models | o4-mini, GPT-5 (preview) |
| Grader Types | Same as OpenAI |
| Note | "Final message must be assigned a user role" |

### AWS Bedrock

| Item | Value |
|------|-------|
| Models | Amazon Nova 2 Lite |
| Grader Types | Lambda functions, Model-as-Judge |
| Note | "Struggles with sparse rewards (<5% positive)" |

---

## Validation Sources

This spec was validated against:

| Source | Verified |
|--------|----------|
| OpenAI RFT API Documentation | ✅ |
| OpenAI Reinforcement Fine-Tuning Cookbook | ✅ |
| Microsoft Azure Foundry RFT Guide | ✅ |
| AWS Bedrock Model Customization Guide | ✅ |
| DeepSeek-R1 Paper | ✅ |
| RLVR Research | ✅ |

### Key Quotes

**OpenAI:**
> "RFT relies on a programmable grader that scores every candidate response during training."

**OpenAI Cookbook:**
> "Run evals before using RFT. If eval scores at minimum or maximum, RFT won't be useful."

**Microsoft:**
> "Both training and validation dataset must be provided. Final message must be assigned a user role."

**AWS Bedrock:**
> "Pre-training evaluation required. If rewards consistently 0%, use SFT first. Avoid noise in your data."

---

## Glossary

| Term | Definition |
|------|------------|
| **RFT** | Reinforcement Fine-Tuning |
| **SFT** | Supervised Fine-Tuning |
| **Grader** | Reward function scoring outputs (0.0-1.0) |
| **Trace** | Production LLM interaction log |
| **Seed Prompt** | Prompt extracted from traces |
| **Synthetic Prompt** | LLM-generated prompt for coverage |
| **Topic Hierarchy** | Category taxonomy for prompts |
| **Coverage** | Distribution of prompts across topics |
| **Dry Run** | Pre-training grader validation |
| **Reward Hacking** | Model gaming grader without real quality |

---

## Differentiating Features

Features NOT provided by OpenAI/Azure/Bedrock:

| Feature | Benefit |
|---------|---------|
| Auto topic generation | Automatic category discovery |
| Record categorization | Organized prompt management |
| Coverage analysis | Visual distribution insights |
| Gap-filling generation | Targeted synthetic data |
| Comprehensive dry run | Diagnose dataset + grader issues |
| End-to-end pipeline | Trace → trained model automation |

---

## Pipeline Summary

| Step | Name | Purpose |
|------|------|---------|
| A | Sanitize | Clean malformed data |
| B | Topics | Define category hierarchy |
| C | Categorize | Assign prompts to topics |
| D | Coverage | Analyze distribution |
| E | Generate | Fill gaps with LLM |
| F | Review | Confirm balanced dataset |
| G | Grader | Configure evaluation |
| H | Dry Run | Validate before training |
| I | Train | Run RFT |
| J | Deploy | Ship to production |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-20 | Initial spec |
| 2.0 | 2025-01-21 | Added validation, train/valid split, platform verification |
| 2.1 | 2025-01-22 | Removed trace selection (separate module) |
| 3.0 | 2025-01-22 | Redesigned journey: repeatable actions, topic categorization flow |
| 3.5 | 2025-01-23 | Canvas-based UI: 8-step pipeline, auto-validation (Health Indicator), import/export data |
| 3.6 | 2025-01-23 | Combined Topics & Categorization into single step (7-step pipeline) |

---

## Contact

For questions about this spec, contact the ML Platform team.

---

[← Back to Index](./00_INDEX.md)
