# 05 - Coverage & Generation

[← Back to Index](./00_INDEX.md) | [← Previous](./04_Topic_Categorization.md)

---

## Overview

This module covers:
- **Step E:** Generate Synthetic Samples
- **Step F:** Review Final Distribution

---

## Data Structures

```typescript
// Generation plan for filling gaps
interface GenerationPlan {
  timestamp: string;
  totalToGenerate: number;
  byTopic: Record<string, TopicGenerationPlan>;
}

interface TopicGenerationPlan {
  currentCount: number;
  targetCount: number;
  toGenerate: number;
  exampleRecordIds: string[];  // Sample records to use as examples
}

// Generation result
interface GenerationResult {
  topic: string;
  requested: number;
  generated: number;
  valid: number;
  rejected: number;
  rejectionReasons: Record<string, number>;
  passRate: string;
}

// Final dataset split
interface DatasetSplit {
  train: DatasetRecord[];
  validation: DatasetRecord[];
  stats: SplitStats;
}

interface SplitStats {
  totalRecords: number;
  fromTraces: number;
  fromSynthetic: number;
  syntheticPercentage: string;
  trainCount: number;
  validCount: number;
  splitRatio: string;
  byTopic: Record<string, { train: number; valid: number }>;
}
```

---

## Step E — Generate Synthetic Samples

**Purpose:** Fill coverage gaps with high-quality LLM-generated records.

**Input:** Categorized `DatasetRecord[]`, `CoverageReport`, `TopicHierarchy`  
**Output:** New `DatasetRecord[]` with `is_generated: true`

### Create Generation Plan

```typescript
function createGenerationPlan(
  records: DatasetRecord[],
  coverage: CoverageReport,
  options: {
    targetTotal?: number;
    maxSyntheticRatio?: number;
  } = {}
): GenerationPlan {
  const { maxSyntheticRatio = 0.5 } = options;
  const targetTotal = options.targetTotal || records.length * 1.2;
  
  const plan: GenerationPlan = {
    timestamp: new Date().toISOString(),
    totalToGenerate: 0,
    byTopic: {},
  };
  
  for (const [topic, dist] of Object.entries(coverage.distribution)) {
    if (dist.status !== 'under') continue;
    
    const targetCount = Math.ceil((dist.targetPercentage / 100) * targetTotal);
    const toGenerate = Math.max(0, targetCount - dist.count);
    
    // Limit synthetic ratio
    const maxSynthetic = Math.floor(dist.count * (maxSyntheticRatio / (1 - maxSyntheticRatio)));
    const actualToGenerate = Math.min(toGenerate, maxSynthetic);
    
    if (actualToGenerate > 0) {
      // Find example records for this topic
      const topicRecords = records.filter(r => r.topic === topic);
      const examples = selectDiverseExamples(topicRecords, 5);
      
      plan.byTopic[topic] = {
        currentCount: dist.count,
        targetCount,
        toGenerate: actualToGenerate,
        exampleRecordIds: examples.map(r => r.id),
      };
      
      plan.totalToGenerate += actualToGenerate;
    }
  }
  
  return plan;
}

function selectDiverseExamples(records: DatasetRecord[], count: number): DatasetRecord[] {
  if (records.length <= count) return records;
  
  // Simple random sampling - in production, use embedding-based diversity
  const shuffled = [...records].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
```

### Generate Synthetic Records

```typescript
async function generateSyntheticRecords(
  plan: GenerationPlan,
  records: DatasetRecord[],
  hierarchy: TopicHierarchy,
  datasetId: string
): Promise<{
  generated: DatasetRecord[];
  results: GenerationResult[];
}> {
  const generated: DatasetRecord[] = [];
  const results: GenerationResult[] = [];
  
  for (const [topic, topicPlan] of Object.entries(plan.byTopic)) {
    const result = await generateForTopic(
      topic,
      topicPlan,
      records,
      hierarchy,
      datasetId
    );
    
    generated.push(...result.records);
    results.push(result.stats);
  }
  
  return { generated, results };
}

async function generateForTopic(
  topic: string,
  plan: TopicGenerationPlan,
  allRecords: DatasetRecord[],
  hierarchy: TopicHierarchy,
  datasetId: string
): Promise<{
  records: DatasetRecord[];
  stats: GenerationResult;
}> {
  const topicNode = hierarchy.topics[topic];
  const exampleRecords = allRecords.filter(r => plan.exampleRecordIds.includes(r.id));
  
  const validRecords: DatasetRecord[] = [];
  const rejectionReasons: Record<string, number> = {};
  let totalGenerated = 0;
  
  // Generate in batches
  const batchSize = 10;
  const batches = Math.ceil(plan.toGenerate / batchSize);
  
  for (let batch = 0; batch < batches && validRecords.length < plan.toGenerate; batch++) {
    const needed = Math.min(batchSize, plan.toGenerate - validRecords.length);
    const batchResults = await generateBatch(
      topic,
      topicNode,
      exampleRecords,
      needed,
      datasetId
    );
    
    totalGenerated += batchResults.length;
    
    // Validate each generated record
    for (const record of batchResults) {
      const validation = validateSyntheticRecord(record, allRecords, validRecords);
      
      if (validation.valid) {
        validRecords.push(record);
      } else {
        const reason = validation.error || 'unknown';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      }
    }
  }
  
  return {
    records: validRecords,
    stats: {
      topic,
      requested: plan.toGenerate,
      generated: totalGenerated,
      valid: validRecords.length,
      rejected: totalGenerated - validRecords.length,
      rejectionReasons,
      passRate: `${((validRecords.length / totalGenerated) * 100).toFixed(1)}%`,
    },
  };
}

async function generateBatch(
  topic: string,
  topicNode: TopicNode,
  examples: DatasetRecord[],
  count: number,
  datasetId: string
): Promise<DatasetRecord[]> {
  const exampleContents = examples.map(r => {
    const dataInfo = r.data as DataInfo;
    return JSON.stringify(dataInfo.input?.messages || [], null, 2);
  });
  
  const prompt = `Generate ${count} unique training prompts for topic: "${topic}"

Topic Description: ${topicNode.description}
Keywords: ${(topicNode.keywords || []).join(', ')}

Requirements:
- Each prompt must end with a user message
- Prompts should be realistic and varied
- Match the style and complexity of the examples
- Do NOT copy examples exactly
- No placeholder text like [INSERT] or TODO

Examples:
${exampleContents.map((ex, i) => `--- Example ${i + 1} ---\n${ex}`).join('\n\n')}

Generate ${count} unique prompts as a JSON array of message arrays.
Each prompt should be an array of message objects with "role" and "content".`;

  const response = await llmComplete(prompt, { responseFormat: 'json' });
  const generatedPrompts: Message[][] = JSON.parse(response);
  
  // Convert to DatasetRecord format
  return generatedPrompts.map((messages, i) => ({
    id: `gen_${topic}_${Date.now()}_${i}`,
    datasetId,
    data: {
      input: { messages },
      output: {},
    } as DataInfo,
    metadata: {
      generatedAt: new Date().toISOString(),
      generationTopic: topic,
    },
    topic,
    is_generated: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}
```

### Validate Synthetic Records

```typescript
interface SyntheticValidationResult {
  valid: boolean;
  error?: string;
}

function validateSyntheticRecord(
  record: DatasetRecord,
  seedRecords: DatasetRecord[],
  otherSynthetic: DatasetRecord[]
): SyntheticValidationResult {
  const dataInfo = record.data as DataInfo;
  
  // 1. Basic structure validation
  const messages = dataInfo.input?.messages;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: 'invalid_structure' };
  }
  
  // 2. Must end with user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') {
    return { valid: false, error: 'last_not_user' };
  }
  
  // 3. Check for LLM artifacts
  const content = extractUserContent(record);
  const artifacts = ['I cannot', "I'm sorry", 'As an AI', '[INSERT]', 'TODO', '{{', '}}'];
  for (const artifact of artifacts) {
    if (content.toLowerCase().includes(artifact.toLowerCase())) {
      return { valid: false, error: 'llm_artifact' };
    }
  }
  
  // 4. Check for duplicates against seed data
  const contentHash = hashContent(content);
  const seedHashes = new Set(seedRecords.map(r => hashContent(extractUserContent(r))));
  if (seedHashes.has(contentHash)) {
    return { valid: false, error: 'duplicate_of_seed' };
  }
  
  // 5. Check for duplicates against other synthetic
  const syntheticHashes = new Set(otherSynthetic.map(r => hashContent(extractUserContent(r))));
  if (syntheticHashes.has(contentHash)) {
    return { valid: false, error: 'duplicate_synthetic' };
  }
  
  // 6. Minimum length check
  if (content.length < 20) {
    return { valid: false, error: 'too_short' };
  }
  
  return { valid: true };
}

function hashContent(content: string): string {
  // Normalize and hash
  const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ');
  return normalized.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(36);
}
```

---

## Step F — Review Final Distribution

**Purpose:** Confirm combined dataset is balanced and create train/validation split.

**Input:** Original `DatasetRecord[]`, Synthetic `DatasetRecord[]`  
**Output:** `DatasetSplit` with train and validation sets

### Merge and Split

```typescript
function createDatasetSplit(
  originalRecords: DatasetRecord[],
  syntheticRecords: DatasetRecord[],
  options: {
    trainRatio?: number;
    stratifyByTopic?: boolean;
    shuffle?: boolean;
  } = {}
): DatasetSplit {
  const { trainRatio = 0.9, stratifyByTopic = true, shuffle = true } = options;
  
  // Combine all records
  let allRecords = [...originalRecords, ...syntheticRecords];
  
  // Shuffle if requested
  if (shuffle) {
    allRecords = allRecords.sort(() => Math.random() - 0.5);
  }
  
  let train: DatasetRecord[] = [];
  let validation: DatasetRecord[] = [];
  
  if (stratifyByTopic) {
    // Group by topic
    const byTopic: Record<string, DatasetRecord[]> = {};
    for (const record of allRecords) {
      const topic = record.topic || 'uncategorized';
      if (!byTopic[topic]) byTopic[topic] = [];
      byTopic[topic].push(record);
    }
    
    // Split each topic
    for (const [topic, topicRecords] of Object.entries(byTopic)) {
      const splitIdx = Math.floor(topicRecords.length * trainRatio);
      train.push(...topicRecords.slice(0, splitIdx));
      validation.push(...topicRecords.slice(splitIdx));
    }
    
    // Final shuffle
    if (shuffle) {
      train = train.sort(() => Math.random() - 0.5);
      validation = validation.sort(() => Math.random() - 0.5);
    }
  } else {
    // Simple split
    const splitIdx = Math.floor(allRecords.length * trainRatio);
    train = allRecords.slice(0, splitIdx);
    validation = allRecords.slice(splitIdx);
  }
  
  // Calculate stats
  const stats = calculateSplitStats(
    train,
    validation,
    originalRecords.length,
    syntheticRecords.length
  );
  
  return { train, validation, stats };
}

function calculateSplitStats(
  train: DatasetRecord[],
  validation: DatasetRecord[],
  originalCount: number,
  syntheticCount: number
): SplitStats {
  const total = train.length + validation.length;
  
  // Count by topic
  const byTopic: Record<string, { train: number; valid: number }> = {};
  
  for (const record of train) {
    const topic = record.topic || 'uncategorized';
    if (!byTopic[topic]) byTopic[topic] = { train: 0, valid: 0 };
    byTopic[topic].train++;
  }
  
  for (const record of validation) {
    const topic = record.topic || 'uncategorized';
    if (!byTopic[topic]) byTopic[topic] = { train: 0, valid: 0 };
    byTopic[topic].valid++;
  }
  
  return {
    totalRecords: total,
    fromTraces: originalCount,
    fromSynthetic: syntheticCount,
    syntheticPercentage: `${((syntheticCount / total) * 100).toFixed(1)}%`,
    trainCount: train.length,
    validCount: validation.length,
    splitRatio: `${Math.round((train.length / total) * 100)}/${Math.round((validation.length / total) * 100)}`,
    byTopic,
  };
}
```

### Final Distribution Report

```typescript
interface FinalDistributionReport {
  timestamp: string;
  before: Record<string, { count: number; percentage: number }>;
  after: Record<string, { count: number; percentage: number }>;
  changes: Record<string, string>;
  balanceScore: { before: number; after: number; improvement: string };
  split: SplitStats;
}

function generateFinalReport(
  originalRecords: DatasetRecord[],
  split: DatasetSplit
): FinalDistributionReport {
  const allRecords = [...split.train, ...split.validation];
  
  // Calculate before distribution
  const beforeCounts: Record<string, number> = {};
  for (const r of originalRecords) {
    const topic = r.topic || 'uncategorized';
    beforeCounts[topic] = (beforeCounts[topic] || 0) + 1;
  }
  
  // Calculate after distribution  
  const afterCounts: Record<string, number> = {};
  for (const r of allRecords) {
    const topic = r.topic || 'uncategorized';
    afterCounts[topic] = (afterCounts[topic] || 0) + 1;
  }
  
  const beforeTotal = originalRecords.length;
  const afterTotal = allRecords.length;
  
  const before: Record<string, { count: number; percentage: number }> = {};
  const after: Record<string, { count: number; percentage: number }> = {};
  const changes: Record<string, string> = {};
  
  const allTopics = new Set([...Object.keys(beforeCounts), ...Object.keys(afterCounts)]);
  
  for (const topic of allTopics) {
    const bCount = beforeCounts[topic] || 0;
    const aCount = afterCounts[topic] || 0;
    const bPct = (bCount / beforeTotal) * 100;
    const aPct = (aCount / afterTotal) * 100;
    
    before[topic] = { count: bCount, percentage: Math.round(bPct * 10) / 10 };
    after[topic] = { count: aCount, percentage: Math.round(aPct * 10) / 10 };
    
    const change = aPct - bPct;
    changes[topic] = change >= 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
  }
  
  // Balance scores
  const beforeValues = Object.values(beforeCounts);
  const afterValues = Object.values(afterCounts);
  const beforeBalance = Math.min(...beforeValues) / Math.max(...beforeValues);
  const afterBalance = Math.min(...afterValues) / Math.max(...afterValues);
  const improvement = ((afterBalance - beforeBalance) / beforeBalance) * 100;
  
  return {
    timestamp: new Date().toISOString(),
    before,
    after,
    changes,
    balanceScore: {
      before: Math.round(beforeBalance * 100) / 100,
      after: Math.round(afterBalance * 100) / 100,
      improvement: `+${improvement.toFixed(0)}%`,
    },
    split: split.stats,
  };
}
```

---

## UI Mockups

### Step E: Generation Progress

```
┌─────────────────────────────────────────────┐
│ Generating Synthetic Samples                │
├─────────────────────────────────────────────┤
│ Filling coverage gaps...                    │
│                                             │
│ calculations:                               │
│   Target: +1,400  Progress: 1,312 / 1,400   │
│   ████████████████░░░░ 94%                  │
│   Valid: 1,245 (95%)                        │
│                                             │
│ tool_usage:                                 │
│   Target: +200   Progress: 200 / 200 ✓      │
│   ████████████████████ 100%                 │
│   Valid: 189 (95%)                          │
│                                             │
│ Sample preview:                             │
│ ┌─────────────────────────────────────────┐ │
│ │ "Calculate the compound interest on a   │ │
│ │ $50,000 investment at 7.2% APR..."      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Regenerate Failed]           [Continue →]  │
└─────────────────────────────────────────────┘
```

### Step F: Final Distribution Review

```
┌─────────────────────────────────────────────┐
│ Final Dataset Distribution                  │
├─────────────────────────────────────────────┤
│                  Before    After            │
│ data_queries     38.0%  →  31.2%           │
│ calculations      7.5%  →  18.8%  ✓ Fixed  │
│ content_gen      27.3%  →  24.1%           │
│ tool_usage       17.9%  →  19.2%  ✓ Fixed  │
│ other             9.3%  →   6.7%           │
│                                             │
│ Balance Score: 0.20 → 0.75 (+275% ↑)       │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Total:     13,326 records               │ │
│ │ From data: 11,892 (89.2%)               │ │
│ │ Synthetic:  1,434 (10.8%)               │ │
│ │                                         │ │
│ │ Train set: 11,993 (90%)                 │ │
│ │ Valid set:  1,333 (10%)                 │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Adjust Split] [View Samples] [Continue →]  │
└─────────────────────────────────────────────┘
```

---

## Quality Checklist

Before proceeding to grader setup, verify:

- [ ] All topics have sufficient samples (min 100 each)
- [ ] Balance score > 0.5
- [ ] Synthetic percentage < 50% (prefer real data)
- [ ] No single topic dominates (< 40%)
- [ ] Validation set covers all topics

---

[Next: Grader Setup →](./06_Grader_Setup.md)
