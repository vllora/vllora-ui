/**
 * Shared objective suggestions for dataset creation
 */

export interface ObjectiveSuggestion {
  summary: string;
  description: string;
}

export const CHESS_TUTOR_OBJECTIVE: ObjectiveSuggestion = {
  summary: "Chess Tutor Assistant",
  description:
    "Train a chess tutor assistant that can analyze board positions from FEN notation, " +
    "suggest optimal moves with clear explanations of the strategic reasoning behind each recommendation, " +
    "teach opening theory, middlegame tactics, and endgame techniques, " +
    "and adapt explanations to the player's skill level from beginner to advanced.",
};

export const OBJECTIVE_SUGGESTIONS: ObjectiveSuggestion[] = [
  CHESS_TUTOR_OBJECTIVE,
  {
    summary: "Financial Report Summarizer",
    description:
      "Train a model to summarize complex financial reports into concise executive summaries for non-technical stakeholders, extracting key metrics, trends, and actionable insights while maintaining accuracy.",
  },
  
  {
    summary: "Code Generation Assistant",
    description:
      "Create a code generation model that writes clean, well-documented Python code following best practices, including proper error handling, type hints, and comprehensive test coverage.",
  },
];
