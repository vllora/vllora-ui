/**
 * ApiInitializeTab
 *
 * Tab content for initializing dataset via API.
 * Two-row layout:
 *   Row 1 — [ConfigureEndpointCard]  [LiveTracesCard]  (side by side)
 *   Row 2 — [ObjectiveInputCard]                        (full width)
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfigureEndpointCard } from "./ConfigureEndpointCard";
import { LiveTracesCard } from "./LiveTracesCard";
import type { Trace } from "./LiveTraceFeed";
import { inferObjectiveFromTraces } from "./infer-objective";
import * as datasetsDB from "@/services/datasets-db";
import { ObjectiveInputCard } from "../ObjectiveInputCard";
import { StartFinetuneButton } from "../StartFinetuneButton";

/* ── Exports used by tests / other components ──────────────────── */

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
  traces: Trace[];
  onClear?: () => void;
}

export function ApiInitializeTab({ traces, onClear }: ApiInitializeTabProps) {
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
    const hasObjective = datasetObjective.trim().length > 0;
    if (!hasObjective && traces.length === 0) return;

    setIsCreating(true);
    try {
      const datasetName = hasObjective
        ? datasetObjective.trim().slice(0, 50) + (datasetObjective.length > 50 ? "..." : "")
        : `Dataset ${new Date().toLocaleDateString()}`;

      const dataset = await datasetsDB.createDataset(datasetName, datasetObjective.trim() || undefined);

      // If traces exist, add them as seed records
      if (traces.length > 0) {
        const records = traces.map((trace) => {
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

        await datasetsDB.addRecordsToDataset(dataset.id, records);
        toast.success(`Created experiment with ${records.length} records`);
      } else {
        toast.success("Created experiment");
      }

      navigate(`/finetune/${dataset.id}`);
    } catch (error) {
      console.error("Failed to create dataset:", error);
      toast.error("Failed to create experiment");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Row 1: Configure Endpoint + Live Traces side by side */}
      <div className="grid grid-cols-2 gap-4">
        <ConfigureEndpointCard
          curlCommand={CURL_COMMAND}
        />
        <LiveTracesCard
          traces={traces}
          onClear={onClear}
        />
      </div>

      {/* Row 2: Objective Input — spans full width */}
      <ObjectiveInputCard
        value={datasetObjective}
        onChange={setDatasetObjective}
        placeholder="What should your finetuned model do? e.g., Summarize customer support tickets into actionable items"
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
          <StartFinetuneButton
            onClick={handleStartFinetune}
            disabled={!datasetObjective.trim() && traces.length === 0}
            isLoading={isCreating}
          />
        }
      />
    </div>
  );
}
