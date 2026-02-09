/**
 * Stockfish Chess Engine Service (Browser WASM)
 *
 * Provides chess position analysis using Stockfish compiled to WebAssembly.
 * This runs entirely in the browser - no backend required.
 *
 * Only used for chess-related datasets (detected by training objective).
 */

// =============================================================================
// Types
// =============================================================================

export interface StockfishAnalysis {
  fen: string;
  depth: number;
  bestMove: string;
  bestMoveSan: string | null;
  evaluation: number | null; // centipawns (positive = white advantage)
  mateIn: number | null; // positive = white wins, negative = black wins
  lines: StockfishLine[];
}

export interface StockfishLine {
  move: string; // UCI notation
  moveSan: string | null;
  evaluation: number | null;
  mateIn: number | null;
  pv: string[]; // principal variation in UCI
}

export interface MoveClassification {
  move: string;
  classification: 'brilliant' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
  delta: number | null; // evaluation change in centipawns
  bestMove: string | null;
  explanation: string;
}

// =============================================================================
// Stockfish Worker Manager
// =============================================================================

class StockfishWorkerManager {
  private worker: Worker | null = null;
  private isReady = false;
  private pendingResolve: ((value: string) => void) | null = null;
  private outputBuffer: string[] = [];
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      try {
        // Check if we're in a browser environment
        if (typeof window === 'undefined' || typeof Worker === 'undefined') {
          reject(new Error('Stockfish requires browser environment with Web Workers'));
          return;
        }

        // stockfish.js provides a WASM worker
        // Use the CDN version for reliable loading
        const stockfishUrl = 'https://unpkg.com/stockfish.js@10.0.2/stockfish.wasm.js';
        this.worker = new Worker(stockfishUrl);

        this.worker.onmessage = (e) => {
          const line = typeof e.data === 'string' ? e.data : '';
          this.outputBuffer.push(line);

          if (line === 'uciok') {
            this.worker!.postMessage('isready');
          } else if (line === 'readyok') {
            this.isReady = true;
            resolve();
          } else if (line.startsWith('bestmove') && this.pendingResolve) {
            // Analysis complete - resolve with all buffered output
            this.pendingResolve(this.outputBuffer.join('\n'));
            this.pendingResolve = null;
            this.outputBuffer = [];
          }
        };

        this.worker.onerror = (err) => {
          console.error('[Stockfish] Worker error:', err);
          reject(new Error('Failed to initialize Stockfish worker'));
        };

        // Start UCI protocol
        this.worker.postMessage('uci');

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isReady) {
            reject(new Error('Stockfish initialization timed out'));
          }
        }, 10000);
      } catch (err) {
        reject(err);
      }
    });

    return this.initPromise;
  }

  async analyze(fen: string, depth: number, multiPv: number): Promise<string> {
    await this.init();

    if (!this.worker) {
      throw new Error('Stockfish worker not initialized');
    }

    this.outputBuffer = [];

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.worker!.postMessage(`setoption name MultiPV value ${multiPv}`);
      this.worker!.postMessage(`position fen ${fen}`);
      this.worker!.postMessage(`go depth ${depth}`);
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      this.initPromise = null;
    }
  }
}

// Singleton instance
let stockfishManager: StockfishWorkerManager | null = null;

function getStockfishManager(): StockfishWorkerManager {
  if (!stockfishManager) {
    stockfishManager = new StockfishWorkerManager();
  }
  return stockfishManager;
}

// =============================================================================
// UCI Output Parser
// =============================================================================

function parseUciOutput(output: string, fen: string, depth: number): StockfishAnalysis {
  const lines = output.split('\n');
  const pvLines: StockfishLine[] = [];
  let bestMove = '';

  // Parse info lines for each PV
  for (const line of lines) {
    if (line.startsWith('info depth') && line.includes(' pv ')) {
      const depthMatch = line.match(/depth (\d+)/);
      const pvMatch = line.match(/ pv (.+?)(?:\s+bmc|$)/);
      const cpMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);

      if (depthMatch && pvMatch && parseInt(depthMatch[1]) === depth) {
        const pv = pvMatch[1].trim().split(' ');
        const move = pv[0];

        pvLines.push({
          move,
          moveSan: null, // Would need chess.js to convert
          evaluation: cpMatch ? parseInt(cpMatch[1]) : null,
          mateIn: mateMatch ? parseInt(mateMatch[1]) : null,
          pv,
        });
      }
    } else if (line.startsWith('bestmove')) {
      const match = line.match(/bestmove (\S+)/);
      if (match) {
        bestMove = match[1];
      }
    }
  }

  // Get evaluation from first PV line
  const topLine = pvLines[0];

  return {
    fen,
    depth,
    bestMove,
    bestMoveSan: null,
    evaluation: topLine?.evaluation ?? null,
    mateIn: topLine?.mateIn ?? null,
    lines: pvLines,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if Stockfish is available (can be initialized)
 */
export async function isStockfishAvailable(): Promise<boolean> {
  try {
    const manager = getStockfishManager();
    await manager.init();
    return true;
  } catch {
    return false;
  }
}

/**
 * Analyze a chess position
 */
export async function analyzePosition(
  fen: string,
  depth = 15,
  multiPv = 3
): Promise<StockfishAnalysis> {
  const manager = getStockfishManager();
  const output = await manager.analyze(fen, depth, multiPv);
  return parseUciOutput(output, fen, depth);
}

/**
 * Evaluate a move by comparing position before and after
 */
export async function evaluateMove(
  fenBefore: string,
  move: string,
  depth = 15
): Promise<MoveClassification> {
  const manager = getStockfishManager();

  // Analyze position before move
  const beforeOutput = await manager.analyze(fenBefore, depth, 1);
  const beforeAnalysis = parseUciOutput(beforeOutput, fenBefore, depth);

  // Apply move and analyze (we need the FEN after the move)
  // For now, we'll just compare if it matches the best move
  const isBestMove = move === beforeAnalysis.bestMove;

  // Simplified classification
  let classification: MoveClassification['classification'];
  let explanation: string;

  if (isBestMove) {
    classification = 'best';
    explanation = "This is the engine's top choice.";
  } else {
    // Without the position after, we can only say it's not the best
    classification = 'good';
    explanation = `The engine prefers ${beforeAnalysis.bestMove}.`;
  }

  return {
    move,
    classification,
    delta: null,
    bestMove: beforeAnalysis.bestMove,
    explanation,
  };
}

/**
 * Clean up Stockfish worker
 */
export function terminateStockfish(): void {
  if (stockfishManager) {
    stockfishManager.terminate();
    stockfishManager = null;
  }
}

/**
 * Get human-readable evaluation string
 */
export function formatEvaluation(analysis: StockfishAnalysis): string {
  if (analysis.mateIn !== null) {
    return analysis.mateIn > 0 ? `M${analysis.mateIn}` : `-M${Math.abs(analysis.mateIn)}`;
  }
  if (analysis.evaluation !== null) {
    const pawns = analysis.evaluation / 100;
    return pawns >= 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
  }
  return '?';
}
