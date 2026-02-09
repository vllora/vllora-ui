/**
 * Stockfish Analysis Tools for Data Generation
 *
 * Provides chess position analysis tools for Lucy to use during data generation.
 * These tools help ensure generated chess training data is accurate.
 *
 * IMPORTANT: These tools are ONLY available when the dataset training objective
 * contains chess-related keywords (e.g., "chess", "opening", "endgame", "tactics").
 */

import type { DistriFnTool } from '@distri/core';
import type { ToolHandler } from '../types';
import {
  analyzePosition,
  evaluateMove,
  formatEvaluation,
  isStockfishAvailable,
} from './stockfish-service';

// =============================================================================
// Chess Detection
// =============================================================================

const CHESS_KEYWORDS = [
  'chess',
  'opening',
  'endgame',
  'middlegame',
  'tactics',
  'strategy',
  'checkmate',
  'castling',
  'fen',
  'pgn',
  'elo',
  'grandmaster',
  'bishop',
  'knight',
  'rook',
  'queen',
  'pawn',
  'stockfish',
];

/**
 * Check if a dataset is chess-related based on its training objective
 */
export function isChessDataset(trainingObjective?: string): boolean {
  if (!trainingObjective) return false;
  const lower = trainingObjective.toLowerCase();
  return CHESS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

// =============================================================================
// Tool Handlers
// =============================================================================

interface AnalyzePositionParams {
  fen: string;
  depth?: number;
  multi_pv?: number;
}

interface AnalyzePositionResult {
  success: boolean;
  fen?: string;
  best_move?: string;
  evaluation?: string;
  evaluation_centipawns?: number | null;
  mate_in?: number | null;
  top_moves?: Array<{
    move: string;
    evaluation: string;
    pv: string[];
  }>;
  error?: string;
}

export const analyzeChessPositionHandler: ToolHandler = async (
  params
): Promise<AnalyzePositionResult> => {
  const { fen, depth = 15, multi_pv = 3 } = params as unknown as AnalyzePositionParams;

  if (!fen) {
    return { success: false, error: 'fen is required' };
  }

  // Validate FEN format (basic check)
  if (!fen.includes(' ') || fen.split(' ').length < 4) {
    return { success: false, error: 'Invalid FEN format' };
  }

  try {
    // Check if Stockfish is available
    const available = await isStockfishAvailable();
    if (!available) {
      return {
        success: false,
        error: 'Stockfish engine not available in this environment',
      };
    }

    const analysis = await analyzePosition(fen, depth, multi_pv);

    return {
      success: true,
      fen: analysis.fen,
      best_move: analysis.bestMove,
      evaluation: formatEvaluation(analysis),
      evaluation_centipawns: analysis.evaluation,
      mate_in: analysis.mateIn,
      top_moves: analysis.lines.map((line) => ({
        move: line.move,
        evaluation:
          line.mateIn !== null
            ? line.mateIn > 0
              ? `M${line.mateIn}`
              : `-M${Math.abs(line.mateIn)}`
            : line.evaluation !== null
            ? `${(line.evaluation / 100).toFixed(2)}`
            : '?',
        pv: line.pv,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
};

interface EvaluateMoveParams {
  fen_before: string;
  move: string;
  depth?: number;
}

interface EvaluateMoveResult {
  success: boolean;
  move?: string;
  classification?: string;
  best_move?: string;
  explanation?: string;
  error?: string;
}

export const classifyChessMoveHandler: ToolHandler = async (
  params
): Promise<EvaluateMoveResult> => {
  const { fen_before, move, depth = 15 } = params as unknown as EvaluateMoveParams;

  if (!fen_before || !move) {
    return { success: false, error: 'fen_before and move are required' };
  }

  try {
    const available = await isStockfishAvailable();
    if (!available) {
      return {
        success: false,
        error: 'Stockfish engine not available in this environment',
      };
    }

    const result = await evaluateMove(fen_before, move, depth);

    return {
      success: true,
      move: result.move,
      classification: result.classification,
      best_move: result.bestMove || undefined,
      explanation: result.explanation,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Evaluation failed',
    };
  }
};

// =============================================================================
// Tool Definitions
// =============================================================================

export const analyzeChessPositionTool: DistriFnTool = {
  name: 'analyze_chess_position',
  description: `Analyze a chess position using the Stockfish engine.

Returns the best move, position evaluation, and top alternative moves.

PURPOSE: Use this for DATA GENERATION to create accurate training prompts with:
- Valid FEN positions with real engine analysis
- Accurate best moves and evaluations in prompts
- Realistic chess scenarios based on engine insights

NOTE: This is for creating training data PROMPTS, not for grading model outputs.

The evaluation is in centipawns (100cp = 1 pawn advantage).
Positive values favor White, negative favor Black.
"M5" means checkmate in 5 moves.

Example FEN: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      fen: {
        type: 'string',
        description: 'Chess position in FEN notation',
      },
      depth: {
        type: 'number',
        description: 'Analysis depth (default: 15, range: 1-25). Higher = more accurate but slower.',
      },
      multi_pv: {
        type: 'number',
        description: 'Number of top moves to return (default: 3, max: 5)',
      },
    },
    required: ['fen'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await analyzeChessPositionHandler(input as Record<string, unknown>)),
} as DistriFnTool;

export const classifyChessMoveTool: DistriFnTool = {
  name: 'classify_chess_move',
  description: `Classify a chess move's quality using Stockfish analysis.

Compares the played move against the engine's best move and classifies it as:
- brilliant: Exceptional move that creates winning chances
- best: The engine's top choice
- excellent: Very strong move
- good: Solid move
- inaccuracy: Slightly imprecise
- mistake: Loses material or positional advantage
- blunder: Serious error

PURPOSE: Use this for DATA GENERATION to create training prompts that include:
- Realistic move quality scenarios
- Engine-backed move classifications in prompts
- Accurate context for "was this a good move?" type questions

NOTE: This is for creating training data PROMPTS, not for grading model outputs.`,
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      fen_before: {
        type: 'string',
        description: 'Position BEFORE the move in FEN notation',
      },
      move: {
        type: 'string',
        description: 'Move to evaluate in UCI notation (e.g., "e2e4", "g1f3")',
      },
      depth: {
        type: 'number',
        description: 'Analysis depth (default: 15)',
      },
    },
    required: ['fen_before', 'move'],
  },
  autoExecute: true,
  handler: async (input) =>
    JSON.stringify(await classifyChessMoveHandler(input as Record<string, unknown>)),
} as DistriFnTool;

// =============================================================================
// Exports
// =============================================================================

/** All Stockfish tools - only add to agent when dataset is chess-related */
export const stockfishTools: DistriFnTool[] = [
  analyzeChessPositionTool,
  classifyChessMoveTool,
];

export const stockfishToolHandlers: Record<string, ToolHandler> = {
  analyze_chess_position: analyzeChessPositionHandler,
  classify_chess_move: classifyChessMoveHandler,
};

export const STOCKFISH_TOOL_NAMES = [
  'analyze_chess_position',
  'classify_chess_move',
] as const;

export type StockfishToolName = (typeof STOCKFISH_TOOL_NAMES)[number];
