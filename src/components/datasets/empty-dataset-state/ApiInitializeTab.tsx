/**
 * ApiInitializeTab
 *
 * Tab content for initializing dataset via API.
 * Features objective input card on left, live trace feed on right.
 * Uses shared ObjectiveInputCard for the input UI.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LiveTraceFeed, type Trace } from "./LiveTraceFeed";
import { CollapsibleCurlCommand } from "./CollapsibleCurlCommand";
import { inferObjectiveFromTraces } from "./infer-objective";
import * as datasetsDB from "@/services/datasets-db";
import { ObjectiveInputCard } from "./ObjectiveInputCard";

export const CHESS_TUTOR_INIT_PART_1= "You are an expert chess tutor helping a student improve their chess skills. Your role is to:"
export const CHESS_TUTOR_INIT_PART_2 = `You are an expert chess tutor helping a student improve their chess skills. Your role is to:

1. ANALYZE positions using the analyze_position tool
2. EVALUATE the student's moves when they make moves
3. EXPLAIN positions in a way appropriate for the student's level
4. SUGGEST candidate moves for the student to consider
5. ENGAGE with questions and conversation about chess

## CRITICAL REQUIREMENTS

### Teaching Style
- Adapt explanations to the student's level (beginner/intermediate/advanced)
- Focus on key strategic and tactical ideas
- Explain WHY moves are good or bad
- Be encouraging but honest about mistakes
- Ask questions to encourage active thinking

### TWO MODES

**MOVE MODE**: When the user makes a valid chess move
- The move has ALREADY been applied to the board
- Analyze the new position
- Evaluate the user's move
- Explain both moves

**CHAT MODE**: When the user asks a question or chats
- DO NOT change the board
- DO NOT make a move (opponent_reply must be null)
- Just respond conversationally about chess
- You can still analyze the current position if relevant

Remember: You are a tutor, not just an engine wrapper. Add pedagogical value through your explanations.`

export const CHESS_TUTOR_SYSTEM_PROMPT = `${CHESS_TUTOR_INIT_PART_1}\n\n${CHESS_TUTOR_INIT_PART_2}`;


const REQUEST_BODY = JSON.stringify({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: CHESS_TUTOR_SYSTEM_PROMPT },
    { role: "user", content: "FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\n\nWhat are the best responses for black?" }
  ]
}, null, 2);

const CURL_COMMAND = `curl http://localhost:9090/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '${REQUEST_BODY.replace(/'/g, "'\\''")}'`;

interface ApiInitializeTabProps {
  hasBackendSpans: boolean;
  traces: Trace[];
  onClear?: () => void;
}

export function ApiInitializeTab({ hasBackendSpans, traces, onClear }: ApiInitializeTabProps) {
  const navigate = useNavigate();
  const [datasetObjective, setDatasetObjective] = useState("");
  const [isInferring, setIsInferring] = useState(false);
  const hasAutoInferred = useRef(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleInferObjective = async () => {
    if (traces.length === 0) return;

    setIsInferring(true);
    try {
      const inferredObjective = await inferObjectiveFromTraces(traces);
      setDatasetObjective(inferredObjective);
    } catch (error) {
      console.error("Failed to infer objective:", error);
    } finally {
      setIsInferring(false);
    }
  };

  // Auto-trigger suggestion when first trace arrives
  useEffect(() => {
    if (traces.length > 0 && !hasAutoInferred.current && !datasetObjective) {
      hasAutoInferred.current = true;
      handleInferObjective();
    }
  }, [traces.length]);

  const handleStartFinetune = async () => {
    if (traces.length === 0) return;

    setIsCreating(true);
    try {
      // Generate dataset name from objective or use default
      const datasetName = datasetObjective.trim()
        ? datasetObjective.trim().slice(0, 50) + (datasetObjective.length > 50 ? "..." : "")
        : `Dataset ${new Date().toLocaleDateString()}`;

      // Create the dataset
      const dataset = await datasetsDB.createDataset(datasetName, datasetObjective.trim() || undefined);

      // Convert traces to records format (DataInfo)
      const records = traces.map((trace) => {
        // Separate input messages (system, user) from output (assistant)
        const inputMessages = trace.messages.filter((m) => m.role !== "assistant");
        const outputMessages = trace.messages.filter((m) => m.role === "assistant");

        return {
          data: {
            input: {
              messages: inputMessages.map((m) => ({ role: m.role, content: m.content })),
              ...(trace.tools ? { tools: trace.tools } : {}),
            },
            output: {
              messages: outputMessages.map((m) => ({ role: m.role, content: m.content })),
            },
          },
        };
      });

      // Add records to the dataset
      await datasetsDB.addRecordsToDataset(dataset.id, records);

      toast.success(`Created experiment with ${records.length} records`);
      navigate(`/datasets/${dataset.id}`);
    } catch (error) {
      console.error("Failed to create dataset:", error);
      toast.error("Failed to create experiment");
    } finally {
      setIsCreating(false);
    }
  };

  const hasContent = datasetObjective.trim().length > 0;

  return (
    <div className="w-full h-full flex-1 flex flex-col gap-4">
      {/* Top Row: Objective Card + Live Trace Feed */}
      <div className="flex-1 flex gap-4 min-h-0 h-[calc(100%-100px)]">
        {/* Left: Objective Card */}
        <ObjectiveInputCard
          value={datasetObjective}
          onChange={setDatasetObjective}
          placeholder="Describe what you want your model to do..."
          fillHeight
          className="flex-1"
          footerExtra={
            traces.length > 0 ? (
              <>
                <div className="w-px h-4 bg-border/30 mx-1" />
                <button
                  type="button"
                  onClick={handleInferObjective}
                  disabled={isInferring}
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
                  title="Auto-suggest objective from traces"
                >
                  {isInferring ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  {isInferring ? "Suggesting..." : "Suggest"}
                </button>
              </>
            ) : undefined
          }
          actionButton={
            traces.length > 0 ? (
              <Button
                onClick={handleStartFinetune}
                disabled={isCreating || (!hasContent && traces.length === 0)}
                className="group/btn bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-400))] text-white gap-2 px-6 h-10 rounded-xl text-[13px] font-semibold shadow-md shadow-[rgba(var(--theme-500),0.25)] hover:shadow-lg hover:shadow-[rgba(var(--theme-500),0.3)] transition-all duration-200 disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Start Finetune
                    <Sparkles className="w-3.5 h-3.5 transition-transform duration-200 group-hover/btn:rotate-12" />
                  </>
                )}
              </Button>
            ) : undefined
          }
        />

        {/* Right: Live Trace Feed */}
        <LiveTraceFeed
          isActive={hasBackendSpans}
          traces={traces}
          onClear={onClear}
          className="w-80 shrink-0"
        />
      </div>

      {/* Bottom: Collapsible Curl Command */}
      <CollapsibleCurlCommand command={CURL_COMMAND} />
    </div>
  );
}
