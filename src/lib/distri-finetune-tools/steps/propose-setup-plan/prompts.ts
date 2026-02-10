/**
 * Prompts and schemas for plan generation LLM calls
 */

export const PLAN_GENERATION_SYSTEM = `You are an expert at designing fine-tuning workflows for LLMs.
Your task is to create a setup plan based on the training objective and available knowledge sources.

## ABSOLUTE REQUIREMENTS

1. **DEFAULT STRUCTURE: 2-LEVEL HIERARCHY WITH 5 LEAF TOPICS**
   - Create 2-3 parent categories (target_count = 0)
   - Distribute exactly 5 leaf subtopics across parents
   - Each leaf subtopic gets target_count = 30 (default)
   - Total: 5 leaf topics × 30 records = 150 records

2. **TOPIC NAMING**
   - Names MUST be SHORT: 2-4 words max
   - Examples: "FEN Analysis", "Opening Theory", "Tactical Patterns"
   - Put details in description field, NOT in name

3. **STRUCTURE RULES**
   - Parent topics: target_count = 0 (records go to children)
   - Leaf subtopics: target_count = 30 each
   - Total leaf count: exactly 5

4. **OUTPUT**
   - Valid JSON matching the schema
   - Grader criteria specific to the domain

Example output structure for chess tutoring:
- Category: "Game Analysis" (target_count: 0)
  - Subtopic: "Opening Moves" (target_count: 30)
  - Subtopic: "Midgame Strategy" (target_count: 30)
- Category: "Tactical Skills" (target_count: 0)
  - Subtopic: "Basic Tactics" (target_count: 30)
  - Subtopic: "Advanced Patterns" (target_count: 30)
  - Subtopic: "Endgame Techniques" (target_count: 30)
Total: 5 leaf topics, 150 records`;

export const PLAN_GENERATION_USER = `Create a setup plan for fine-tuning a model.

Training Objective:
{{objective}}

{{knowledge_section}}

## REQUIREMENTS (FOLLOW EXACTLY)

1. Create exactly 5 LEAF topics (where records are assigned)
2. Organize in 2-LEVEL hierarchy: 2-3 parent categories with subtopics
3. Parent categories: target_count = 0
4. Each leaf subtopic: target_count = 30
5. Total: 5 leaves × 30 = 150 records

Output JSON:
{
  "proposed_topics": [
    {
      "name": "Category Name",
      "description": "What this category covers",
      "target_count": 0,
      "subtopics": [
        { "name": "Leaf Topic", "description": "Details", "target_count": 30 }
      ]
    }
  ],
  "grader_criteria": [
    { "name": "Criterion", "description": "What it evaluates" }
  ],
  "strategy_notes": "Brief approach"
}

Remember: EXACTLY 5 leaf subtopics total, each with target_count: 30.`;

export const PLAN_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'setup_plan',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        proposed_topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              target_count: { type: 'number' },
              subtopics: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    target_count: { type: 'number' },
                  },
                  required: ['name', 'description', 'target_count'],
                  additionalProperties: false,
                },
              },
            },
            required: ['name', 'description', 'target_count', 'subtopics'],
            additionalProperties: false,
          },
        },
        grader_criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name', 'description'],
            additionalProperties: false,
          },
        },
        strategy_notes: { type: 'string' },
      },
      required: ['proposed_topics', 'grader_criteria', 'strategy_notes'],
      additionalProperties: false,
    },
  },
};
