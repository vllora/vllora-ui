/**
 * vLLora Grader Template
 *
 * This evaluation function scores model responses on quality criteria.
 * Customize the criteria to match your training objective.
 *
 * Available runtime helper:
 *   __langdb_call_llm_as_judge_obj({ prompt, max_tokens }) → { score, reason }
 *
 * Must return: { score: <0-1>, reason: <string> }
 */
async function evaluate(input) {
  const messages = input.messages || [];

  // Extract the last assistant and user messages
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();
  const lastUser = messages.filter(m => m.role === "user").pop();
  const systemMsg = messages.find(m => m.role === "system");

  // Guard: require both user and assistant messages
  if (!lastAssistant || !lastUser) {
    return { score: 0, reason: "Missing required messages (need at least one user and one assistant message)" };
  }

  const response = lastAssistant.content || "";

  // ─── Programmatic Checks (instant fail / bonus) ───

  // Empty or too-short response
  if (response.trim().length < 10) {
    return { score: 0, reason: "Response is empty or too short" };
  }

  // TODO: Add domain-specific hard constraints here
  // Example: check for required format, forbidden content, minimum structure
  // if (response.includes("CONFIDENTIAL")) {
  //   return { score: 0, reason: "Response contains confidential information" };
  // }

  // ─── LLM-as-Judge Evaluation ───

  const result = await __langdb_call_llm_as_judge_obj({
    prompt: `You are evaluating an AI assistant's response quality.

${systemMsg ? `System context: ${systemMsg.content}\n` : ""}
User message: ${lastUser.content}

Assistant response: ${response}

Rate the response on these criteria (0-10 scale):
1. ACCURACY: Is the information correct and relevant?
2. HELPFULNESS: Does it address the user's needs?
3. CLARITY: Is it well-structured and easy to understand?
4. COMPLETENESS: Are all aspects of the question covered?
5. TONE: Is the tone appropriate for the context?

Provide an overall score (0-10) considering all criteria.

Output ONLY valid JSON:
{"score": <0-10>, "reason": "<1-2 sentence explanation>"}`,
    max_tokens: 200,
  });

  // Normalize score from 0-10 to 0-1
  const normalizedScore = Math.max(0, Math.min(1, (result.score || 0) / 10));

  return {
    score: normalizedScore,
    reason: result.reason || "No reason provided",
  };
}
