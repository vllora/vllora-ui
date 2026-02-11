/**
 * Prompts and schemas for plan generation LLM calls
 */

export const PLAN_GENERATION_SYSTEM = `You are an expert at designing fine-tuning workflows for LLMs.
Your task is to create a setup plan based on the training objective and available knowledge sources.

## STRUCTURED OUTPUT DETECTION

Determine whether the objective requires the model to produce structured output (JSON).

**Structured output applies when** the objective involves:
- Extracting fields from documents (invoices, resumes, contracts)
- Classification with structured results (categories, labels, scores)
- Analysis with specific output format (sentiment, entities, summaries)
- Any task where the user expects JSON or a specific schema

**If structured output is needed**, generate:
1. **output_schema**: A JSON schema (as a JSON string) describing the output the model should produce.
   - Include all fields based on the objective and any sample documents
   - Use appropriate types (string, number, array, etc.)
   - Example: {"type":"object","properties":{"company_name":{"type":"string"},"total_tax":{"type":"number"},"line_items":{"type":"array","items":{"type":"object","properties":{"description":{"type":"string"},"amount":{"type":"number"}}}}}}

2. **system_prompt_template**: A fixed system prompt that will be used for ALL training records.
   - Must instruct the model to return valid JSON matching the schema
   - Must embed or reference the output schema
   - Example: "You are a document processing assistant. Analyze the input and return structured JSON matching this schema: {schema}. Return ONLY valid JSON, no other text."

**If no structured output is needed** (free-form conversational):
- Set output_schema to "" (empty string)
- Set system_prompt_template to "" (empty string)

## TOPIC GENERATION RULES

**IF knowledge sources ARE provided:**
- **ALWAYS** base your topics on the ACTUAL CONTENT from the documents
- Use the extracted topics and document sections as your primary guide
- DO NOT generate generic topics - they must reflect what's in the documents
- Match the terminology, concepts, and sections found in the documents

**IF NO knowledge sources are provided:**
- Generate topics based on the training objective
- Create practical, actionable topic categories that support the training goal
- Topics should cover the key aspects of what the model needs to learn

## STRUCTURE REQUIREMENTS

1. **DEFAULT STRUCTURE: 2-LEVEL HIERARCHY WITH 5 LEAF TOPICS**
   - Create 2-3 parent categories (target_count = 0)
   - Distribute exactly 5 leaf subtopics across parents
   - Each leaf subtopic gets target_count = 30 (default)
   - Total: 5 leaf topics × 30 records = 150 records

2. **TOPIC NAMING**
   - Names MUST be SHORT: 2-4 words max
   - Put details in description field, NOT in name

3. **STRUCTURE RULES**
   - Parent topics: target_count = 0 (records go to children)
   - Leaf subtopics: target_count = 30 each
   - Total leaf count: exactly 5

4. **OUTPUT**
   - Valid JSON matching the schema
   - Grader criteria specific to the domain`;

export const PLAN_GENERATION_USER = `Create a setup plan for fine-tuning a model.

Training Objective:
{{objective}}

{{knowledge_section}}

## STRUCTURE REQUIREMENTS (FOLLOW EXACTLY)

1. Create exactly 5 LEAF topics (where records are assigned)
2. Organize in 2-LEVEL hierarchy: 2-3 parent categories with subtopics
3. Parent categories: target_count = 0
4. Each leaf subtopic: target_count = 30
5. Total: 5 leaves × 30 = 150 records

Output JSON:
{
  "output_schema": "JSON-stringified schema if structured output needed, or empty string",
  "system_prompt_template": "Fixed system prompt if structured output needed, or empty string",
  "proposed_topics": [
    {
      "name": "Category Name",
      "description": "What this category covers",
      "target_count": 0,
      "subtopics": [
        { "name": "Topic Name", "description": "What this topic covers", "target_count": 30 }
      ]
    }
  ],
  "grader_criteria": [
    { "name": "Criterion", "description": "What it evaluates for this specific domain" }
  ],
  "strategy_notes": "Brief approach for generating training data"
}

Remember: EXACTLY 5 leaf subtopics total. Determine if structured output is needed first, then generate the rest.`;

export const PLAN_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'setup_plan',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        output_schema: { type: 'string' },
        system_prompt_template: { type: 'string' },
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
      required: ['output_schema', 'system_prompt_template', 'proposed_topics', 'grader_criteria', 'strategy_notes'],
      additionalProperties: false,
    },
  },
};
