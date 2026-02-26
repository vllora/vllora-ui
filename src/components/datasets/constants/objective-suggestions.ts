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
    "Train a chess tutor assistant that analyzes board positions from FEN notation " +
    "and suggests optimal moves with clear strategic reasoning. " +
    "It should teach opening theory, middlegame tactics, and endgame techniques, " +
    "adapting explanations to the player's skill level from beginner to advanced.",
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
      "Create a code generation model that writes clean, well-documented Python code with proper error handling, type hints, and comprehensive test coverage.",
  },
];
