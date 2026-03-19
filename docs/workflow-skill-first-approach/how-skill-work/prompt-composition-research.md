# Hierarchical System Prompt Composition for Fine-Tuning

Research into whether composing system prompts from a topic hierarchy (root -> parent -> leaf) is a valid approach for fine-tuning datasets, and how platforms handle system prompt variation.

---

## 1. Platform-by-Platform Findings

### OpenAI (SFT + RFT)

**SFT**: OpenAI treats the system message as "a consistent instruction that sets the context for all examples." Their best practices page explicitly warns against shortening or removing instructions repeated in every example, because the model needs them to learn the task efficiently. The implied guidance is: **keep your system prompt consistent across training examples**.

However, the format supports per-example system messages. Each JSONL line has its own `messages` array with an optional system role. Nothing prevents varying them — the question is whether you *should*.

**RFT**: Each prompt in the dataset gets multiple candidate answers sampled and graded. The system prompt is part of the prompt context. OpenAI's RFT documentation does not explicitly address varying system prompts across examples, but the architecture supports it since each example is independently sampled and graded.

**Key OpenAI recommendation**: "Make sure all of your training examples are in the same format, as expected for inference." This means your training system prompts should match what you will use at inference time.

### Anthropic (Claude on Bedrock)

Fine-tuning Claude 3 Haiku on Amazon Bedrock uses JSONL with per-example system messages. Anthropic recommends including a system prompt that clearly defines the model's role and tasks, and using XML tags or structured sections for organization.

Anthropic's prompt engineering guidance emphasizes **structured sections** (using XML tags like `<background_information>`, `<instructions>`, etc.) which aligns well with compositional prompt assembly. Their approach to multi-section prompts is essentially hierarchical by design.

**Notable**: Anthropic suggests curating "diverse, canonical examples" rather than exhaustive edge cases — quality over quantity.

### Google Vertex AI (Gemini)

Gemini fine-tuning supports a `systemInstruction` field per training example. Their documentation is explicit: "The data you use for fine-tuning should reflect the prompt distribution, format and context the model will encounter in production."

This is the strongest signal that **if you plan to use composed prompts at inference, your training data should use the same composed prompts**. Gemini's format naturally supports per-example system instructions.

### Fireworks AI / Together AI

Both support JSONL with per-example system messages. Fireworks notes the system role "is optional, but if specified, must be the first message." Neither platform provides specific guidance on varying vs. consistent system prompts.

### Open-Source (Axolotl, LLaMA-Factory, Unsloth)

All three use JSONL with `system`, `user`, `assistant` fields per example. The system field can vary per example. These frameworks are format-agnostic — they pass through whatever system prompt you provide. No specific guidance on hierarchical composition exists in their documentation.

---

## 2. The Consensus on System Prompt Variation

### The Warning

Microsoft Q&A and multiple practitioners warn that **varying system prompts significantly during fine-tuning can cause problems**:

- The model may become overly sensitive to minor prompt changes
- It may not develop a strong anchoring effect for any single prompt style
- If patterns appear unevenly, the model may bias toward frequent patterns
- Performance may degrade compared to a fixed, well-crafted system prompt

### The Nuance

The warning applies primarily to **random or inconsistent** variation. It does NOT apply to **structured, systematic** variation where:

- Each variant is intentional and maps to a real inference scenario
- The distribution of variants in training matches expected inference distribution
- The prompts share a consistent structure (same skeleton, different content)

**This is the key insight for hierarchical composition**: If every system prompt follows the same compositional structure (`[objective] + [root behavior] + [parent specialization] + [leaf focus]`), you have **structural consistency with content variation** — which is exactly what multi-task fine-tuning recommends.

---

## 3. Established Patterns for Multi-Part System Prompts

### Pattern A: Role-Based Composition (most common)

```
[ROLE] You are an expert chess tutor...
[TASK] Teach the student about tactical patterns...
[CONSTRAINTS] Use algebraic notation, explain step by step...
[FORMAT] Start with the concept, then provide examples...
```

Well-established in prompt engineering. Each section has a clear purpose. Works well for fine-tuning because the model learns to attend to each section independently.

### Pattern B: Hierarchical / General-to-Specific (our approach)

```
[OBJECTIVE] Train a chess tutor...
[ROOT BEHAVIOR] You are an expert chess tutor who teaches through explanation...
[PARENT SPECIALIZATION] Specialize in: Tactical Patterns...
[LEAF FOCUS] Focus on: Forks & Double Attacks...
```

Less common in fine-tuning literature, but well-supported by curriculum learning research. The key advantage: the model sees the same root/parent context across related topics, reinforcing shared behaviors while learning topic-specific nuances.

### Pattern C: Template with Slot Filling

```
You are a {role} who specializes in {domain}.
Your current focus is {topic}.
When teaching, emphasize {key_concepts} and use {teaching_style}.
```

Common in production systems. Variables are filled at inference time. For fine-tuning, you would fill the slots before writing to the dataset. This is essentially what hierarchical composition does, but with more rigid structure.

### Pattern D: Curriculum Learning / Progressive Complexity

Research shows fine-tuning benefits from organizing data from easy to hard:

- **Difficulty-aware bucketed fine-tuning**: Train on simple examples first, then harder ones
- **Competence-aware scheduling**: Assess difficulty relative to the model's current ability
- **Progressive prompt complexity**: Short prompts first, then longer/more complex ones

This is complementary to hierarchical composition — you could order topics by depth/complexity.

---

## 4. Is Varying System Prompts Per Topic Good for RFT?

### Arguments For

1. **Matches inference reality**: If you will use topic-specific prompts at inference, training should match
2. **Grader alignment**: The grader can evaluate topic-specific quality (e.g., "Did the response correctly explain forks?") — the system prompt provides context for what "correct" means
3. **Shared structure**: If all prompts share the same compositional skeleton, the model learns the structure itself as a signal
4. **Topic-aware behavior**: The model learns that different topic contexts require different emphasis, examples, and depth

### Arguments Against

1. **Signal dilution**: Too many unique system prompts may prevent the model from learning any single prompt well
2. **Small dataset risk**: With few examples per topic, the model may not see enough of each prompt variant to learn from it
3. **Prompt sensitivity**: The model may become fragile — small changes to the system prompt at inference could cause unexpected behavior

### Recommendation for RFT

**Hierarchical composition is a good fit for RFT**, with caveats:

- Keep the **structure consistent** across all examples (same sections, same ordering)
- Ensure **sufficient examples per leaf topic** (aim for 10-20+ per leaf for SFT, 5-10+ for RFT)
- Make the **grader topic-aware** — it should know what topic the response should address
- The composed prompt should match exactly what you would use at inference time
- Limit the **total number of unique leaf-level prompts** to what your dataset size can support

---

## 5. Recommended Prompt Components

Based on research, a composed system prompt should include these components, ordered from general to specific:

| # | Component | Source | Purpose | Example |
|---|-----------|--------|---------|---------|
| 1 | **Objective** | Dataset config | What the model should achieve overall | "Train a chess tutor that teaches tactical patterns and strategic concepts." |
| 2 | **Persona / Role** | Root topic | Who the model is and how it behaves | "You are an expert chess tutor who teaches through explanation and guided discovery." |
| 3 | **Behavioral constraints** | Root topic | Global rules for all responses | "Always use standard algebraic notation. Explain your reasoning step by step." |
| 4 | **Domain specialization** | Parent topic | What area this covers | "Specialize in: Tactical Patterns — focus on pattern recognition, calculation, and concrete examples." |
| 5 | **Topic focus** | Leaf topic | What to emphasize in this specific area | "Focus on: Forks & Double Attacks — teach how a single piece attacks two targets simultaneously." |
| 6 | **Related context** | Topic hierarchy | Cross-references to sibling/adjacent topics | "Related topics: Pins & Skewers, Discovered Attacks." |

### What to Exclude from Composition

- **Grading criteria** — these belong in the grader, not the system prompt
- **Dataset metadata** — internal IDs, topic codes, etc.
- **Verbose descriptions** — each component should add 1-2 sentences, not paragraphs
- **Contradictory instructions** — child components should augment, never override parent

---

## 6. Technical Implementation Recommendations

### Composition Strategy

Use **augmentation, not override**. Each level adds specificity without contradicting the parent:

```
Root:   "You are an expert chess tutor."
Parent: Root + "Specialize in tactical patterns."
Leaf:   Root + Parent + "Focus on forks and double attacks."
```

NOT:

```
Root:   "You are an expert chess tutor."
Parent: "You are a tactics specialist."        // loses "chess tutor" identity
Leaf:   "You teach forks."                     // loses all context
```

### Length Management

- **Target**: 50-150 words total for the composed prompt
- **Root**: 1-2 sentences (persona + core behavior)
- **Parent**: 1 sentence (domain specialization)
- **Leaf**: 1 sentence (topic focus)
- **Objective**: 1 sentence (prepended from dataset config)
- **Related context**: Optional, 1 short line

### Structural Consistency

Every composed prompt should follow the same template:

```
{objective}

{root_persona_and_behavior}

{parent_specialization}

{leaf_focus}
```

Use consistent delimiters (line breaks, or labeled sections). The model will learn this structure as a signal.

### Distribution Considerations

- Ensure roughly even distribution across leaf topics (avoid 80% of examples being one topic)
- If a topic has fewer source documents, generate proportionally fewer but higher-quality examples
- The training distribution should approximate the expected inference distribution

---

## 7. Summary: What We Should Adopt

### Adopt

1. **Hierarchical composition with consistent structure** — compose from ancestors, same template every time
2. **Match training prompts to inference prompts** — the composed prompt in training should be identical to what we use when querying the fine-tuned model
3. **Augmentation model** — each level adds, never overrides
4. **Keep it concise** — 50-150 words total, not multi-paragraph essays
5. **Topic-aware graders for RFT** — the grader should know the expected topic context
6. **Sufficient per-topic coverage** — minimum 5-10 examples per leaf topic

### Avoid

1. **Random or unstructured variation** — every prompt must follow the same skeleton
2. **Overly long prompts** — diminishing returns past ~150 words for system prompt
3. **Too many unique leaf topics with too few examples** — better to have 10 topics with 20 examples each than 50 topics with 4 examples each
4. **Child overriding parent** — composition should be additive
5. **Including grading criteria in the system prompt** — keep grader logic separate

### Open Questions

- What is the optimal depth? 3 levels (root/parent/leaf) seems natural, but deeper hierarchies may cause prompt bloat
- Should the objective come from the dataset config or the root topic? Currently proposed as dataset-level, which seems right
- How to handle topics that span multiple parents (cross-cutting concerns)?

---

## Sources

- [OpenAI Fine-Tuning Best Practices](https://platform.openai.com/docs/guides/fine-tuning-best-practices)
- [OpenAI Fine-Tuning API](https://platform.openai.com/docs/guides/fine-tuning/)
- [OpenAI Reinforcement Fine-Tuning](https://platform.openai.com/docs/guides/reinforcement-fine-tuning)
- [OpenAI RFT Use Cases](https://platform.openai.com/docs/guides/rft-use-cases)
- [OpenAI RFT Grader Cookbook](https://cookbook.openai.com/examples/reinforcement_fine_tuning)
- [OpenAI Fine-Tuning Techniques (SFT, DPO, RFT)](https://cookbook.openai.com/examples/fine_tuning_direct_preference_optimization_guide)
- [OpenAI Model Optimization](https://platform.openai.com/docs/guides/model-optimization)
- [Anthropic Fine-Tuning on Bedrock](https://aws.amazon.com/blogs/machine-learning/best-practices-and-lessons-for-fine-tuning-anthropics-claude-3-haiku-on-amazon-bedrock/)
- [Anthropic Prompt Engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Anthropic Claude 4 Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Google Vertex AI Gemini Fine-Tuning](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-use-supervised-tuning)
- [Google Vertex AI Data Preparation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning-prepare)
- [Fireworks AI Fine-Tuning](https://docs.fireworks.ai/fine-tuning/fine-tuning-models)
- [Fireworks AI LLM Fine-Tuning Best Practices](https://fireworks.ai/blog/llm-fine-tuning)
- [Microsoft Q&A: Changing System Prompts in Fine-Tuning](https://learn.microsoft.com/en-gb/answers/questions/2201586/will-changing-system-prompts-in-fine-tuning-mess-t)
- [HPT: Hierarchy-aware Prompt Tuning (EMNLP 2022)](https://aclanthology.org/2022.emnlp-main.246.pdf)
- [Learning Hierarchical Prompt with Structured Linguistic Knowledge](https://arxiv.org/html/2312.06323v1)
- [Curriculum Instruction Tuning in LLMs](https://www.emergentmind.com/topics/curriculum-instruction-tuning)
- [Fine-Tuning LLMs with Human-inspired Learning Strategies](https://arxiv.org/html/2408.07888v1)
- [Role-Based Prompt Structuring](https://www.emergentmind.com/topics/role-based-prompt-structuring)
- [Fine-Tuning in 2026: Axolotl vs Unsloth vs TRL vs LLaMA-Factory](https://dev.to/ultraduneai/eval-003-fine-tuning-in-2026-axolotl-vs-unsloth-vs-trl-vs-llama-factory-2ohg)
- [Parlance: Fine Tuning OpenAI Models Best Practices](https://parlance-labs.com/education/fine_tuning/steven.html)
- [Anthropic Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
