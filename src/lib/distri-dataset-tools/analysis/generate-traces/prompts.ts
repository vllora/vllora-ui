/**
 * Prompt templates for trace generation
 */

export const SIMULATED_PERSONA_BATCH_PROMPT = `Create a JSON list of 10 diverse user personas who would be interested in the following topic.

Topic: {{subtopics}}
Topic Guidance: {{persona_guidance}}

For each persona, provide:
1. A short, catchy name for the persona (e.g., "The Curious Child", "The Skeptical Debater").
2. A 1–2 sentence description of the persona's personality, goals, typical behavior and chatting style.

Make the personas highly varied across dimensions such as:
- Age and life stage (child, teenager, adult, elderly)
- Attitude toward the AI (trusting, skeptical, playful, commanding, fearful, worshipful)
- Communication style (formal, casual, poetic, terse, overly polite, rude)
- Goals or intent (seeking knowledge, entertainment, emotional support, debate, creative collaboration, practical help, testing limits)
- Background or archetype (scientist, artist, detective, conspiracy theorist, etc.)

Output Format:
[
  "Persona Description 1...",
  "Persona Description 2...",
  ...
]

Ensure the list is diverse and creative. Return ONLY the JSON array of strings.`;

export const SIMULATED_USER_PROMPT = `You are a regular user interacting with an AI assistant.
Your goal is to initiate a natural and realistic conversation about a specific topic. Keep it brief and to the point.

Topic context: {{subtopics}}
System Persona the assistant follows: {{system_prompt}}
Your Persona: {{persona}}

Based on the context and topic, write your first message as the user.
Do not provide the assistant's response.
Just write the initial user prompt.`;

export const SIMULATED_TOOL_RESULT_PROMPT = `The AI assistant is trying to help you. It decided to call the tool '{{tool_name}}' with these arguments:
{{tool_arguments}}

Based on the domain context ({{subtopics}}) and the tool's purpose, simulate a realistic and helpful result that this tool would return.
The result should be concise and formatted as it would appear in a real system (e.g., JSON, a status message, or data output).
Your simulated result will be shown to the assistant so it can continue the task.
Just provide the simulated output.`;

export const SIMULATED_USER_SYSTEM_PROMPT = `You are a user interacting with an AI assistant.

Your Persona:
{{persona}}

Topic Context:
{{subtopics}}

Your Goal:
{{instructions}}

Instructions:
- The conversation history is provided using <user_prompt> and <assistant_response> tags.
- Provide the next message as the user based on the conversation history, strictly in plain text and without any tags.
- Keep it concise and natural, within 1-3 sentences.
- If the assistant asks for information, provide it consistent with your persona.
- If the task is effectively complete or the conversation has reached a natural conclusion, respond with [END].
- Do not repeat previous messages verbatim.`;

export const ASSISTANT_RESPONSE_INSTRUCTIONS = `You are continuing a multi-turn conversation as the assistant.

Return a JSON object with exactly:
{
  "content": "...",
  "tool_calls": [
    {
      "id": "unique_id",
      "type": "function",
      "function": {
        "name": "tool_name",
        "arguments": "{\\"arg\\": \\"value\\"}"
      }
    }
  ]
}

Rules:
- If no tool is needed, set tool_calls to null.
- tool_calls may ONLY reference the available tools.
- Tool arguments must be valid JSON and include required fields.
- Never output "records", "metadata", or any extra keys.
- Keep the assistant content concise and helpful.`;

export const ASSISTANT_TURN_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'assistant_turn',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        tool_calls: {
          anyOf: [
            { type: 'null' },
            {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', enum: ['function'] },
                  function: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      arguments: { type: 'string' },
                    },
                    required: ['name', 'arguments'],
                    additionalProperties: false,
                  },
                },
                required: ['id', 'type', 'function'],
                additionalProperties: false,
              },
            },
          ],
        },
      },
      required: ['content', 'tool_calls'],
      additionalProperties: false,
    },
  },
};

// RFT Mode: Prompt for generating varied user messages based on persona
export const RFT_USER_VARIATION_PROMPT = `You are generating a varied version of a user message for training data.

Original User Message:
{{original_message}}

Topic Context: {{subtopics}}
Persona: {{persona}}

Generate a new user message that:
1. Conveys the same core intent/request as the original
2. Uses language and tone consistent with the persona
3. May rephrase, add context, or adjust complexity based on the persona
4. Should feel natural and realistic

Output only the varied user message, nothing else.`;
