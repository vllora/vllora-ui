/**
 * ApiInitializeTab
 *
 * Tab content for initializing dataset via API.
 * Features curl command on left, live trace feed on right.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LiveTraceFeed, type Trace } from "./LiveTraceFeed";
import { CollapsibleCurlCommand } from "./CollapsibleCurlCommand";
import { inferObjectiveFromTraces } from "./infer-objective";
import * as datasetsDB from "@/services/datasets-db";

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
}

export function ApiInitializeTab({ hasBackendSpans, traces }: ApiInitializeTabProps) {
  const navigate = useNavigate();
  const [datasetObjective, setDatasetObjective] = useState("");
  const [isInferring, setIsInferring] = useState(false);
  const hasAutoInferred = useRef(false);

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

  const [isCreating, setIsCreating] = useState(false);

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
            },
            output: {
              messages: outputMessages.map((m) => ({ role: m.role, content: m.content })),
            },
          },
        };
      });

      // Add records to the dataset
      await datasetsDB.addRecordsToDataset(dataset.id, records);

      toast.success(`Created dataset with ${records.length} records`);
      navigate(`/datasets/${dataset.id}`);
    } catch (error) {
      console.error("Failed to create dataset:", error);
      toast.error("Failed to create dataset");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col gap-4">
      {/* Top Row: Dataset Objective + Live Trace Feed - grows to fill space */}
      <div className="flex-1 flex gap-4 min-h-0 h-[calc(100%-100px)]">
        {/* Left: Dataset Objective */}
        <div className="flex-1 rounded-xl border border-border bg-card/50 backdrop-blur-sm p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between shrink-0">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Dataset Objective
            </label>
            {traces.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleInferObjective}
                disabled={isInferring}
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {isInferring ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                {isInferring ? "Suggesting..." : "Suggest"}
              </Button>
            )}
          </div>
          <Textarea
            value={datasetObjective}
            onChange={(e) => setDatasetObjective(e.target.value)}
            placeholder="Describe what you want the fine-tuned model to do. E.g., 'A chess tutor that explains positions clearly and adapts to the student's level'"
            className="flex-1 min-h-[100px] resize-none bg-background/50"
          />
          <p className="text-xs text-muted-foreground shrink-0">
            This helps guide data generation and evaluation criteria for your fine-tuning workflow.
          </p>

          {/* Start Button - shown when traces exist */}
          {traces.length > 0 && (
            <Button
              onClick={handleStartFinetune}
              disabled={isCreating}
              className="w-full shrink-0 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white gap-2 animate-in fade-in duration-300"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Start Finetune
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>

        {/* Right: Live Trace Feed */}
        <LiveTraceFeed
          isActive={hasBackendSpans}
          traces={traces}
          className="w-80 shrink-0"
        />
      </div>

      {/* Bottom: Collapsible Curl Command */}
      <CollapsibleCurlCommand command={CURL_COMMAND} />
    </div>
  );
}
