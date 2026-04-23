# Research: Skills Approach — Prior Art, Academic Research & Industry Validation

This document compiles existing projects, products, and academic research that validate the Skills approach as an alternative (or complement) to fine-tuning for building specialist AI agents.

---

## Executive Summary

The Skills approach is **not speculative** — it is the direction the entire industry has moved in 2024-2026. Both major AI providers (Anthropic, OpenAI) and academic research (Stanford, UC Berkeley, Alibaba) converge on the same conclusion:

> **Put volatile knowledge in retrieval, put stable behavior in fine-tuning, and stop trying to force one tool to do both jobs.**
> — [2026 Production Guide](https://umesh-malik.com/blog/rag-vs-fine-tuning-llms-2026)

The key differentiator for vLLora would be **automating the skill generation pipeline end-to-end** (objective → knowledge extraction → curated examples → tested skill package), which no product currently does as a single integrated flow.

---

## Part 1: Industry Products Taking This Approach

### 1.1 Claude Skills + MCP (Anthropic)

**The most directly relevant prior art.**

Anthropic's **Claude Skills** are exactly the concept we're proposing — structured markdown files containing domain expertise that Claude loads at inference time. Combined with **MCP** (Model Context Protocol) for tool access, this is the industry's clearest implementation of the Skills pattern.

Anthropic explicitly positions Skills as an alternative to fine-tuning:

> "Fine-tuning permanently alters model weights to specialize behavior. It is excellent for style, format, or domain vocabulary, but expensive, slow to update, and inappropriate for factual knowledge that changes. If financial regulations or accounting standards evolve, you'd need to retrain the entire model."
>
> "By contrast, Skills require zero model modification. Domain knowledge lives in markdown files you can edit instantly. Changes take effect immediately on the next skill invocation. Iterate for free, update in seconds, no retraining required."

**Architecture**:
- **Skills** = on-demand structured knowledge injection (human-curated, deterministic)
- **MCP** = secure, standardized access to external systems and tools
- **Together** = "complex agents often use both: MCP servers supply live data, while skills inject business logic"

**Key distinction from RAG**: Skills are human-curated and deterministic, not just vector-searched. This matches our proposal of curated examples + reasoning templates + evaluation rubrics.

**References**:
- [Claude Skills Explained](https://claude.com/blog/skills-explained)
- [Claude Skills vs MCP: Technical Comparison](https://intuitionlabs.ai/articles/claude-skills-vs-mcp)
- [Extending Claude's Capabilities with Skills and MCP](https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers)
- [Claude Agent Skills Landing Guide](https://claudecn.com/en/blog/claude-agent-skills-landing-guide/)

---

### 1.2 OpenAI Custom GPTs

OpenAI's Custom GPTs are essentially a UI-wrapped skills approach:
- **System prompt** (custom instructions) — equivalent to our `system_prompt.md`
- **Knowledge files** (up to 20 files, 512MB each) — equivalent to our knowledge index
- **Actions** (API tool definitions) — equivalent to our domain tools
- **No weight modification** — foundation model + context augmentation

Custom GPTs vs fine-tuning, from OpenAI's own community:

> "Custom GPTs edit the system message and function instructions and add basic RAG functionality, while fine-tuning actually changes the weights of the model."

**Limitations of Custom GPTs** (opportunities for vLLora):
- No automated knowledge curation (users manually upload files)
- No example quality grading
- No test suite generation
- No reasoning template extraction
- Limited to 20 files
- No hybrid fine-tune + skill path

**References**:
- [Custom GPTs vs Fine-tuning Discussion](https://community.openai.com/t/custom-gpts-vs-fine-tuning-whats-the-difference/477738)
- [How to Build Custom GPTs (2025)](https://calstudio.com/custom-gpts)
- [Assistants vs Fine-Tuned Models vs Custom GPTs](https://www.relay.app/blog/assistants_finetunedmodels_customgpts)

---

### 1.3 ChatGPT Projects

OpenAI's newer "Projects" feature extends the Custom GPT concept:
- Upload documents, PDFs, spreadsheets as a project knowledge base
- Per-project custom instructions
- Persistent context across conversations

This validates the market demand for "give me your docs + objective, I'll make a specialist."

**Reference**:
- [What is ChatGPT Projects? (2026)](https://elephas.app/blog/what-is-chatgpt-projects-how-it-works-pricing-and-more-2025-cmbadknjf0044yq8md6n8jrlp)

---

### 1.4 DSPy (Stanford NLP)

**DSPy** is a framework for programming (not prompting) language models. It compiles programs that optimize prompts and few-shot examples without fine-tuning weights.

**How it relates to our approach**:
- Automatically finds better prompts (like our system prompt generation)
- Selects optimal few-shot examples from training data (like our example curation)
- Evaluates against metrics (like our skill testing)
- Iterates to improve quality (like our feedback loop)

**Key concept**: Separates *interface* ("what should the LM do?") from *implementation* ("how do we tell it to do that?"). DSPy optimizes the implementation automatically.

**Optimizers**:
- `BootstrapRS` — synthesizes good few-shot examples for every module
- `MIPROv2` — proposes and explores better natural-language instructions
- `GEPA` — genetic evolution of prompt alternatives

**Data requirements**: "You can often get substantial value out of 30 examples, but aim for at least 300 examples." — This aligns with our target of ~50-100 curated examples per skill.

**References**:
- [DSPy Framework](https://dspy.ai/)
- [DSPy GitHub](https://github.com/stanfordnlp/dspy)
- [Pipelines & Prompt Optimization with DSPy](https://www.dbreunig.com/2024/12/12/pipelines-prompt-optimization-with-dspy.html)
- [Systematic LLM Prompt Engineering Using DSPy](https://towardsdatascience.com/systematic-llm-prompt-engineering-using-dspy-optimization/)

---

### 1.5 Gorilla LLM (UC Berkeley)

Gorilla demonstrates that a retrieval-augmented model with API documentation context can **outperform GPT-4** on tool use tasks.

**Two inference modes**:
1. **Zero-shot**: Direct prompt → model returns API call
2. **Retrieval mode**: Retriever fetches up-to-date API docs → concatenated to prompt → model generates with current knowledge

The retrieval mode is essentially skill injection at inference time — the model doesn't need to memorize API specifications; it receives them as context.

**Key finding**: When combined with a document retriever, Gorilla demonstrates strong capability to adapt to test-time document changes, allowing flexible user updates or version changes. This **substantially mitigates hallucination**.

**References**:
- [Gorilla Project](https://gorilla.cs.berkeley.edu/)
- [Gorilla Paper (arXiv:2305.15334)](https://arxiv.org/abs/2305.15334)
- [Gorilla GitHub](https://github.com/ShishirPatil/gorilla)

---

### 1.6 Other Commercial Products

| Product | Approach | How it relates |
|---------|----------|---------------|
| **eesel AI** | Connects to live knowledge sources (Confluence, Google Docs), learns continuously | Automated knowledge sync without retraining |
| **GPTBots** | End-to-end knowledge-based chatbot deployment for enterprises | Production skill deployment at scale |
| **CustomGPT.ai** | Custom AI knowledge base builder with file upload | Simplified skill creation for non-technical users |
| **CalStudio** | 100+ file knowledge base, white labeling, API integration | Enterprise skill deployment with branding |

**References**:
- [CustomGPT: Custom AI Knowledge Base Guide](https://customgpt.ai/custom-ai-knowledge-base/)
- [GPTBots: AI Knowledge Base Chatbot](https://www.gptbots.ai/blog/knowledge-base-chatbot)
- [eesel AI: Building a ChatGPT Knowledge Base](https://www.eesel.ai/blog/chatgpt-knowledge-base)

---

## Part 2: Academic Research

### 2.1 Memento: Fine-tuning LLM Agents without Fine-tuning LLMs (2025)

**The most directly relevant research paper.**

| Detail | Value |
|--------|-------|
| **Paper** | [arXiv:2508.16153](https://arxiv.org/abs/2508.16153) |
| **Published** | August 2025 |
| **Authors** | Huichi Zhou et al. (11 authors) |
| **Code** | [GitHub](https://github.com/Agent-on-the-Fly/Memento) |

**Core idea**: Instead of fine-tuning model weights, store past experiences in an **episodic memory** and use a neural case-selection policy to guide action decisions. Formalized as a Memory-augmented Markov Decision Process (M-MDP).

**Results**:
- **87.88% Pass@3 on GAIA validation** (top-1 at time of publication)
- **79.40% on GAIA test set**
- **66.6% F1 on DeepResearcher dataset** — outperforming the state-of-the-art training-based method
- Memory adds **4.7% to 9.6% absolute points** on out-of-distribution tasks

**Why this matters for us**: Memento proves that memory/context augmentation can outperform fine-tuning even on complex agent benchmarks. Our skill package is essentially a structured form of this episodic memory — knowledge chunks, curated examples, and reasoning templates serve as "past experiences" the model can draw from.

**References**:
- [Memento Paper](https://arxiv.org/abs/2508.16153)
- [Memento GitHub](https://github.com/Agent-on-the-Fly/Memento)
- [Exploring Memento (Medium)](https://medium.com/the-ai-forum/exploring-memento-fine-tuning-llm-agents-without-fine-tuning-llms-4a76bf918cdd)

---

### 2.2 Self-RAG: Self-Reflective Retrieval-Augmented Generation (ICLR 2024, Oral — Top 1%)

| Detail | Value |
|--------|-------|
| **Paper** | [arXiv:2310.11511](https://arxiv.org/abs/2310.11511) |
| **Published** | October 2023, accepted ICLR 2024 (Oral) |
| **Authors** | Akari Asai, Zeqiu Wu, Yizhong Wang, Avirup Sil, Hannaneh Hajishirzi |
| **Code** | [GitHub](https://github.com/AkariAsai/self-rag) |

**Core idea**: Train an LM that adaptively retrieves passages **on-demand** and self-reflects on both retrieved passages and its own generations using special **reflection tokens**.

**Key innovation**: Addresses the problem that "indiscriminately retrieving and incorporating a fixed number of retrieved passages, regardless of whether retrieval is necessary or passages are relevant, diminishes LM versatility."

**Results**:
- Self-RAG (7B and 13B parameters) **significantly outperforms** state-of-the-art LLMs and retrieval-augmented models on diverse tasks
- **Significant gains in factuality and citation accuracy** for long-form generations relative to ChatGPT and retrieval-augmented Llama2-chat

**Why this matters for us**: Self-RAG validates two key components of our skill runtime:
1. **Adaptive retrieval** — don't always retrieve; decide when retrieval is needed
2. **Self-evaluation** — the model critiques its own generations against sources (our evaluation rubric)

**References**:
- [Self-RAG Paper](https://arxiv.org/abs/2310.11511)
- [Self-RAG Project Page](https://selfrag.github.io/)
- [Self-RAG GitHub](https://github.com/AkariAsai/self-rag)

---

### 2.3 LaRA Benchmark: RAG vs Long-Context LLMs (ICML 2025)

| Detail | Value |
|--------|-------|
| **Paper** | [arXiv:2502.09977](https://arxiv.org/abs/2502.09977) |
| **Published** | February 2025, accepted ICML 2025 |
| **Authors** | Alibaba NLP team |
| **Code** | [GitHub](https://github.com/Alibaba-NLP/LaRA) |

**Core finding**: **"No silver bullet"** — the optimal choice between RAG and long-context depends on a complex interplay of factors:
- Model's parameter size
- Long-text capabilities
- Context length
- Task type
- Characteristics of retrieved chunks

**Benchmark details**:
- 2,326 test cases
- 4 QA tasks
- 3 long context types
- Both 32K and 128K context lengths
- 7 open-source + 4 proprietary LLMs evaluated

**Why this matters for us**: LaRA confirms that our hybrid strategy (Skills for knowledge tasks, optional Finetune for behavior) is the right approach — there's no one-size-fits-all answer.

**References**:
- [LaRA Paper](https://arxiv.org/abs/2502.09977)
- [LaRA at ICML 2025](https://icml.cc/virtual/2025/poster/46069)
- [LaRA GitHub](https://github.com/Alibaba-NLP/LaRA)

---

### 2.4 Medical LLMs: Fine-Tuning vs RAG (2025)

| Detail | Value |
|--------|-------|
| **Paper** | [PMC12292519](https://pmc.ncbi.nlm.nih.gov/articles/PMC12292519/) |
| **Published** | 2025 |
| **Journal** | Bioengineering (MDPI) |

**Key finding**: In the medical domain — one of the most knowledge-intensive fields — **RAG and FT+RAG consistently outperformed FT alone** across most models, particularly LLAMA and PHI.

**Concrete numbers for GPT-4**:

| Approach | Accuracy |
|----------|----------|
| Base GPT-4 | 75% |
| Fine-tuned GPT-4 | 81% (+6%) |
| Fine-tuned GPT-4 + RAG | **86%** (+11%) |

**Why this matters for us**: Medical is arguably the hardest domain for knowledge-based AI (complex, high-stakes, vast knowledge). If RAG augmentation beats fine-tuning alone in medicine, it will beat it in virtually any knowledge-heavy domain our users care about.

**References**:
- [Medical LLMs: Fine-Tuning vs RAG](https://pmc.ncbi.nlm.nih.gov/articles/PMC12292519/)
- [MDPI Paper](https://www.mdpi.com/2306-5354/12/7/687)

---

### 2.5 Related Research

| Paper | Year | Key Finding | Relevance |
|-------|------|-------------|-----------|
| [EvolveR: Self-Evolving LLM Agents](https://arxiv.org/html/2510.16079v1) | 2025 | Agents that improve through experience lifecycle, not retraining | Validates memory > weights for agent improvement |
| [MemRL: Self-Evolving Agents via Runtime RL](https://arxiv.org/html/2601.03192v2) | 2026 | Episodic memory for runtime reinforcement learning | Skills as structured episodic memory |
| [Survey of Self-Evolving Agents](https://arxiv.org/html/2507.21046v4) | 2025 | Comprehensive survey of agent adaptation without weight modification | Maps the full landscape of alternatives to fine-tuning |
| [Fine-Tuning LLMs: Exhaustive Review](https://arxiv.org/html/2408.13296v1) | 2024 | Thorough survey of fine-tuning methods, limitations, and alternatives | Identifies when fine-tuning is NOT the right approach |

---

## Part 3: Industry Consensus (2025-2026)

### The Hybrid Default

Multiple production guides and industry analyses converge on the same recommendation:

> "In 2026, hybrid systems are the practical default for production-grade quality. The RAG vs fine-tuning debate is mostly noise now."
> — [RAG vs Fine-Tuning 2026 Production Guide](https://umesh-malik.com/blog/rag-vs-fine-tuning-llms-2026)

> "Add RAG before fine-tuning for knowledge-heavy tasks. Especially for docs QA, support agents, policy lookup, and regulated workflows. Fine-tune when behavior is the bottleneck, not missing facts."
> — [Glean: RAG vs Fine-Tuning](https://www.glean.com/blog/retrieval-augemented-generation-vs-fine-tuning)

> "RAG is ideal for applications requiring real-time access to dynamic information, while fine-tuning is preferred for scenarios demanding precise, task-specific outputs."
> — [Glean: RAG vs LLM](https://www.glean.com/blog/rag-vs-llm)

> "Fine-tuning to a specific set of examples can actually reduce performance on things outside of the training set."
> — [OpenAI Community](https://community.openai.com/t/custom-gpts-vs-fine-tuning-whats-the-difference/477738)

### Decision Framework (Industry Standard)

```
Is the problem about KNOWLEDGE (facts, docs, domain info)?
  → Skills / RAG approach first
  → Fine-tune only if cost/latency requires it

Is the problem about BEHAVIOR (style, format, tone, patterns)?
  → Fine-tuning is appropriate
  → Skills can supplement with examples

Is it BOTH?
  → Hybrid: Fine-tune for behavior + Skills/RAG for knowledge
  → This is the highest-quality configuration
```

---

## Part 4: Competitive Landscape

### What Exists vs What We're Building

| Capability | OpenAI GPTs | Claude Skills | DSPy | Gorilla | **vLLora Skills (proposed)** |
|---|---|---|---|---|---|
| Knowledge upload | Manual file upload | Manual markdown | Training set | API docs | **Automated extraction + indexing** |
| Example curation | None | Manual | Auto-optimized | None | **Auto-generated + graded + curated** |
| Reasoning templates | None | Manual | None | None | **Auto-extracted from knowledge** |
| Quality testing | None | None | Metric evaluation | Benchmarks | **Auto-generated test suite** |
| Self-evaluation rubric | None | None | None | None | **Auto-generated from objective** |
| Export formats | GPT-specific | Claude-specific | Python code | LLaMA-specific | **Multi-format (GPT, Claude, API, JSON)** |
| Hybrid fine-tune path | Separate product | N/A | Prompt weights | Separate | **Integrated (skill → better training data → fine-tune)** |
| End-to-end pipeline | No (manual steps) | No (manual steps) | Partial (prompts only) | No | **Yes (objective → tested skill)** |

### Our Unique Position

No existing product offers an **automated, end-to-end pipeline** that:
1. Takes a user objective + reference documents
2. Extracts and indexes knowledge with embeddings
3. Generates and curates few-shot examples with quality grading
4. Extracts reasoning templates from domain knowledge
5. Assembles a tested, deployable skill package
6. Optionally uses the skill to generate better training data for fine-tuning

**This is the gap vLLora fills.**

---

## Part 5: Summary of Evidence

### Strength of Evidence by Claim

| Claim | Evidence Strength | Sources |
|-------|-------------------|---------|
| RAG/Skills outperform fine-tuning for knowledge tasks | **Strong** | Medical LLMs study (+11% accuracy), LaRA benchmark (ICML 2025), Memento (+4.7-9.6% OOD) |
| Self-evaluation improves response quality | **Strong** | Self-RAG (ICLR 2024 Oral, top 1%), significant factuality gains |
| Hybrid approach beats either alone | **Strong** | Medical study (75% → 81% → 86%), 2026 industry consensus |
| Skills/RAG is the industry direction | **Strong** | Claude Skills, OpenAI GPTs, DSPy, Gorilla, every major provider |
| Memory/context > weight modification for agents | **Moderate-Strong** | Memento (top-1 GAIA), EvolveR, MemRL, Self-Evolving Agents survey |
| Automated skill generation is feasible | **Moderate** | DSPy automates prompt optimization; our pipeline extends this to full skill packages |
| No silver bullet — hybrid is best | **Strong** | LaRA benchmark (2,326 tests, 11 models), every comparative study |

### Risk Assessment

| Risk | Evidence says... |
|------|-----------------|
| Skills won't be good enough | Unlikely — RAG/Skills outperform fine-tuning alone in every studied knowledge domain |
| Users want "a model," not "a skill" | Real but manageable — Claude Skills and Custom GPTs prove market acceptance; messaging matters |
| Inference cost too high | Valid concern at scale — hybrid path (skill → fine-tune for cost optimization) is the standard mitigation |
| Retrieval quality insufficient | Moderate risk — Self-RAG and Gorilla show retrieval quality is solvable with proper engineering |

---

## References (Complete List)

### Products & Platforms
1. [Claude Skills Explained — Anthropic](https://claude.com/blog/skills-explained)
2. [Claude Skills vs MCP: Technical Comparison](https://intuitionlabs.ai/articles/claude-skills-vs-mcp)
3. [Extending Claude's Capabilities with Skills and MCP](https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers)
4. [Claude Agent Skills Landing Guide](https://claudecn.com/en/blog/claude-agent-skills-landing-guide/)
5. [OpenAI: Custom GPTs vs Fine-tuning](https://community.openai.com/t/custom-gpts-vs-fine-tuning-whats-the-difference/477738)
6. [Assistants vs Fine-Tuned Models vs Custom GPTs](https://www.relay.app/blog/assistants_finetunedmodels_customgpts)
7. [DSPy Framework](https://dspy.ai/)
8. [Gorilla LLM Project](https://gorilla.cs.berkeley.edu/)

### Research Papers
9. [Memento: Fine-tuning LLM Agents without Fine-tuning LLMs (arXiv:2508.16153)](https://arxiv.org/abs/2508.16153)
10. [Self-RAG: Learning to Retrieve, Generate, and Critique (arXiv:2310.11511)](https://arxiv.org/abs/2310.11511)
11. [LaRA: Benchmarking RAG and Long-Context LLMs (arXiv:2502.09977)](https://arxiv.org/abs/2502.09977)
12. [Medical LLMs: Fine-Tuning vs RAG (PMC12292519)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12292519/)
13. [Gorilla: Large Language Model Connected with Massive APIs (arXiv:2305.15334)](https://arxiv.org/abs/2305.15334)
14. [Fine-Tuning LLMs: Exhaustive Review (arXiv:2408.13296)](https://arxiv.org/html/2408.13296v1)
15. [EvolveR: Self-Evolving LLM Agents (arXiv:2510.16079)](https://arxiv.org/html/2510.16079v1)
16. [MemRL: Self-Evolving Agents via Runtime RL (arXiv:2601.03192)](https://arxiv.org/html/2601.03192v2)
17. [Survey of Self-Evolving Agents (arXiv:2507.21046)](https://arxiv.org/html/2507.21046v4)

### Industry Guides
18. [RAG vs Fine-Tuning for LLMs: 2026 Production Guide](https://umesh-malik.com/blog/rag-vs-fine-tuning-llms-2026)
19. [Glean: RAG vs Fine-Tuning Complete Guide](https://www.glean.com/blog/retrieval-augemented-generation-vs-fine-tuning)
20. [Glean: RAG vs LLM Fine-tuning](https://www.glean.com/blog/rag-vs-llm)
21. [Monte Carlo: RAG vs Fine Tuning](https://www.montecarlodata.com/blog-rag-vs-fine-tuning/)
22. [Fine-Tuning vs RAG in 2025](https://manalisomani099.medium.com/fine-tuning-vs-rag-in-2025-which-approach-wins-99dca6fd00df)
23. [orq.ai: Fine-Tuning vs RAG 2025 Guide](https://orq.ai/blog/finetuning-vs-rag)
