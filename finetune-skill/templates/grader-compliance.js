/**
 * Compliance / Rule-Application Grader
 *
 * For models that apply multiple rules simultaneously (FDA compliance,
 * tax deductions, legal clause analysis, medical coding).
 * Scores on: rule recall, false positives, citation accuracy, explanation.
 *
 * Customize: RULE_KEYWORDS, MIN_RULES_EXPECTED
 */
function evaluate(input) {
    let response = "";
    let history = "";

    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    } else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) response = lastMessage.content;
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }

    var groundTruth = (input.ground_truth && typeof input.ground_truth === "string") ? input.ground_truth : "";
    input.ground_truth = groundTruth;

    if (!response || response.trim().length < 10) {
        return { score: 0, reason: "Response is empty or too short" };
    }

    // ─── Programmatic Checks ───

    // TODO: Check for citation/reference patterns
    // const hasCitations = /\b(Section|§|Publication|Rule|Article|Clause)\s+\d/i.test(response);
    // if (!hasCitations) {
    //     // Flag but don't zero — might still identify correct rules
    // }

    // TODO: Check minimum number of rules/findings identified
    // const bulletCount = (response.match(/^[-•*]\s/gm) || []).length;
    // if (bulletCount < 2) {
    //     // Likely missed findings
    // }

    // ─── LLM-as-Judge: Rule Application Quality ───

    const systemMsg = (input.messages || []).find(function(m) { return m.role === "system"; });

    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert evaluator assessing how well a model applies regulatory/legal/compliance rules to a given scenario."
            },
            {
                role: "user",
                content: `${systemMsg ? "System context: " + systemMsg.content + "\n\n" : ""}Conversation History:
{{history}}

Model Response to Evaluate:
{{response}}
` + (groundTruth ? `
Source Reference (authoritative rules/guidelines):
{{ground_truth}}
` : "") + `
Rate the response on these criteria (0-5 scale):
1. RULE_RECALL: Did the model identify ALL applicable rules/violations/deductions? (5=found everything, 0=missed most)
2. FALSE_POSITIVES: Did the model cite rules that don't actually apply? (5=no false positives, 0=many wrong rules)
3. CITATION_ACCURACY: Are rule references (section numbers, publication names) correct? (5=all correct, 0=fabricated citations)
4. EXPLANATION: Does the model explain WHY each rule applies in plain language? (5=clear reasoning, 0=just lists rules)
5. COMPLETENESS: Does it cover interactions between rules (e.g., one rule affects another)? (5=considers interactions, 0=treats rules in isolation)

Answer in JSON format:
{
  "reasoning": string,
  "rule_recall": number (0-5),
  "false_positives": number (0-5, higher=better),
  "citation_accuracy": number (0-5),
  "explanation": number (0-5),
  "completeness": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                rule_recall: { type: "number", minimum: 0, maximum: 5 },
                false_positives: { type: "number", minimum: 0, maximum: 5 },
                citation_accuracy: { type: "number", minimum: 0, maximum: 5 },
                explanation: { type: "number", minimum: 0, maximum: 5 },
                completeness: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "rule_recall", "false_positives", "citation_accuracy", "explanation", "completeness"],
            additionalProperties: false
        },
        completion_params: { model_name: "gpt-4.1", temperature: 0.0, max_tokens: 1000 }
    };

    input.history = history;
    input.response = response;

    try {
        const result = __langdb_call_llm_as_judge_obj(config, input);
        if (result.error) {
            return { score: 0, reason: "LLM-as-judge error: " + (result.error || "Unknown") };
        }

        const rr = typeof result.rule_recall === 'number' ? result.rule_recall : 0;
        const fp = typeof result.false_positives === 'number' ? result.false_positives : 0;
        const ca = typeof result.citation_accuracy === 'number' ? result.citation_accuracy : 0;
        const ex = typeof result.explanation === 'number' ? result.explanation : 0;
        const comp = typeof result.completeness === 'number' ? result.completeness : 0;

        // Weight: recall and false positives matter most for compliance
        const weighted = (rr * 0.30) + (fp * 0.25) + (ca * 0.20) + (ex * 0.15) + (comp * 0.10);
        let finalScore = Math.max(0, Math.min(1, weighted / 5.0));
        if (isNaN(finalScore)) finalScore = 0;

        return {
            score: finalScore,
            reason: result.reasoning || "No reasoning",
            rule_recall: rr, false_positives: fp, citation_accuracy: ca,
            explanation: ex, completeness: comp
        };
    } catch (error) {
        return { score: 0, reason: "Error: " + (error.message || "Unknown") };
    }
}
