# 04 - Topic & Categorization

[← Back to Index](./00_INDEX.md) | [← Previous](./03_Data_Sanitization.md)

---

## Overview

This module covers three steps:
- **Step B:** Define Topic Hierarchy
- **Step C:** Categorize Records
- **Step D:** Review Coverage Distribution

---

## Data Structures

```typescript
// Topic hierarchy stored in Dataset
interface TopicHierarchy {
  version: string;
  topics: Record<string, TopicNode>;
}

interface TopicNode {
  description: string;
  subtopics?: string[];
  keywords?: string[];
  parentTopic?: string;
}

// Categorization result stored in DatasetRecord
interface CategorizationMetadata {
  topic: string;           // Leaf topic name
  confidence: number;      // 0-1 score
  method: 'embedding' | 'llm' | 'keyword' | 'manual';
  needsReview?: boolean;   // Flag for low confidence
  secondaryTopics?: string[];
}

// Coverage analysis
interface CoverageReport {
  timestamp: string;
  totalRecords: number;
  distribution: Record<string, TopicDistribution>;
  balanceScore: number;
  recommendations: string[];
}

interface TopicDistribution {
  count: number;
  percentage: number;
  targetPercentage: number;
  gap: number;
  status: 'under' | 'ok' | 'over';
}
```

---

## Step B — Define Topic Hierarchy

**Purpose:** Create the taxonomy for categorizing records.

**Input:** Validated `DatasetRecord[]`  
**Output:** `TopicHierarchy`

### Options

| Method | Best For | Effort |
|--------|----------|--------|
| Auto-generate | Quick start, discovery | Low |
| Use template | Industry-standard categories | Low |
| Manual define | Domain expertise, specific needs | High |

### Auto-Generate Process

```typescript
interface ClusterResult {
  clusterId: number;
  members: DatasetRecord[];
  centroid: number[];
}

async function autoGenerateTopics(
  records: DatasetRecord[],
  options: {
    numClusters?: number;
    embeddingModel?: string;
  } = {}
): Promise<TopicHierarchy> {
  const { numClusters = 10, embeddingModel = 'text-embedding-3-small' } = options;
  
  // 1. Extract user content from each record
  const contents = records.map(r => extractUserContent(r));
  
  // 2. Embed all content
  const embeddings = await embedBatch(contents, embeddingModel);
  
  // 3. Cluster embeddings
  const clusters = kMeansClustering(embeddings, numClusters);
  
  // 4. Generate labels for each cluster using LLM
  const topics: Record<string, TopicNode> = {};
  
  for (const cluster of clusters) {
    const sampleRecords = cluster.members.slice(0, 5);
    const sampleContents = sampleRecords.map(r => extractUserContent(r));
    
    const { label, description, keywords } = await generateTopicLabel(sampleContents);
    
    topics[label] = {
      description,
      keywords,
    };
  }
  
  return {
    version: '1.0',
    topics,
  };
}

function extractUserContent(record: DatasetRecord): string {
  const dataInfo = record.data as DataInfo;
  const messages = dataInfo.input?.messages || [];
  
  // Get last user message content
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1];
  
  return typeof lastUserMsg?.content === 'string' 
    ? lastUserMsg.content 
    : '';
}

async function generateTopicLabel(samples: string[]): Promise<{
  label: string;
  description: string;
  keywords: string[];
}> {
  const prompt = `Analyze these user prompts and generate:
1. A short label (2-3 words, snake_case)
2. A description (1 sentence)
3. Keywords (5-10 words)

Prompts:
${samples.map((s, i) => `${i + 1}. ${s.slice(0, 200)}`).join('\n')}

Respond in JSON: { "label": "", "description": "", "keywords": [] }`;

  const response = await llmComplete(prompt);
  return JSON.parse(response);
}
```

### Topic Hierarchy Example

```typescript
const hierarchy: TopicHierarchy = {
  version: "1.0",
  topics: {
    data_queries: {
      description: "Fetching and querying data from various sources",
      subtopics: ["database_lookups", "api_requests", "search_operations"],
      keywords: ["find", "get", "query", "search", "lookup"],
    },
    calculations: {
      description: "Mathematical and analytical operations",
      subtopics: ["aggregations", "conversions", "financial_math"],
      keywords: ["calculate", "sum", "average", "convert"],
    },
    content_generation: {
      description: "Creating text, summaries, and formatted output",
      subtopics: ["summaries", "formatting", "translation"],
      keywords: ["write", "summarize", "format", "create"],
    },
  },
};
```

---

## Step C — Categorize Records

**Purpose:** Assign each record to a topic in the hierarchy.

**Input:** Validated `DatasetRecord[]`, `TopicHierarchy`  
**Output:** `DatasetRecord[]` with `topic` field populated

### Classification Methods

| Method | Speed | Accuracy | Cost |
|--------|-------|----------|------|
| Keyword matching | Fast | Low | Free |
| Embedding similarity | Medium | Medium | Low |
| LLM classification | Slow | High | Medium |
| Hybrid (embed + LLM fallback) | Medium | High | Low-Medium |

### Recommended: Hybrid Approach

```typescript
interface TopicEmbeddings {
  [topic: string]: number[];
}

async function categorizeRecords(
  records: DatasetRecord[],
  hierarchy: TopicHierarchy,
  options: {
    confidenceThreshold?: number;
    embeddingModel?: string;
  } = {}
): Promise<{
  categorized: DatasetRecord[];
  stats: CategorizationStats;
}> {
  const { confidenceThreshold = 0.7, embeddingModel = 'text-embedding-3-small' } = options;
  
  // Pre-compute topic embeddings
  const topicEmbeddings = await computeTopicEmbeddings(hierarchy, embeddingModel);
  
  const categorized: DatasetRecord[] = [];
  const stats: CategorizationStats = {
    total: records.length,
    highConfidence: 0,
    mediumConfidence: 0,
    needsReview: 0,
    byMethod: { embedding: 0, llm: 0, keyword: 0 },
  };
  
  for (const record of records) {
    const result = await categorizeRecord(
      record,
      hierarchy,
      topicEmbeddings,
      confidenceThreshold
    );
    
    // Update record with topic
    const updatedRecord: DatasetRecord = {
      ...record,
      topic: result.topic,
      metadata: {
        ...record.metadata,
        categorization: result,
      },
    };
    
    categorized.push(updatedRecord);
    
    // Update stats
    stats.byMethod[result.method]++;
    if (result.confidence >= 0.8) stats.highConfidence++;
    else if (result.confidence >= 0.5) stats.mediumConfidence++;
    else stats.needsReview++;
  }
  
  return { categorized, stats };
}

async function categorizeRecord(
  record: DatasetRecord,
  hierarchy: TopicHierarchy,
  topicEmbeddings: TopicEmbeddings,
  threshold: number
): Promise<CategorizationMetadata> {
  const content = extractUserContent(record);
  
  // 1. Try keyword matching first (fast)
  const keywordMatch = matchByKeywords(content, hierarchy);
  if (keywordMatch && keywordMatch.confidence >= 0.9) {
    return { ...keywordMatch, method: 'keyword' };
  }
  
  // 2. Try embedding similarity
  const contentEmbedding = await embed(content);
  const embeddingResult = findBestTopicByEmbedding(
    contentEmbedding,
    topicEmbeddings
  );
  
  if (embeddingResult.confidence >= threshold) {
    return { ...embeddingResult, method: 'embedding' };
  }
  
  // 3. Fall back to LLM for low confidence
  const llmResult = await classifyWithLLM(content, Object.keys(hierarchy.topics));
  
  return {
    topic: llmResult.topic,
    confidence: llmResult.confidence,
    method: 'llm',
    needsReview: llmResult.confidence < 0.5,
  };
}

function matchByKeywords(
  content: string,
  hierarchy: TopicHierarchy
): { topic: string; confidence: number } | null {
  const contentLower = content.toLowerCase();
  let bestMatch: { topic: string; score: number } | null = null;
  
  for (const [topic, node] of Object.entries(hierarchy.topics)) {
    const keywords = node.keywords || [];
    const matchCount = keywords.filter(kw => contentLower.includes(kw)).length;
    const score = matchCount / keywords.length;
    
    if (score > (bestMatch?.score || 0)) {
      bestMatch = { topic, score };
    }
  }
  
  if (bestMatch && bestMatch.score >= 0.3) {
    return { topic: bestMatch.topic, confidence: Math.min(bestMatch.score * 1.5, 0.95) };
  }
  
  return null;
}

function findBestTopicByEmbedding(
  contentEmbedding: number[],
  topicEmbeddings: TopicEmbeddings
): { topic: string; confidence: number } {
  let bestTopic = '';
  let bestScore = -1;
  
  for (const [topic, embedding] of Object.entries(topicEmbeddings)) {
    const score = cosineSimilarity(contentEmbedding, embedding);
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }
  
  return { topic: bestTopic, confidence: bestScore };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### Categorization Stats

```typescript
interface CategorizationStats {
  total: number;
  highConfidence: number;   // >= 0.8
  mediumConfidence: number; // 0.5 - 0.8
  needsReview: number;      // < 0.5
  byMethod: {
    embedding: number;
    llm: number;
    keyword: number;
  };
}
```

---

## Step D — Review Coverage Distribution

**Purpose:** Understand current dataset composition before deciding what to generate.

**Input:** Categorized `DatasetRecord[]`  
**Output:** `CoverageReport`

### Coverage Analysis Code

```typescript
interface TargetDistribution {
  [topic: string]: number;  // target percentage (0-100)
}

function analyzeCoverage(
  records: DatasetRecord[],
  targets?: TargetDistribution
): CoverageReport {
  // Count by topic
  const counts: Record<string, number> = {};
  for (const record of records) {
    const topic = record.topic || 'uncategorized';
    counts[topic] = (counts[topic] || 0) + 1;
  }
  
  const total = records.length;
  const topics = Object.keys(counts);
  
  // Default targets: uniform distribution
  const defaultTarget = 100 / topics.length;
  const targetDist = targets || Object.fromEntries(
    topics.map(t => [t, defaultTarget])
  );
  
  // Build distribution analysis
  const distribution: Record<string, TopicDistribution> = {};
  
  for (const topic of topics) {
    const count = counts[topic];
    const percentage = (count / total) * 100;
    const targetPct = targetDist[topic] || defaultTarget;
    const gap = targetPct - percentage;
    
    distribution[topic] = {
      count,
      percentage: Math.round(percentage * 10) / 10,
      targetPercentage: targetPct,
      gap: Math.round(gap * 10) / 10,
      status: gap > 5 ? 'under' : gap < -5 ? 'over' : 'ok',
    };
  }
  
  // Calculate balance score (min/max ratio)
  const countValues = Object.values(counts);
  const balanceScore = Math.min(...countValues) / Math.max(...countValues);
  
  // Generate recommendations
  const recommendations = generateCoverageRecommendations(distribution, total);
  
  return {
    timestamp: new Date().toISOString(),
    totalRecords: total,
    distribution,
    balanceScore: Math.round(balanceScore * 100) / 100,
    recommendations,
  };
}

function generateCoverageRecommendations(
  distribution: Record<string, TopicDistribution>,
  total: number
): string[] {
  const recommendations: string[] = [];
  
  for (const [topic, dist] of Object.entries(distribution)) {
    if (dist.status === 'under' && dist.gap > 10) {
      const needed = Math.ceil((dist.gap / 100) * total);
      recommendations.push(`Generate ~${needed} more "${topic}" records`);
    }
  }
  
  const underTopics = Object.entries(distribution)
    .filter(([_, d]) => d.status === 'under')
    .length;
  
  if (underTopics > Object.keys(distribution).length / 2) {
    recommendations.push('Consider adjusting target distribution to match data');
  }
  
  return recommendations;
}
```

### Coverage Report Example

```typescript
const report: CoverageReport = {
  timestamp: "2025-01-22T11:00:00Z",
  totalRecords: 11892,
  distribution: {
    data_queries: {
      count: 4521,
      percentage: 38.0,
      targetPercentage: 25.0,
      gap: -13.0,
      status: "over",
    },
    calculations: {
      count: 892,
      percentage: 7.5,
      targetPercentage: 20.0,
      gap: 12.5,
      status: "under",
    },
    content_generation: {
      count: 3245,
      percentage: 27.3,
      targetPercentage: 25.0,
      gap: -2.3,
      status: "ok",
    },
    tool_usage: {
      count: 2134,
      percentage: 17.9,
      targetPercentage: 20.0,
      gap: 2.1,
      status: "ok",
    },
    other: {
      count: 1100,
      percentage: 9.3,
      targetPercentage: 10.0,
      gap: 0.7,
      status: "ok",
    },
  },
  balanceScore: 0.20,
  recommendations: [
    'Generate ~1,485 more "calculations" records',
  ],
};
```

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
│ data_queries     ████████░░ 38%   (25%)    │
│ calculations     ██░░░░░░░░  8%   (20%) ⚠️  │
│ content_gen      ██████░░░░ 27%   (25%)    │
│ tool_usage       ████░░░░░░ 18%   (20%)    │
│ other            ██░░░░░░░░  9%   (10%)    │
│                                             │
│ Balance Score: 0.20 (Poor)                  │
│ ⚠️ "calculations" significantly under       │
│                                             │
│ [Set Custom Targets]         [Continue →]   │
└─────────────────────────────────────────────┘
```

---

[Next: Coverage & Generation →](./05_Coverage_Generation.md)
