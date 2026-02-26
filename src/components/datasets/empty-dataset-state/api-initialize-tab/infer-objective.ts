/**
 * Infer dataset objective from captured traces using LLM.
 */

import { getInferObjectiveUrl } from "@/config/api";
import type { Trace } from "./LiveTraceFeed";
import { CHESS_TUTOR_INIT_PART_1 } from "./ApiInitializeTab";

// Predefined objective for the chess tutor example
const CHESS_TUTOR_OBJECTIVE =
  "A chess tutor that analyzes positions, evaluates moves, and explains chess concepts clearly while adapting to the student's skill level. The model should be encouraging but honest about mistakes, and focus on teaching the 'why' behind good and bad moves.";

const INFERENCE_SYSTEM_PROMPT = `You are an expert at analyzing AI agent interactions and identifying their purpose.

Given a set of captured API traces (chat completions with system prompts and user messages), analyze them and infer what the fine-tuned model should do.

Your response should be a concise, actionable objective description (1-3 sentences) that describes:
1. The role/persona of the AI (e.g., "A chess tutor", "A customer support agent")
2. Key behaviors or capabilities it should have
3. Any specific style or approach it should use

Be specific but concise. Focus on the intent and purpose, not technical details.
Respond with ONLY the objective description, no preamble or explanation.`;

export async function inferObjectiveFromTraces(traces: Trace[]): Promise<string> {
  if (traces.length === 0) {
    throw new Error("No traces available to infer objective");
  }

  // Check if first trace has a system message matching the chess tutor example
  const firstTrace = traces[0];
  const systemMessage = firstTrace.messages.find((m) => m.role === "system");
  if (systemMessage?.content.includes(CHESS_TUTOR_INIT_PART_1)) {
    return CHESS_TUTOR_OBJECTIVE;
  }

  // Format traces for the LLM
  const traceSummary = traces
    .map((trace, i) => {
      const messages = trace.messages
        .map((msg) => `  ${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n");
      return `--- Trace ${i + 1} (${trace.time}) ---\n${messages}`;
    })
    .join("\n\n");

  const userPrompt = `Analyze these captured API traces and infer what the fine-tuned model should do:

${traceSummary}

Based on these traces, what is the objective for the fine-tuned model?`;

  const response = await fetch(getInferObjectiveUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-label": "infer_dataset_objective",
    },
    body: JSON.stringify({
      model: "openai/gpt-4.1-mini",
      messages: [
        { role: "system", content: INFERENCE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 256,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to infer objective: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("LLM returned empty response");
  }

  return content.trim();
}
