/**
 * EmptyDatasetsState
 *
 * Empty state component displayed when no datasets exist in IndexedDB.
 * Shows a waiting state for gateway traces and provides import options.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileJson, Radio, BookOpen, Copy, Check } from "lucide-react";
import { IngestDataDialog } from "./IngestDataDialog";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";

export function EmptyDatasetsState() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { importRecords, createDataset } = DatasetsConsumer();

  const handleCopyApiKey = async () => {
    // TODO: Get actual API key from settings
    await navigator.clipboard.writeText("your-api-key-here");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      {/* Import button - top right */}
      <div className="absolute top-4 right-4">
        <Button
          variant="outline"
          onClick={() => setImportDialogOpen(true)}
          className="gap-2"
        >
          <FileJson className="h-4 w-4" />
          Import .jsonl dataset
        </Button>
      </div>

      {/* Main content */}
      <div className="flex flex-col items-center max-w-lg text-center">
        <h1 className="text-4xl font-bold mb-8">No traces found yet.</h1>

        {/* Waiting card */}
        <div className="w-full bg-card border border-border rounded-lg p-6 mb-6 flex items-center justify-between">
          <div className="text-left">
            <p className="text-muted-foreground">
              Waiting for traces from your LLM Gateway...
            </p>
            <div className="flex gap-1 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
          <div className="h-12 w-12 rounded-full border-2 border-emerald-500/30 flex items-center justify-center">
            <Radio className="h-5 w-5 text-emerald-500" />
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground mb-8">
          Send your first chat completion request through our gateway to start building
          your optimization dataset. The platform is listening for incoming logs.
        </p>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <BookOpen className="h-4 w-4" />
            View Setup Guide
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleCopyApiKey}>
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied!" : "Copy API Key"}
          </Button>
        </div>
      </div>

      {/* Import dialog */}
      <IngestDataDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        datasets={[]}
        onImportToDataset={async (result) => {
          if (result.target === "new" && result.newDatasetName) {
            const dataset = await createDataset(result.newDatasetName);
            await importRecords(dataset.id, result.records, result.defaultTopic);
          }
          setImportDialogOpen(false);
        }}
      />
    </div>
  );
}
