# UI Review & Competitor Analysis

> Date: 2026-03-19
> Status: Research complete, prioritized recommendations

---

## Current UI Audit Summary

### Area Ratings

| Area | Rating | Coverage | Key Strengths |
|------|--------|----------|---------------|
| **Records View** | Excellent | 95% | Hierarchical grouping, dynamic score columns, trend indicators |
| **Record Sidebar** | Excellent | 95% | Eval/Train split, breadcrumbs, source context, prev/next nav |
| **Topic Management** | Excellent | 90% | Tree editing, AI generation, canvas visualization |
| **Knowledge Sources** | Good | 85% | Coverage matrix, search, part viewer, topic linkage |
| **Finetune Charts** | Good | 85% | Stacked lanes, toggleable metrics, synced hover, insight text |
| **Evaluator/Grader** | Good | 85% | Monaco editor, version history, git-style diffs |
| **Real-time Polling** | Good | 85% | 10s cycle, live progress, streaming results |
| **Eval Job Detail** | Good | 80% | Verdict system (GO/WARNING/NO-GO), histogram, per-topic breakdown |
| **Eval Runs Overview** | Good | 80% | Score trend chart, version column, model column, tooltips |
| **Navigation** | Good | 80% | Tab system, keyboard shortcuts, breadcrumbs, sidebar |
| **Training Jobs Overview** | Good | 75% | Score comparison bar chart, version column, clickable rows |
| **Record Editing** | Basic | 65% | JSON editor only, topic reassignment |
| **Export** | Basic | 40% | CSV for eval results only |

### What Works Well

- **Topic-aware evaluation**: Per-topic score breakdown is unique and very useful
- **Score trend visualization**: Area chart with std dev band, zone indicators (TARGET/ACCEPTABLE/CRITICAL)
- **Record detail sidebar**: Clean eval/train split with trend arrows, source context, navigation
- **Evaluator versioning**: Git-style diffs between versions, staleness detection badges
- **Training metrics**: Stacked lane chart with toggleable legend, synced crosshair
- **Verdict system**: GO/WARNING/NO-GO with actionable recommendations
- **Cross-navigation**: Click score in records table to jump to job detail, click record in eval results to jump to topic view

### Key Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| **Model output preview** | Critical | We never show the actual generated text the model produced. Users can't judge quality. |
| **Playground** | High | No way to interactively test the fine-tuned model from the UI |
| **Training duration/cost** | Medium | No elapsed time or cost info displayed |
| **Score-range filtering** | Medium | Records table has search + topic filter but no score filter |
| **Metrics export** | Medium | Training metrics (loss/reward) can't be exported |
| **Record-level diff** | Medium | No view showing "which records improved/regressed between eval v1 and v2" |
| **Regression alerts** | Medium | No notification when eval scores drop from previous run |
| **Deep linking** | Low | Can't share a URL to a specific record/job/view |
| **Bulk operations** | Low | No bulk edit, bulk re-evaluate, bulk delete |
| **Form-based editing** | Low | JSON-only record editing, no field-level UI |

---

## Competitor Analysis

### Platform Overview

| Platform | Focus | Strengths |
|----------|-------|-----------|
| **OpenAI** | End-to-end fine-tuning | Comparative Playground, RFT graders, checkpoint management |
| **Together AI** | Training infrastructure | Cost estimation, continued training from checkpoints, 100B+ model support |
| **Fireworks AI** | Training + deployment | Multi-LoRA (100 adapters), auto hyperparameter sweeps, one-click deployment |
| **Predibase** | LoRA fine-tuning | Per-step adapter creation, instant checkpoint loading, scale-to-zero |
| **HuggingFace AutoTrain** | Zero-code training | Multi-task support, local+cloud, direct Hub publishing |
| **Braintrust** | Evaluation platform | 25+ scorers, dataset versioning, CI/CD integration, regression detection |
| **Humanloop** | Prompt + eval management | Immutable versioning, spider plots, human-in-the-loop feedback |
| **H2O LLM Studio** | Open-source training | Validation prediction insights (best/worst/random samples), experiment comparison |

### Feature Comparison Matrix

| Feature | vLLora | OpenAI | Together | Fireworks | Predibase | Braintrust | Humanloop |
|---------|--------|--------|----------|-----------|-----------|------------|-----------|
| **Job list + status** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Training loss curves** | Yes (stacked lanes) | Yes | Via W&B | Yes | Yes | N/A | N/A |
| **Eval score trend** | Yes (area + std band) | Yes | No | Basic | No | Yes | Yes |
| **Per-topic breakdown** | **Yes** | No | No | No | No | No | No |
| **Source doc lineage** | **Yes** | No | No | No | No | No | No |
| **Topic hierarchy + canvas** | **Yes** | No | No | No | No | No | No |
| **Evaluator versioning** | **Yes (git diffs)** | No | No | No | No | Yes | Yes |
| **RFT diagnostics/verdict** | **Yes (GO/WARN/NO-GO)** | Basic | No | No | No | Basic | Basic |
| **Score distribution chart** | Yes (histogram + box) | No | No | No | No | Yes | No |
| **Model output preview** | **No** | Yes (Playground) | No | No | Yes (per-step) | Yes (traces) | Yes (review) |
| **Interactive playground** | **No** | Yes | No | No | Yes (instant) | Yes | Yes |
| **Cost estimation** | **No** | No | Yes | No | No | Yes | Yes |
| **Training duration** | **No** | Yes | Yes | Yes | Yes | N/A | N/A |
| **Dataset versioning** | No | No | No | No | No | Yes | Yes |
| **CI/CD integration** | No | No | No | Yes | No | Yes | No |
| **Multi-LoRA serving** | No | No | No | Yes (100) | Yes (unlimited) | N/A | N/A |
| **Spider/radar chart** | No | No | No | No | No | No | Yes |
| **Regression detection** | No | No | No | No | No | Yes | Yes |
| **Advanced dataset filter** | Basic | No | No | Basic | Basic | Yes (SQL) | Yes |
| **Human feedback loop** | No | No | No | No | No | Manual | Yes |
| **Hyperparameter sweeps** | No | No | No | Yes | No | N/A | N/A |
| **Checkpoint management** | Basic | Epoch-based | Step-based | Yes | Per-step | N/A | N/A |
| **Weights download** | Yes | Yes | Yes | Yes | Yes | N/A | N/A |

### Our Unique Advantages (things nobody else has)

1. **Topic-aware evaluation**: Per-topic score breakdown with hierarchical topic tree. No other platform groups evaluation results by topic.

2. **Source document lineage**: Full pipeline from PDF extraction → chunking → records → topics → evaluation scores. Users can trace any score back to the original source document.

3. **Coverage matrix**: Visual grid showing which source documents cover which topics, with gap detection.

4. **Canvas view**: Node-based visual hierarchy of topics with coverage indicators and inline record expansion.

5. **Evaluator git-style diffs**: Version history with unified diff format showing exactly what changed in the evaluator between versions. Only Braintrust and Humanloop have evaluator versioning, but our diff view is more detailed.

6. **RFT-specific diagnostics**: GO/WARNING/NO-GO verdict based on score distribution analysis with actionable recommendations (e.g., "evaluator may be too lenient", "consider adding harder examples"). OpenAI has basic reward hacking warnings but nothing this comprehensive.

7. **Skill-driven pipeline**: The 7-step pipeline driven by Claude Code skill (Topics → Categorization → Generation → Grader → Evaluation → Training → Deployment) is unique to our platform.

8. **Stacked lane metrics chart**: Training metrics (loss, KL, grad norm, learning rate) each rendered in their own visual band within one chart. Avoids the scale compression problem that every other platform solves with separate charts.

---

## Recommended Improvements (Prioritized)

### P0 — Critical Gap (competitive disadvantage)

#### Model Output Preview
- **What**: Show the actual text the model generated alongside the evaluation score
- **Why**: Every serious competitor (OpenAI, Braintrust, Humanloop, H2O) shows this. Users cannot judge quality without seeing outputs.
- **Where**: Eval job detail (expand a result row to see the generated response), Record sidebar (show model response per eval/training run)
- **Effort**: Medium — requires API changes (cloud needs to store/return the generated response text)
- **Reference**: OpenAI Comparative Playground, Braintrust trace viewer, H2O's "Validation Prediction Insights"

### P1 — High Impact, Low Effort

#### Training Duration Display
- **What**: Show elapsed time for completed jobs ("Took 2h 15m") and estimated remaining time for running jobs
- **Why**: Basic expectation. Every training platform shows this.
- **Where**: Job detail header, jobs overview table
- **Effort**: Small — `created_at` and `completed_at` are already available on `FinetuneJob`

#### Score-Range Filter on Records Table
- **What**: Add a score range slider/input to filter records by their eval or training scores
- **Why**: Users need to find low-scoring records to improve their data
- **Where**: UnifiedTableToolbar, alongside existing search and topic filter
- **Effort**: Small — score data already exists in the dynamic columns

### P2 — Medium Impact, Medium Effort

#### Spider/Radar Chart for Criteria Breakdown
- **What**: When the evaluator returns multiple criteria scores (accuracy, clarity, completeness, etc.), show them as a radar chart instead of a flat list
- **Why**: Instant visual of strengths/weaknesses across criteria. Humanloop uses this effectively.
- **Where**: Eval job detail, replacing or supplementing the current criteria pills in the footer
- **Effort**: Medium — Recharts supports radar charts, criteria data already available
- **Reference**: Humanloop spider plots

#### Run-Level Regression Alert
- **What**: When a new eval run completes, compare its mean score against the previous run. If it drops significantly (>5%), show a warning banner.
- **Why**: Braintrust and Humanloop both auto-detect regressions. Prevents silent quality degradation.
- **Where**: Eval Runs Overview (banner), eval job detail (compared-to-previous indicator)
- **Effort**: Medium — need to compute delta at completion time

#### Record-Level Diff Between Runs
- **What**: View showing which specific records improved or regressed between two eval runs
- **Why**: Helps users understand what changed and where to focus improvement efforts
- **Where**: New view accessible from Eval Runs Overview (select two runs to compare)
- **Effort**: Medium — data exists, need new comparison component

#### Metrics Export
- **What**: Download training metrics (loss, reward, KL, etc.) as CSV for external analysis
- **Why**: Power users want to analyze metrics in notebooks or spreadsheets
- **Where**: Button in the training metrics chart area
- **Effort**: Small — data is already in memory, just need CSV serialization

### P3 — Nice to Have

#### Interactive Playground
- **What**: Type a prompt, get a response from the fine-tuned model in real-time
- **Why**: OpenAI, Braintrust, Predibase all offer this. Essential for "does my model actually work?"
- **Where**: New page/panel accessible from job detail (for succeeded jobs)
- **Effort**: Large — requires inference endpoint, model loading, streaming response UI
- **Note**: Predibase's "instant checkpoint loading" via LoRAX is the gold standard here

#### Cost Estimation / Tracking
- **What**: Show estimated cost before starting a job, and actual cost after completion
- **Why**: Together AI's pre-launch cost estimation is very popular
- **Where**: New job dialog (estimate), job detail (actual)
- **Effort**: Medium — requires BE/cloud to provide pricing data

#### CI/CD Integration
- **What**: Auto-run evaluations on code changes via GitHub Actions
- **Why**: Braintrust's CI integration catches regressions automatically
- **Where**: Integration guide + webhook endpoint
- **Effort**: Large — new infrastructure

#### AI-Assisted Evaluator Generation
- **What**: Describe what you want to evaluate in natural language, get a grader script generated
- **Why**: Braintrust's "Loop" does this. Lowers the barrier to creating good evaluators.
- **Where**: Evaluator editor (button: "Generate from description")
- **Effort**: Medium — LLM call to generate JS evaluate() function

---

## Sources

- [OpenAI Fine-Tuning Dashboard](https://platform.openai.com/finetune)
- [OpenAI RFT Guide](https://platform.openai.com/docs/guides/reinforcement-fine-tuning)
- [OpenAI Graders](https://platform.openai.com/docs/guides/graders)
- [Together AI Fine-Tuning](https://docs.together.ai/docs/fine-tuning-quickstart)
- [Fireworks AI Fine-Tuning](https://docs.fireworks.ai/fine-tuning/fine-tuning-models)
- [Predibase Platform](https://docs.predibase.com/fine-tuning/overview)
- [HuggingFace AutoTrain](https://huggingface.co/docs/autotrain/en/index)
- [Braintrust Evaluation](https://www.braintrust.dev/docs/evaluate)
- [Braintrust Datasets](https://www.braintrust.dev/docs/guides/datasets)
- [Humanloop Evaluation](https://humanloop.com/docs/guides/evals/run-evaluation-ui)
- [H2O LLM Studio](https://docs.h2o.ai/h2o-llmstudio/get-started/core-features)
- [LlamaFactory](https://github.com/hiyouga/LlamaFactory)
- [Best Fine-Tuning Tools 2026 (Deepchecks)](https://deepchecks.com/best-llm-fine-tuning-tools/)
