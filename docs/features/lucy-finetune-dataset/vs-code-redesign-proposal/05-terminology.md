# Terminology Standardization

---

## Current Inconsistencies -> Standard Terms

| Concept | Current Terms (mixed) | Standard Term |
|---------|----------------------|---------------|
| Quality scoring | "evaluator", "grader", "quality scoring", "quality grader" | **Evaluation** (tab label, UI text) |
| Training jobs | "Finetune", "training", "jobs" | **Fine-tune** (tab/UI), "fine-tuning" (in sentences) |
| Reference files | "Docs", "knowledge sources", "documents", "reference materials" | **Documents** (user-facing), `knowledgeSource` (code-internal) |
| AI records | "generated", "synthetic", "AI-generated" | **Generated** (UI badge/filter) |
| Setup process | "setup plan", "plan", "onboarding plan" | **Plan** (consistent) |

---

## Specific Changes

| Location | Current | New | File |
|----------|---------|-----|------|
| Quick action label | "Set up quality scoring" | "Set up evaluation" | `LucyDatasetAssistant.tsx:57` |
| Quick action label | "configure-grader" | "configure-evaluation" | `LucyDatasetAssistant.tsx:57` |
| Sidebar proactive prompt | "observability" mention | Remove/update | `LucyDatasetAssistant.tsx:458` |
| SectionTabs tooltip | "quality grader" | "evaluation" | `SectionTabs.tsx:107` (if exists) |
