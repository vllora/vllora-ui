# 05 - Coverage & Generation

[← Back to Index](./00_INDEX.md) | [← Previous](./04_Topic_Categorization.md)

---

## Overview

This module covers:
- **Action D:** Coverage Analysis (automatic dashboard)
- **Action E:** Generate Synthetic Samples

---

## Generation Strategy

### Why Generate Data?

| Problem | Solution |
|---------|----------|
| Imbalanced topics | Generate for under-represented topics |
| Small dataset | Augment with synthetic samples |
| Missing edge cases | Generate specific scenarios |
| No tool usage examples | Generate tool call patterns |

### Generation Approaches

We support multiple generation strategies:

| Strategy | Best For | Quality | Cost |
|----------|----------|---------|------|
| **Message variation** ⭐ | Multi-turn records | Highest | Lowest |
| **Few-shot from examples** | Similar prompts | High | Low |
| **Topic description** | New variations | Medium | Low |
| **Scenario expansion** | Edge cases | High | Medium |
| **Tool chain generation** | Tool usage patterns | High | High |

> ⭐ **Recommended default** for multi-turn records

---

## Strategy 1: Message Variation (Recommended)

**Best for:** Multi-turn records with rich context

**Concept:** Keep the entire conversation context (system prompt, previous turns) but vary only the last user message. Since RFT only uses `input.messages` as the prompt, we don't need to worry about the output.

### Why This Works Best for RFT

```
Original Record:
input.messages = [
  [system]: "You are a financial assistant..."
  [user]: "What's my account balance?"
  [assistant]: "Your balance is $5,432.21"
  [user]: "Transfer $100 to savings"        ← ONLY VARY THIS
]
output = { ... }  // Ignored by RFT anyway

Generated Variation:
input.messages = [
  [system]: "You are a financial assistant..."    ← KEPT (real context)
  [user]: "What's my account balance?"            ← KEPT (real context)
  [assistant]: "Your balance is $5,432.21"        ← KEPT (real context)
  [user]: "Move $500 to checking"                 ← NEW VARIATION
]
output = {}  // RFT generates its own response!
```

### Benefits

| Benefit | Why It Matters |
|---------|----------------|
| **Context is 100% coherent** | Previous turns are real production data |
| **Highest quality** | Real context + varied query = realistic |
| **Fastest generation** | Only generate one short message |
| **Cheapest** | Minimal LLM tokens used |
| **No coherence issues** | Assistant responses stay valid |

### When NOT to Use

- Single-turn records (no context to preserve)
- Need entirely different conversation flows
- Context is too specific to original query

```typescript
interface MessageVariationConfig {
  strategy: 'message_variation';
  variationsPerRecord: number;    // default: 3
  preserveIntent: boolean;        // default: true (same topic intent)
  temperature: number;            // default: 0.7
}

const MESSAGE_VARIATION_PROMPT = `You are generating training data variations.

Original conversation context:
{{contextMessages}}

Last user message to vary:
"{{lastUserMessage}}"

Generate {{count}} alternative user messages that:
1. Make sense given the conversation context above
2. Are realistic things a user might say at this point
3. {{#if preserveIntent}}Stay within the same general intent/topic{{else}}Can explore different intents{{/if}}
4. Are different from each other (not just rephrased)

IMPORTANT:
- Output ONLY a JSON array of strings (the new user messages)
- Each string is a complete user message
- Do NOT include any explanation

Output format:
["alternative message 1", "alternative message 2", ...]`;
```

### Example: Message Variation

**Original Record:**
```json
{
  "input": {
    "messages": [
      {"role": "system", "content": "You are a travel booking assistant."},
      {"role": "user", "content": "I need to book a flight"},
      {"role": "assistant", "content": "Sure! Where would you like to fly to?"},
      {"role": "user", "content": "From NYC to London next month"}
    ]
  }
}
```

**Generated Variations (vary last message only):**
```json
[
  "From Boston to Paris in two weeks",
  "San Francisco to Tokyo, departing March 15th",
  "I need to go from Chicago to Miami this Friday",
  "Seattle to Vancouver, flexible dates in April"
]
```

**Resulting Records:**
```json
[
  {
    "input": {
      "messages": [
        {"role": "system", "content": "You are a travel booking assistant."},
        {"role": "user", "content": "I need to book a flight"},
        {"role": "assistant", "content": "Sure! Where would you like to fly to?"},
        {"role": "user", "content": "From Boston to Paris in two weeks"}
      ]
    },
    "is_generated": true
  },
  // ... more variations
]
```

---

## Strategy 2: Few-Shot from Examples

Use existing records as examples to generate similar ones.

```typescript
interface FewShotConfig {
  strategy: 'few_shot';
  examplesPerTopic: number;      // default: 5
  diversityMethod: 'random' | 'embedding'; // default: 'embedding'
  temperature: number;           // default: 0.8
}

const FEW_SHOT_PROMPT = `You are generating training data for an AI model.

Topic: {{topic}}
Description: {{topicDescription}}

Here are {{exampleCount}} example prompts from this topic:

{{#each examples}}
--- Example {{@index}} ---
{{this}}
{{/each}}

Generate {{count}} NEW and UNIQUE prompts that:
1. Match the style, complexity, and format of the examples
2. Are realistic scenarios a real user would ask
3. Are different from the examples (not just rephrased)
4. Cover diverse sub-scenarios within this topic

IMPORTANT:
- Output ONLY valid JSON array of message arrays
- Each prompt is an array of message objects with "role" and "content"
- Do NOT include any explanation or markdown

Output format:
[
  [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}],
  [{"role": "user", "content": "..."}],
  ...
]`;
```

### Example: Few-Shot Generation

**Input Examples (from "calculations" topic):**
```json
[
  [{"role": "user", "content": "Calculate the monthly payment for a $300,000 mortgage at 6.5% APR over 30 years"}],
  [{"role": "user", "content": "What's the compound interest on $10,000 at 5% annually for 10 years?"}]
]
```

**Generated Output:**
```json
[
  [{"role": "user", "content": "I need to figure out how much I'll pay total on a car loan of $25,000 at 4.9% APR for 5 years"}],
  [{"role": "user", "content": "Calculate the future value of $500 monthly investments at 7% return over 20 years"}],
  [{"role": "user", "content": "What's the break-even point if I refinance my $200,000 mortgage from 7% to 5.5% with $4,000 closing costs?"}]
]
```

---

## Strategy 3: Topic Description Based

Generate from topic description when examples are limited.

```typescript
interface TopicDescriptionConfig {
  strategy: 'topic_description';
  includeKeywords: boolean;      // default: true
  difficultyLevels: ('easy' | 'medium' | 'hard')[];
  temperature: number;           // default: 0.9
}

const TOPIC_DESCRIPTION_PROMPT = `You are generating training data for an AI model.

Topic: {{topic}}
Description: {{topicDescription}}
Keywords: {{keywords}}

Generate {{count}} diverse prompts for this topic.

Requirements:
1. Create realistic user requests that fit this topic
2. Vary the complexity: {{difficultyLevels}}
3. Include different sub-scenarios within the topic
4. Make prompts specific and actionable (not vague)

Difficulty guidelines:
- EASY: Simple, straightforward requests
- MEDIUM: Requires multiple steps or considerations  
- HARD: Complex scenarios with constraints or edge cases

Output as JSON array of message arrays.`;
```

---

## Strategy 4: Scenario Expansion

Generate variations of a specific scenario or edge case.

```typescript
interface ScenarioExpansionConfig {
  strategy: 'scenario_expansion';
  baseScenario: string;          // The scenario to expand
  variations: string[];          // Aspects to vary
  count: number;
}

const SCENARIO_EXPANSION_PROMPT = `You are generating training data variations.

Base scenario: {{baseScenario}}

Generate {{count}} variations by changing these aspects:
{{#each variations}}
- {{this}}
{{/each}}

Each variation should be a realistic prompt that a user might ask.
Keep the core task similar but change the specified aspects.

Output as JSON array of message arrays.`;
```

### Example: Scenario Expansion

**Base Scenario:** "User asks to book a flight"

**Variations:** ["destination", "constraints", "passenger count", "special requirements"]

**Generated:**
```json
[
  [{"role": "user", "content": "Book me a flight from NYC to Tokyo for next month, business class, with a window seat"}],
  [{"role": "user", "content": "I need flights for 4 people from Boston to Miami, departing Friday returning Sunday, budget under $300 each"}],
  [{"role": "user", "content": "Find a flight from LA to London that allows pets in cabin, sometime in March"}]
]
```

---

## Strategy 5: Tool Chain Generation

Generate prompts that require specific tool usage patterns.

```typescript
interface ToolChainConfig {
  strategy: 'tool_chain';
  availableTools: Tool[];        // Tools the model can use
  toolPatterns: ToolPattern[];   // Patterns to generate
  includeMultiTurn: boolean;     // Generate multi-turn conversations
}

interface ToolPattern {
  name: string;
  tools: string[];               // Tool names in order
  description: string;
}

const TOOL_CHAIN_PROMPT = `You are generating training data for an AI model that uses tools.

Available tools:
{{#each tools}}
- {{this.name}}: {{this.description}}
{{/each}}

Generate {{count}} prompts that would require this tool pattern:
Pattern: {{pattern.name}}
Tools needed: {{pattern.tools}}
Description: {{pattern.description}}

Requirements:
1. The prompt should naturally require using these tools in order
2. Include realistic context and specific details
3. The user shouldn't explicitly mention tool names

{{#if includeMultiTurn}}
For multi-turn conversations, include:
- System message (if needed)
- User message
- Assistant response with tool calls
- Tool results
- Follow-up user message
{{/if}}

Output as JSON array of message arrays.`;
```

### Example: Tool Chain Generation

**Tool Pattern:** "search_then_calculate"
**Tools:** ["web_search", "calculator"]

**Generated:**
```json
[
  [
    {"role": "user", "content": "What's the current price of Apple stock and how much would 50 shares cost?"}
  ],
  [
    {"role": "system", "content": "You are a financial assistant with access to real-time data."},
    {"role": "user", "content": "Look up Tesla's market cap and calculate what percentage of the S&P 500 it represents"}
  ]
]
```

---

## Generation Configuration

### User-Configurable Options

```typescript
interface GenerationConfig {
  // Strategy selection
  strategy: 'message_variation' | 'few_shot' | 'topic_description' | 'scenario_expansion' | 'tool_chain';
  
  // Quality controls
  temperature: number;           // 0.7-1.0, higher = more variety
  validationStrictness: 'low' | 'medium' | 'high';
  
  // Limits
  maxSyntheticRatio: number;     // Max % of dataset that's synthetic (default: 0.3)
  batchSize: number;             // Records per LLM call (default: 10)
  maxRetries: number;            // Retry failed generations (default: 3)
  
  // Filtering
  minLength: number;             // Minimum prompt length (default: 20)
  maxLength: number;             // Maximum prompt length (default: 2000)
  deduplicationThreshold: number; // Similarity threshold (default: 0.9)
  
  // Message variation specific
  variationsPerRecord: number;   // For message_variation (default: 3)
  preserveIntent: boolean;       // Keep same topic intent (default: true)
}

const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  strategy: 'message_variation',  // ⭐ Recommended default
  temperature: 0.7,
  validationStrictness: 'medium',
  maxSyntheticRatio: 0.3,
  batchSize: 10,
  maxRetries: 3,
  minLength: 20,
  maxLength: 2000,
  deduplicationThreshold: 0.9,
  variationsPerRecord: 3,
  preserveIntent: true,
};
```

### Strategy Selection Guide

```typescript
function selectBestStrategy(records: DatasetRecord[]): GenerationConfig['strategy'] {
  // Count multi-turn vs single-turn records
  const multiTurnCount = records.filter(r => {
    const messages = (r.data as DataInfo).input?.messages || [];
    return messages.length > 1;
  }).length;
  
  const multiTurnRatio = multiTurnCount / records.length;
  
  // If >50% are multi-turn, use message_variation
  if (multiTurnRatio > 0.5) {
    return 'message_variation';
  }
  
  // Otherwise, use few_shot
  return 'few_shot';
}
```

### Per-Topic Override

Users can configure different strategies per topic:

```typescript
interface TopicGenerationOverride {
  topic: string;
  strategy?: GenerationConfig['strategy'];
  temperature?: number;
  customPrompt?: string;         // Override the generation prompt
  toolPatterns?: ToolPattern[];  // For tool_chain strategy
}
```

---

## Data Structures

```typescript
// Generation plan for filling gaps
interface GenerationPlan {
  timestamp: string;
  totalToGenerate: number;
  config: GenerationConfig;
  byTopic: Record<string, TopicGenerationPlan>;
}

interface TopicGenerationPlan {
  currentCount: number;
  targetCount: number;
  toGenerate: number;
  strategy: GenerationConfig['strategy'];
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

## Action E — Generate Synthetic Samples

**Trigger:** `[Generate Samples]` button in Dataset Details  
**Can Repeat:** ✅ Yes - generate more anytime

**Purpose:** Fill coverage gaps with high-quality LLM-generated records.

### UI Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Generate Samples                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Default Strategy: [Message variation ▼]  ⭐ Recommended for multi-turn  │
│                                                                         │
│ Topics to fill:                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Topic             Need     Strategy                  Multi-turn?    │ │
│ │ ───────────────────────────────────────────────────────────────────│ │
│ │ ☑ calculations    +1,400   [Message variation ▼]    ✓ 89%          │ │
│ │ ☑ tool_usage      +300     [Message variation ▼]    ✓ 95%          │ │
│ │ ☑ simple_queries  +200     [Few-shot ▼]             ✗ 12%          │ │
│ │ ☐ other           +0       -                        -              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Strategy options:                                                       │
│ • Message variation - Vary last user message (best for multi-turn)     │
│ • Few-shot - Generate from examples (best for single-turn)             │
│ • Topic description - Generate from topic keywords                      │
│ • Tool chain - Generate tool-requiring prompts                         │
│                                                                         │
│ Advanced Settings:                                                      │
│ ├─ Variations per record: [3]    (for message variation)               │
│ ├─ Preserve intent: [✓]          (stay within same topic)              │
│ ├─ Temperature: [0.7]                                                   │
│ ├─ Max synthetic ratio: [30%]                                          │
│ └─ Validation strictness: [Medium ▼]                                   │
│                                                                         │
│ Total to generate: 1,900 records                                       │
│ Estimated cost: ~$1.80  (message variation is cheaper!)                │
│                                                                         │
│                                    [Cancel] [Start Generation]          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Create Generation Plan

```typescript
function createGenerationPlan(
  records: DatasetRecord[],
  coverage: CoverageReport,
  config: GenerationConfig = DEFAULT_GENERATION_CONFIG,
  topicOverrides: TopicGenerationOverride[] = []
): GenerationPlan {
  const { maxSyntheticRatio } = config;
  const targetTotal = records.length * 1.2;  // 20% increase target
  
  const plan: GenerationPlan = {
    timestamp: new Date().toISOString(),
    totalToGenerate: 0,
    config,
    byTopic: {},
  };
  
  // Build override lookup
  const overrideLookup = new Map(topicOverrides.map(o => [o.topic, o]));
  
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
      
      // Get topic-specific strategy or use default
      const override = overrideLookup.get(topic);
      const strategy = override?.strategy || config.strategy;
      
      plan.byTopic[topic] = {
        currentCount: dist.count,
        targetCount,
        toGenerate: actualToGenerate,
        strategy,
        exampleRecordIds: examples.map(r => r.id),
      };
      
      plan.totalToGenerate += actualToGenerate;
    }
  }
  
  return plan;
}

function selectDiverseExamples(
  records: DatasetRecord[], 
  count: number,
  method: 'random' | 'embedding' = 'random'
): DatasetRecord[] {
  if (records.length <= count) return records;
  
  if (method === 'embedding') {
    // In production: use embedding-based diversity selection
    // 1. Compute embeddings for all records
    // 2. Use k-means or maximal marginal relevance to select diverse set
    // For now, fall back to random
  }
  
  // Random sampling
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
      datasetId,
      plan.config  // Pass config to generateForTopic
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
  datasetId: string,
  config: GenerationConfig
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
  const batchSize = config.batchSize;
  const batches = Math.ceil(plan.toGenerate / batchSize);
  
  for (let batch = 0; batch < batches && validRecords.length < plan.toGenerate; batch++) {
    const needed = Math.min(batchSize, plan.toGenerate - validRecords.length);
    
    // Retry logic
    let retries = 0;
    let batchResults: DatasetRecord[] = [];
    
    while (retries < config.maxRetries) {
      try {
        batchResults = await generateBatch(
          topic,
          topicNode,
          exampleRecords,
          needed,
          datasetId,
          plan.strategy,
          config
        );
        break;
      } catch (error) {
        retries++;
        if (retries >= config.maxRetries) {
          console.error(`Failed to generate batch for ${topic} after ${retries} retries`);
          break;
        }
      }
    }
    
    totalGenerated += batchResults.length;
    
    // Validate each generated record
    for (const record of batchResults) {
      const validation = validateSyntheticRecord(record, allRecords, validRecords, config);
      
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
      passRate: totalGenerated > 0 
        ? `${((validRecords.length / totalGenerated) * 100).toFixed(1)}%`
        : '0%',
    },
  };
}

async function generateBatch(
  topic: string,
  topicNode: TopicNode,
  examples: DatasetRecord[],
  count: number,
  datasetId: string,
  strategy: GenerationConfig['strategy'],
  config: GenerationConfig
): Promise<DatasetRecord[]> {
  // Build prompt based on strategy
  const prompt = buildGenerationPrompt(topic, topicNode, examples, count, strategy);
  
  const response = await llmComplete(prompt, { 
    responseFormat: 'json',
    temperature: config.temperature,
  });
  
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
      generationStrategy: strategy,
    },
    topic,
    is_generated: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

function buildGenerationPrompt(
  topic: string,
  topicNode: TopicNode,
  examples: DatasetRecord[],
  count: number,
  strategy: GenerationConfig['strategy']
): string {
  const exampleContents = examples.map(r => {
    const dataInfo = r.data as DataInfo;
    return JSON.stringify(dataInfo.input?.messages || [], null, 2);
  });
  
  switch (strategy) {
    case 'message_variation':
      // Message variation is handled by generateMessageVariations() instead
      throw new Error('message_variation should use generateMessageVariations()');

    case 'few_shot':
      return `You are generating training data for an AI model.

Topic: ${topic}
Description: ${topicNode.description || 'N/A'}

Here are ${examples.length} example prompts from this topic:

${exampleContents.map((ex, i) => `--- Example ${i + 1} ---\n${ex}`).join('\n\n')}

Generate ${count} NEW and UNIQUE prompts that:
1. Match the style, complexity, and format of the examples
2. Are realistic scenarios a real user would ask
3. Are different from the examples (not just rephrased)
4. Cover diverse sub-scenarios within this topic

IMPORTANT:
- Output ONLY valid JSON array of message arrays
- Each prompt is an array of message objects with "role" and "content"
- Do NOT include any explanation or markdown

Output format:
[
  [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}],
  [{"role": "user", "content": "..."}]
]`;

    case 'topic_description':
      return `You are generating training data for an AI model.

Topic: ${topic}
Description: ${topicNode.description || 'N/A'}
Keywords: ${(topicNode.keywords || []).join(', ')}

Generate ${count} diverse prompts for this topic.

Requirements:
1. Create realistic user requests that fit this topic
2. Vary the complexity (mix of easy, medium, hard)
3. Include different sub-scenarios within the topic
4. Make prompts specific and actionable (not vague)

IMPORTANT:
- Output ONLY valid JSON array of message arrays
- Each prompt is an array of message objects with "role" and "content"

Output format:
[
  [{"role": "user", "content": "..."}],
  [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
]`;

    case 'tool_chain':
      return `You are generating training data for an AI model that uses tools.

Topic: ${topic}
Description: ${topicNode.description || 'N/A'}

Generate ${count} prompts that would require the model to use tools appropriately.

Requirements:
1. Create prompts that naturally require tool usage
2. User should NOT explicitly mention tool names
3. Include realistic context and specific details
4. Vary the complexity of tool usage required

Examples of tool-requiring prompts:
${exampleContents.slice(0, 3).map((ex, i) => `--- Example ${i + 1} ---\n${ex}`).join('\n\n')}

IMPORTANT:
- Output ONLY valid JSON array of message arrays
- Each prompt is an array of message objects with "role" and "content"

Output format:
[
  [{"role": "user", "content": "..."}],
  [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
]`;

    case 'scenario_expansion':
    default:
      // Fall back to few_shot style
      return buildGenerationPrompt(topic, topicNode, examples, count, 'few_shot');
  }
}

// ============================================================
// MESSAGE VARIATION STRATEGY (Recommended for multi-turn)
// ============================================================

async function generateMessageVariations(
  record: DatasetRecord,
  config: GenerationConfig,
  datasetId: string
): Promise<DatasetRecord[]> {
  const dataInfo = record.data as DataInfo;
  const messages = dataInfo.input?.messages || [];
  
  // Need at least 2 messages for variation (context + user message to vary)
  if (messages.length < 2) {
    // Fall back to few_shot for single-turn
    return [];
  }
  
  // Split into context and last user message
  const lastUserIndex = findLastUserMessageIndex(messages);
  if (lastUserIndex === -1) {
    return [];
  }
  
  const contextMessages = messages.slice(0, lastUserIndex);
  const lastUserMessage = messages[lastUserIndex];
  
  // Build prompt for variation
  const prompt = `You are generating training data variations.

Original conversation context:
${JSON.stringify(contextMessages, null, 2)}

Last user message to vary:
"${lastUserMessage.content}"

Generate ${config.variationsPerRecord} alternative user messages that:
1. Make sense given the conversation context above
2. Are realistic things a user might say at this point
3. ${config.preserveIntent ? 'Stay within the same general intent/topic' : 'Can explore different but related intents'}
4. Are meaningfully different from each other (not just rephrased)
5. Are specific and actionable

IMPORTANT:
- Output ONLY a JSON array of strings (the new user messages)
- Each string is a complete user message
- Do NOT include any explanation or markdown

Output format:
["alternative message 1", "alternative message 2", ...]`;

  const response = await llmComplete(prompt, { 
    responseFormat: 'json',
    temperature: config.temperature,
  });
  
  const variations: string[] = JSON.parse(response);
  
  // Create new records from variations
  return variations.map((newContent, i) => {
    const newMessages = [
      ...contextMessages,
      { role: 'user' as const, content: newContent }
    ];
    
    return {
      id: `var_${record.id}_${Date.now()}_${i}`,
      datasetId,
      data: {
        input: { 
          messages: newMessages,
          tools: dataInfo.input?.tools,  // Preserve tools if any
          tool_choice: dataInfo.input?.tool_choice,
        },
        output: {},
      } as DataInfo,
      metadata: {
        generatedAt: new Date().toISOString(),
        generationStrategy: 'message_variation',
        sourceRecordId: record.id,
        variationIndex: i,
      },
      topic: record.topic,
      is_generated: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
}

function findLastUserMessageIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i;
    }
  }
  return -1;
}

// Updated generateForTopic to handle message_variation
async function generateForTopicWithVariation(
  topic: string,
  plan: TopicGenerationPlan,
  allRecords: DatasetRecord[],
  datasetId: string,
  config: GenerationConfig
): Promise<{
  records: DatasetRecord[];
  stats: GenerationResult;
}> {
  // Get multi-turn records from this topic
  const topicRecords = allRecords.filter(r => 
    r.topic === topic && 
    ((r.data as DataInfo).input?.messages?.length || 0) >= 2
  );
  
  if (topicRecords.length === 0) {
    // No multi-turn records, can't use message_variation
    return {
      records: [],
      stats: {
        topic,
        requested: plan.toGenerate,
        generated: 0,
        valid: 0,
        rejected: 0,
        rejectionReasons: { 'no_multi_turn_records': plan.toGenerate },
        passRate: '0%',
      },
    };
  }
  
  const validRecords: DatasetRecord[] = [];
  const rejectionReasons: Record<string, number> = {};
  let totalGenerated = 0;
  
  // Select records to vary
  const recordsToVary = selectDiverseExamples(topicRecords, 
    Math.ceil(plan.toGenerate / config.variationsPerRecord)
  );
  
  for (const record of recordsToVary) {
    if (validRecords.length >= plan.toGenerate) break;
    
    try {
      const variations = await generateMessageVariations(record, config, datasetId);
      totalGenerated += variations.length;
      
      for (const varRecord of variations) {
        if (validRecords.length >= plan.toGenerate) break;
        
        const validation = validateSyntheticRecord(varRecord, allRecords, validRecords, config);
        
        if (validation.valid) {
          validRecords.push(varRecord);
        } else {
          const reason = validation.error || 'unknown';
          rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        }
      }
    } catch (error) {
      rejectionReasons['generation_error'] = (rejectionReasons['generation_error'] || 0) + 1;
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
      passRate: totalGenerated > 0 
        ? `${((validRecords.length / totalGenerated) * 100).toFixed(1)}%`
        : '0%',
    },
  };
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
  otherSynthetic: DatasetRecord[],
  config: GenerationConfig
): SyntheticValidationResult {
  const dataInfo = record.data as DataInfo;
  
  // 1. Basic structure validation
  const messages = dataInfo.input?.messages;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: 'invalid_structure' };
  }
  
  // 2. Must have at least one user message
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) {
    return { valid: false, error: 'no_user_message' };
  }
  
  // 3. Check for LLM artifacts
  const content = extractUserContent(record);
  const artifacts = [
    'I cannot', "I'm sorry", 'As an AI', 'I am an AI',
    '[INSERT]', '[PLACEHOLDER]', 'TODO', '{{', '}}',
    'undefined', 'null', 'NaN'
  ];
  for (const artifact of artifacts) {
    if (content.toLowerCase().includes(artifact.toLowerCase())) {
      return { valid: false, error: 'llm_artifact' };
    }
  }
  
  // 4. Length checks
  if (content.length < config.minLength) {
    return { valid: false, error: 'too_short' };
  }
  if (content.length > config.maxLength) {
    return { valid: false, error: 'too_long' };
  }
  
  // 5. Check for duplicates against seed data
  const contentHash = hashContent(content);
  const seedHashes = new Set(seedRecords.map(r => hashContent(extractUserContent(r))));
  if (seedHashes.has(contentHash)) {
    return { valid: false, error: 'duplicate_of_seed' };
  }
  
  // 6. Check for duplicates against other synthetic
  const syntheticHashes = new Set(otherSynthetic.map(r => hashContent(extractUserContent(r))));
  if (syntheticHashes.has(contentHash)) {
    return { valid: false, error: 'duplicate_synthetic' };
  }
  
  // 7. Semantic similarity check (if strict validation)
  if (config.validationStrictness === 'high') {
    // In production: use embeddings to check similarity
    // Reject if too similar to existing records
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

function extractUserContent(record: DatasetRecord): string {
  const dataInfo = record.data as DataInfo;
  const messages = dataInfo.input?.messages || [];
  
  // Concatenate all user message content
  return messages
    .filter(m => m.role === 'user')
    .map(m => m.content || '')
    .join(' ')
    .trim();
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
