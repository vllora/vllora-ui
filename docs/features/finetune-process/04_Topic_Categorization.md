# 04 - Topic & Categorization

[← Back to Index](./00_INDEX.md) | [← Previous](./03_Data_Sanitization.md)

---

## Overview

This module covers three steps:
- **Step B:** Define Topic Hierarchy
- **Step C:** Categorize Records
- **Step D:** Review Coverage Distribution

---

## Step B — Define Topic Hierarchy

**Purpose:** Create the taxonomy for categorizing prompts.

**Input:** `sanitized_prompts.jsonl`  
**Output:** `topic_hierarchy.json`

### Options

| Method | Best For | Effort |
|--------|----------|--------|
| Auto-generate | Quick start, discovery | Low |
| Use template | Industry-standard categories | Low |
| Manual define | Domain expertise, specific needs | High |

### Auto-Generate Process

1. **Embed prompts** using text-embedding model
2. **Cluster** using HDBSCAN or k-means
3. **Label clusters** using LLM summarization
4. **Organize** into 2-level hierarchy

```python
def auto_generate_topics(prompts: list, n_clusters: int = 10) -> dict:
    # 1. Embed
    embeddings = embed_prompts(prompts)
    
    # 2. Cluster
    clusters = cluster_embeddings(embeddings, n_clusters)
    
    # 3. Label each cluster
    topics = {}
    for cluster_id, members in clusters.items():
        sample_prompts = random.sample(members, min(5, len(members)))
        label = llm_generate_label(sample_prompts)
        topics[label] = {
            "description": llm_generate_description(sample_prompts),
            "example_prompts": sample_prompts[:3]
        }
    
    return topics
```

### Topic Hierarchy Format

```json
{
  "version": "1.0",
  "topics": {
    "data_queries": {
      "description": "Fetching and querying data from various sources",
      "subtopics": ["database_lookups", "api_requests", "search_operations"],
      "keywords": ["find", "get", "query", "search", "lookup"]
    },
    "calculations": {
      "description": "Mathematical and analytical operations",
      "subtopics": ["aggregations", "conversions", "financial_math"],
      "keywords": ["calculate", "sum", "average", "convert"]
    },
    "content_generation": {
      "description": "Creating text, summaries, and formatted output",
      "subtopics": ["summaries", "formatting", "translation"],
      "keywords": ["write", "summarize", "format", "create"]
    }
  }
}
```

---

## Step C — Categorize Records

**Purpose:** Assign each sanitized prompt to a topic in the hierarchy.

**Input:** `sanitized_prompts.jsonl`, `topic_hierarchy.json`  
**Output:** `categorized_prompts.jsonl`

### Classification Methods

| Method | Speed | Accuracy | Cost |
|--------|-------|----------|------|
| Keyword matching | Fast | Low | Free |
| Embedding similarity | Medium | Medium | Low |
| LLM classification | Slow | High | Medium |
| Hybrid (embed + LLM fallback) | Medium | High | Low-Medium |

### Recommended: Hybrid Approach

```python
def categorize_prompt(prompt: dict, topics: dict, threshold: float = 0.7) -> dict:
    """Categorize using embeddings with LLM fallback"""
    
    # 1. Try embedding similarity
    prompt_embedding = embed(get_user_content(prompt))
    
    best_topic = None
    best_score = 0
    
    for topic, topic_embedding in topic_embeddings.items():
        score = cosine_similarity(prompt_embedding, topic_embedding)
        if score > best_score:
            best_score = score
            best_topic = topic
    
    # 2. High confidence: use embedding result
    if best_score >= threshold:
        return {
            "topic": best_topic,
            "confidence": best_score,
            "method": "embedding"
        }
    
    # 3. Low confidence: use LLM
    llm_result = llm_classify(prompt, list(topics.keys()))
    return {
        "topic": llm_result["topic"],
        "confidence": llm_result["confidence"],
        "method": "llm"
    }
```

### Handling Edge Cases

| Case | Action |
|------|--------|
| Multi-topic prompt | Assign to primary topic, tag secondary |
| Uncategorizable | Assign to "other" or flag for review |
| Low confidence (<0.5) | Queue for manual review |

### Output Format

```jsonl
{"messages": [...], "metadata": {"topic": "data_queries", "confidence": 0.92, "method": "embedding"}}
{"messages": [...], "metadata": {"topic": "calculations", "confidence": 0.67, "method": "llm"}}
{"messages": [...], "metadata": {"topic": "other", "confidence": 0.41, "needs_review": true}}
```

---

## Step D — Review Coverage Distribution

**Purpose:** Understand current dataset composition before deciding what to generate.

**Input:** `categorized_prompts.jsonl`  
**Output:** `coverage_report.json`

### Metrics to Calculate

| Metric | Formula | Purpose |
|--------|---------|---------|
| Count per topic | `count(topic)` | Raw distribution |
| Percentage | `count(topic) / total * 100` | Relative distribution |
| Gap score | `target - actual` | What's missing |
| Balance score | `min(counts) / max(counts)` | Overall balance |

### Coverage Report

```json
{
  "timestamp": "2025-01-22T11:00:00Z",
  "total_prompts": 11892,
  "distribution": {
    "data_queries": {
      "count": 4521,
      "percentage": 38.0,
      "target_percentage": 30.0,
      "gap": -8.0,
      "status": "over"
    },
    "calculations": {
      "count": 892,
      "percentage": 7.5,
      "target_percentage": 20.0,
      "gap": 12.5,
      "status": "under"
    },
    "content_generation": {
      "count": 3245,
      "percentage": 27.3,
      "target_percentage": 25.0,
      "gap": -2.3,
      "status": "ok"
    },
    "tool_usage": {
      "count": 2134,
      "percentage": 17.9,
      "target_percentage": 20.0,
      "gap": 2.1,
      "status": "ok"
    },
    "other": {
      "count": 1100,
      "percentage": 9.3,
      "target_percentage": 5.0,
      "gap": -4.3,
      "status": "over"
    }
  },
  "balance_score": 0.20,
  "recommendations": {
    "calculations": "Generate ~1,500 more prompts",
    "tool_usage": "Generate ~250 more prompts (optional)"
  }
}
```

### Target Distribution Options

| Approach | Description |
|----------|-------------|
| Uniform | Equal % for all topics |
| Weighted | User-defined weights |
| Production-aligned | Match production traffic |
| Gap-focused | Prioritize weakest areas |

---

## UI Mockups

### Step B: Topic Definition

```
┌─────────────────────────────────────────────┐
│ Define Topic Hierarchy                      │
├─────────────────────────────────────────────┤
│ How would you like to define topics?        │
│                                             │
│ ● Auto-generate from data                   │
│ ○ Use template: [Customer Support ▼]        │
│ ○ Define manually                           │
│                                             │
│                     [Generate Topics →]     │
└─────────────────────────────────────────────┘
```

### Step C: Categorization Progress

```
┌─────────────────────────────────────────────┐
│ Categorizing Records                        │
├─────────────────────────────────────────────┤
│ ████████████████░░░░ 80%                    │
│                                             │
│ Processed: 9,514 / 11,892                   │
│                                             │
│ High confidence (>0.8):    8,234 (86.5%)    │
│ Medium confidence:         1,012 (10.6%)    │
│ Needs review (<0.5):         268 (2.8%)     │
└─────────────────────────────────────────────┘
```

### Step D: Coverage Review

```
┌─────────────────────────────────────────────┐
│ Coverage Distribution                       │
├─────────────────────────────────────────────┤
│                  Current    Target          │
│ data_queries     ████████░░ 38%   (30%)    │
│ calculations     ██░░░░░░░░  8%   (20%) ⚠️  │
│ content_gen      ██████░░░░ 27%   (25%)    │
│ tool_usage       ████░░░░░░ 18%   (20%)    │
│ other            ██░░░░░░░░  9%   (5%)     │
│                                             │
│ Balance Score: 0.20 (Poor)                  │
│ ⚠️ "calculations" significantly under       │
│                                             │
│ [Set Custom Targets]         [Continue →]   │
└─────────────────────────────────────────────┘
```

---

[Next: Coverage & Generation →](./05_Coverage_Generation.md)
