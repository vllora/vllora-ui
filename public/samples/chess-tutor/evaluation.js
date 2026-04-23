// LLM-as-a-judge evaluator with detailed metrics
// Updated to provide and log detailed reasoning

function evaluate(input) {

    // 1. Extract the actual response and history from the input
    let response = "";
    let history = "";

    // Check if 'response' field exists directly
    if (input.response && typeof input.response === "string") {
        response = input.response;
        history = input.history || (input.messages ? JSON.stringify(input.messages) : "");
    }
    // Fallback: Extract from 'messages' array
    else if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage.content) {
            response = lastMessage.content;
        }
        // History is everything before the last message
        history = JSON.stringify(input.messages.slice(0, input.messages.length - 1));
    }

    // 2. Guard clause for empty response
    if (!response || response.trim() === "") {
        return {
            score: 0,
            reason: "Model failed to produce a response (empty output or could not be extracted)."
        };
    }

    // 3. Define the LLM-as-judge configuration
    const config = {
        prompt_template: [
            {
                role: "system",
                content: "You are an expert Chess Coach Evaluator. Your job is to assess the quality of an AI Chess Tutor's responses."
            },
            {
                role: "user",
                content: `Conversation History:
{{history}}

Actual Model Response to Evaluate:
{{response}}

Evaluate the response on the following criteria suitable for a chess coaching context:

1. **Chess Accuracy & Safety**: Are the moves suggested legal and sound? Does the analysis make sense for the position (implicitly)? Does it avoid hallucinations or illegal logic?
2. **Pedagogical Quality**: Does the assistant explain *why* a move is good? Is the explanation adapted to the user's level (e.g., beginner vs advanced)? Does it teach a concept?
3. **Tone & Engagement**: Is the assistant encouraging, professional, and engaging? Does use a persona appropriate for a coach (e.g. enthusiastic or wise)?
4. **Clarity**: Is the explanation easy to follow? Are variations presented clearly?

Provide a DETAILED explanation for your evaluation, and then assign scores for each criterion (0-5).

Answer in JSON format:
{
  "reasoning": string (Full detailed explanation),
  "chess_accuracy": number (0-5),
  "pedagogical_quality": number (0-5),
  "tone_engagement": number (0-5),
  "clarity": number (0-5)
}`
            }
        ],
        output_schema: {
            type: "object",
            properties: {
                reasoning: { type: "string" },
                chess_accuracy: { type: "number", minimum: 0, maximum: 5 },
                pedagogical_quality: { type: "number", minimum: 0, maximum: 5 },
                tone_engagement: { type: "number", minimum: 0, maximum: 5 },
                clarity: { type: "number", minimum: 0, maximum: 5 }
            },
            required: ["reasoning", "chess_accuracy", "pedagogical_quality", "tone_engagement", "clarity"],
            additionalProperties: false
        },
        completion_params: {
            model_name: "gpt-4.1",
            temperature: 0.0,
            max_tokens: 1000
        }
    };

    // 4. Call LLM-as-judge
    try {
        // MODIFY INPUT IN-PLACE to ensure compatibility with host constraints
        input.history = history;
        input.response = response;

        const result = __langdb_call_llm_as_judge_obj(config, input);
        console.log("Raw LLM-as-judge result: " + JSON.stringify(result));

        // Check for internal errors from the call
        if (result.error) {
            return {
                score: 0,
                reason: "LLM-as-judge error: " + (result.error || "Unknown error")
            };
        }

        // Initialize variables safely
        const chessAccuracy = typeof result.chess_accuracy === 'number' ? result.chess_accuracy : 0;
        const pedagogy = typeof result.pedagogical_quality === 'number' ? result.pedagogical_quality : 0;
        const tone = typeof result.tone_engagement === 'number' ? result.tone_engagement : 0;
        const clarity = typeof result.clarity === 'number' ? result.clarity : 0;

        // Defensive extraction of reasoning/explanation
        let judgeReasoning = result.reasoning || result.reason || "";

        // If still empty, look for any string property that might be the reasoning (long string)
        if (!judgeReasoning) {
            for (let key in result) {
                if (typeof result[key] === "string" && result[key].length > 50) {
                    judgeReasoning = result[key];
                    break;
                }
            }
        }

        if (!judgeReasoning) judgeReasoning = "No reasoning provided by LLM";

        // Calculate final score as the weighted average of metrics (0-5 range)
        const total = chessAccuracy + pedagogy + tone + clarity;
        const avgScore = total / 4.0;

        // Scale to 0-1 range (from 0-5 range)
        // formula: avg / 5.0
        let finalScore = avgScore / 5.0;

        // Ensure result is a number and within [0, 1]
        if (isNaN(finalScore)) {
            finalScore = 0;
        }
        finalScore = Math.max(0, Math.min(1, finalScore));

        // Format a detailed reason string containing the breakdown
        const scorePrefix = `[Acc:${chessAccuracy}, Pedagogy:${pedagogy}, Tone:${tone}, Clarity:${clarity}]`;
        const detailedReason = `${scorePrefix} ${judgeReasoning}`;

        return {
            score: finalScore,
            reason: detailedReason,
            chess_accuracy: chessAccuracy,
            pedagogical_quality: pedagogy,
            tone_engagement: tone,
            clarity: clarity
        };
    } catch (error) {
        console.log("DEBUG: Exception in evaluate(): " + error.message);
        return {
            score: 0,
            reason: "Error: " + (error.message || "Unknown exception")
        };
    }
}