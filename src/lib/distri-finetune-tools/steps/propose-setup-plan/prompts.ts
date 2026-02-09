/**
 * Prompts and schemas for plan generation LLM calls
 */

export const PLAN_GENERATION_SYSTEM = `You are an expert at designing fine-tuning workflows for LLMs.
Your task is to create a comprehensive setup plan based on the training objective and available knowledge sources.

Rules:
- Create a balanced topic hierarchy based on the objective and knowledge
- CRITICAL: Topic names MUST be SHORT and CONCISE (2-4 words max, like "FEN Analysis", "Opening Theory", "Tactical Patterns")
- Put detailed explanations in the description field, NOT in the name
- Topics should be specific enough to generate focused training data
- Aim for 4-8 top-level topics with 2-4 subtopics each where appropriate
- IMPORTANT: Each top-level topic should have target_count of 30-50 examples minimum
- IMPORTANT: Each subtopic should have target_count of 15-25 examples minimum
- High-quality fine-tuning requires substantial training data (100+ examples total)
- Grader criteria should be specific to the domain
- Be realistic about what can be achieved with the available knowledge
- Output MUST be valid JSON matching the schema`;

export const PLAN_GENERATION_USER = `Create a setup plan for fine-tuning a model.

Training Objective:
{{objective}}

{{knowledge_section}}

Create a comprehensive plan including:
1. Topic hierarchy (organized categories for training data)
2. Data generation strategy (how many examples per topic)
3. Evaluation criteria (how to grade model responses)

IMPORTANT: Each topic should have at least 30-50 examples. Subtopics should have at least 15-25 examples each.
High-quality fine-tuning requires substantial training data.

Target seed count: {{seed_count}} initial examples

Output Format:
{
  "proposed_topics": [
    {
      "name": "Short Name",
      "description": "Detailed description of what this topic covers and what kind of training examples it includes",
      "target_count": 40,
      "subtopics": [
        {
          "name": "Brief Label",
          "description": "Detailed subtopic description",
          "target_count": 20
        }
      ]
    }
  ],
  "grader_criteria": [
    {
      "name": "Criterion Name",
      "description": "What this evaluates",
      "weight": 0.3
    }
  ],
  "strategy_notes": "Brief explanation of the approach"
}

Example topic names (2-4 words): "FEN Analysis", "Move Selection", "Opening Theory", "Tactical Patterns", "Endgame Techniques", "Beginner Level", "Advanced Concepts"`;

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
              weight: { type: 'number' },
            },
            required: ['name', 'description', 'weight'],
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
