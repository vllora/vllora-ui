# Migration Strategy: Finetune → Skills + Finetune

This document outlines the incremental plan to evolve vLLora from a finetune-only platform to a Skills-first platform with optional finetune.

---

## Guiding Principles

1. **Additive, not destructive** — Don't remove finetune capabilities. Add Skills as a parallel path.
2. **Reuse over rewrite** — 70% of existing infrastructure works for Skills.
3. **Incremental delivery** — Ship value in phases. Each phase is independently useful.
4. **User choice** — Users decide which approach to use. Lucy recommends based on their situation.

---

## Phase Plan

### Phase 0: Foundation (No User-Visible Changes)

**Goal**: Refactor existing code to separate reusable logic from finetune-specific logic.

**Tasks**:

1. **Extract reusable knowledge processing**
   - Move chunk processing logic from `semantic-pdf-extractor.ts` into shared utilities
   - Current: chunks are extracted and stored, then used only as generation context
   - Target: chunks available as standalone indexed artifacts
   - Files: `steps/shared/knowledge-processing.ts` (new)

2. **Extract reusable grading logic**
   - Separate grader evaluation from dry-run-specific code
   - Current: grading tightly coupled to dry run pipeline
   - Target: grader can evaluate any response against any rubric
   - Files: `steps/shared/grader-engine.ts` (new)

3. **Extract reusable example generation**
   - Separate data generation from training-record-specific formatting
   - Current: `generate-initial-data.ts` outputs training records
   - Target: generation outputs generic Q&A that can be formatted for training OR skill examples
   - Files: `steps/shared/example-generation.ts` (new)

4. **Add skill-related IndexedDB stores**
   - `skills` store
   - `skillVersions` store
   - Files: `services/skills-db.ts` (new)

**Effort**: ~1-2 weeks
**Risk**: Low (internal refactoring, no behavior changes)

---

### Phase 1: Knowledge Indexing + System Prompt Generation

**Goal**: Generate a usable system prompt + knowledge index from uploaded docs.

**Deliverables**:
- `build_knowledge_index` tool (embeddings, keywords, cross-refs)
- `generate_skill_structure` tool (system prompt, skill areas)
- Skill preview in UI (show generated system prompt, knowledge coverage stats)

**User experience**:
```
User uploads docs → Lucy says "I've indexed 150 chunks from your 3 documents.
Here's the expert system prompt I'd generate for your objective: [preview]"
```

**What this proves**: Knowledge processing pipeline works. System prompt generation quality is acceptable.

**Files**:
| New File | Purpose |
|----------|---------|
| `steps/skill/build-knowledge-index.ts` | Embedding + keyword + cross-ref |
| `steps/skill/generate-skill-structure.ts` | System prompt + area mapping |
| `steps/skill/types.ts` | Skill TypeScript types |
| `steps/skill/index.ts` | Tool exports |
| `services/skills-db.ts` | IndexedDB operations for skills |

**Effort**: ~2-3 weeks
**Risk**: Medium (embedding generation — need to choose model, handle API costs)

---

### Phase 2: Example Generation + Curation

**Goal**: Generate and curate high-quality few-shot examples.

**Deliverables**:
- `generate_skill_examples` tool
- `curate_examples` internal function
- UI: show curated examples, per-topic coverage, quality scores

**User experience**:
```
Lucy: "I've generated 150 candidate examples across your 10 topics.
After grading and curation, I've selected the 45 best ones.
Average quality score: 0.82. Shall I show you some examples?"
```

**What this proves**: Example quality is high enough for effective few-shot prompting.

**Files**:
| New File | Purpose |
|----------|---------|
| `steps/skill/generate-skill-examples.ts` | Generation + grading pipeline |
| `steps/skill/curate-examples.ts` | Diversity selection + annotation |

**Effort**: ~2 weeks
**Risk**: Low (builds on existing generation + grading infrastructure)

---

### Phase 3: Skill Assembly + Testing

**Goal**: Assemble a complete Skill Package and test it.

**Deliverables**:
- `generate_reasoning_templates` tool
- `assemble_skill` tool (combines all artifacts)
- `test_skill` tool (generates test suite, runs tests, reports results)
- UI: Skill test results view (pass/fail, scores, failures)

**User experience**:
```
Lucy: "Your skill is assembled. Running 30 test cases...

Results:
  ✓ 26 passed, ✗ 4 failed
  Average score: 0.78

  Failed tests:
  - "Cross-reference between chapters 3 and 7" → Model didn't retrieve both chunks
  - "Edge case: contradictory guidelines" → Model followed one without noting conflict

  Recommendation: Add cross-reference hints to the system prompt. Shall I fix this?"
```

**What this proves**: End-to-end skill quality is measurable and improvable.

**Files**:
| New File | Purpose |
|----------|---------|
| `steps/skill/generate-reasoning-templates.ts` | Template extraction |
| `steps/skill/assemble-skill.ts` | Artifact collection + manifest |
| `steps/skill/test-skill.ts` | Test suite generation + execution |

**Effort**: ~3 weeks
**Risk**: Medium (testing quality depends on test generation quality)

---

### Phase 4: Publishing + Runtime

**Goal**: Users can publish skills and use them in production.

**Deliverables**:
- `publish_skill` tool (packaging in multiple formats)
- Skill runtime API endpoint (chat with a skill)
- UI: Skill deployment view, chat-with-skill testing interface
- Export formats: native JSON, OpenAI GPT config, Claude Project config

**User experience**:
```
Lucy: "Your Chess Opening Tutor skill is published!

  📦 Skill Package: 2.1 MB (150 chunks, 45 examples, 3 templates)
  🔗 API Endpoint: https://api.vllora.com/skills/sk_abc123/chat
  📥 Export: [Download for Claude] [Download for GPT] [Download JSON]

  Try it out: [Chat with your skill]"
```

**What this proves**: Full end-to-end flow works. Skills are deployable.

**Files**:
| New File | Purpose |
|----------|---------|
| `steps/skill/publish-skill.ts` | Packaging + export |
| `steps/skill/export-formats.ts` | Format-specific exporters |

**Effort**: ~3-4 weeks
**Risk**: Medium-High (requires backend API endpoint for skill runtime)

---

### Phase 5: Workflow Integration

**Goal**: Seamless user experience choosing between Skills and Finetune.

**Deliverables**:
- Updated workflow state machine with Skills path
- Lucy recommends approach based on user's situation
- Side-by-side comparison of approaches
- Skill → Finetune path (use skill to generate better training data)

**User experience**:
```
Lucy: "Based on your objective and knowledge sources, I recommend:

  🌟 Skills approach (recommended for your case)
     - Your domain is knowledge-heavy (200-page reference manual)
     - You'll benefit from direct source citation
     - Ready in ~5 minutes

  ⚡ Finetune approach
     - Better if you need very low latency
     - Better if you'll make 100K+ calls/day
     - Takes ~2-4 hours

  Or try both: Start with Skills, then use it to generate
  better training data for an optimized finetuned model."
```

**Files**:
| Modified File | Changes |
|--------------|---------|
| Agent definitions (gateway) | Add skill tools to agent, update routing logic |
| `workflow/index.ts` | Add Skills workflow steps |
| `LucySidebar.tsx` | Skills quick actions |
| `FinetuneProcessContext.tsx` | Support Skills workflow state |

**Effort**: ~2-3 weeks
**Risk**: Medium (workflow state machine complexity increases)

---

## Phase Summary

| Phase | Deliverable | Effort | Cumulative Value |
|-------|-------------|--------|------------------|
| 0 | Internal refactoring | 1-2 weeks | Foundation for all phases |
| 1 | Knowledge indexing + system prompt | 2-3 weeks | Users see skill preview |
| 2 | Example generation + curation | 2 weeks | Curated examples available |
| 3 | Skill assembly + testing | 3 weeks | Complete testable skill |
| 4 | Publishing + runtime | 3-4 weeks | **Deployable skills** |
| 5 | Workflow integration | 2-3 weeks | Seamless UX, hybrid path |
| **Total** | | **13-18 weeks** | |

**Minimum viable**: Phases 0-3 (8-10 weeks) — users can generate and test skills, even if publishing is manual.

**Full feature**: Phases 0-5 (13-18 weeks) — complete skills platform with hybrid finetune option.

---

## What Changes in the Agent Definition

### New Sub-Agent: `skill_generation`

```markdown
# File: gateway/agents/finetune/skill-generation-agent.md

name: skill_generation
model: gpt-4.1
temperature: 0.3

## Role
You are a Skill Package generation specialist. You create structured knowledge
packages that enable foundation models to become domain specialists.

## Tools
[tools]
external = [
  "build_knowledge_index",
  "generate_skill_structure",
  "generate_skill_examples",
  "generate_reasoning_templates",
  "assemble_skill",
  "test_skill",
  "publish_skill",
  "get_dataset_state",
  "get_dataset_records",
  "list_knowledge_sources",
  "search_knowledge"
]
```

### Updated Orchestrator

```markdown
# Changes to vllora-finetune-agent.md

## Sub-Agents
- finetune_topics — Topic hierarchy generation
- finetune_workflow — Training workflow execution
- data_generation — Synthetic data generation
- skill_generation — Skill package generation (NEW)

## Routing Rules
When user wants to create a specialist agent:
1. If knowledge-heavy domain OR user prefers fast iteration → transfer_to_agent("skill_generation")
2. If high-volume deployment OR latency-critical → transfer_to_agent("finetune_workflow")
3. If unsure → present options via ask_follow_up, let user decide
```

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Embedding API costs | Support local embedding models (ONNX); batch processing; cache embeddings |
| Retrieval quality | Hybrid search (semantic + keyword); test against known-answer questions |
| Context window overflow | Smart budgeting; chunk prioritization; progressive retrieval |
| Foundation model dependency | Support multiple models; cache common responses |

### Product Risks

| Risk | Mitigation |
|------|------------|
| Users expect "custom model" | Clear messaging: "AI specialist agent" vs "trained model" |
| Skill quality varies | Quality gate (testing phase); recommendations for improvement |
| Cannibalization of finetune | Position as complementary; show hybrid value |
| Support complexity (two paths) | Lucy handles routing; each path is self-contained |

### Organizational Risks

| Risk | Mitigation |
|------|------------|
| Scope creep across 5 phases | Each phase is independently valuable; can ship after any phase |
| Backend team capacity | Phase 0-3 are frontend-only; backend needed only for Phase 4+ |
| Documentation maintenance | Add skill docs alongside existing finetune docs |

---

## Success Metrics

### Phase 1-3 (Internal Quality)
- Knowledge chunk retrieval accuracy > 80% (relevant chunks in top-5)
- Curated example average quality score > 0.75
- Skill test suite pass rate > 80%

### Phase 4-5 (User-Facing)
- Skill generation time < 10 minutes (end-to-end)
- User satisfaction with skill quality (survey/feedback)
- % of users choosing Skills over Finetune
- Skill response quality vs finetuned model quality (A/B test)

### Long-Term
- User retention (do Skills users come back and iterate?)
- Skill → Finetune conversion rate (do users upgrade to finetune after starting with Skills?)
- Per-user revenue (Skills should be stickier due to faster iteration cycle)
