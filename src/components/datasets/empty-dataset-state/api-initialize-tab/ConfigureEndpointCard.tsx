/**
 * ConfigureEndpointCard
 *
 * Card 1 in the API initialize tab — explains how to proxy
 * existing LLM API calls through the vLLora gateway.
 * Customers keep their existing integration and just swap the base URL.
 * Uses the same glowing border style as ObjectiveInputCard.
 */

import { useState } from "react";
import { ArrowRightLeft, Copy, Check, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { StepBadge } from "./StepBadge";
import { CurlViewerDialog } from "./CurlViewerDialog";

interface ConfigureEndpointCardProps {
  curlCommand: string;
  className?: string;
}

export function ConfigureEndpointCard({
  curlCommand,
  className,
}: ConfigureEndpointCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group/card relative ${className || ""}`}>
      {/* Glow effect behind card (same as ObjectiveInputCard) */}
      <div
        className="absolute -inset-px rounded-2xl transition-opacity duration-500 opacity-0 group-hover/card:opacity-60"
        style={{
          background:
            "linear-gradient(135deg, rgba(var(--theme-500), 0.2), rgba(var(--theme-400), 0.05), rgba(var(--theme-500), 0.15))",
        }}
      />

      <div
        className="relative rounded-2xl border border-border/50 hover:border-border/80 transition-all duration-300 overflow-hidden flex flex-col h-full"
        style={{ background: "hsl(var(--card) / 0.9)" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <StepBadge>1</StepBadge>
              <div>
                <h3 className="text-[13px] font-semibold text-foreground">
                  Proxy Your Requests
                </h3>
                <p className="text-xs text-muted-foreground/60 leading-relaxed mt-0.5">
                  Swap your base URL — we handle the rest.
                </p>
              </div>
            </div>
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground/30 shrink-0 self-start mt-1" />
          </div>
        </div>

        {/* Code area */}
        <div className="flex-1 border-t border-border/30 relative flex flex-col min-h-0">
          {/* Action icons — floating top-right */}
          <div className="absolute top-2 right-3 z-10 flex items-center gap-0.5">
            <CurlViewerDialog curlCommand={curlCommand}>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground/30 hover:text-muted-foreground/70 hover:bg-muted/30 transition-all"
                title="View full request"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </CurlViewerDialog>

            <button
              type="button"
              onClick={handleCopy}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground/30 hover:text-muted-foreground/70 hover:bg-muted/30 transition-all"
              title="Copy curl command"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Curl preview — capped height, overflow hidden with fade */}
          <div className="relative overflow-hidden max-h-[200px]">
            <pre className="px-4 py-3 pr-12 font-mono text-[11px] leading-[1.6] text-muted-foreground/50 whitespace-pre-wrap break-words">
              {curlCommand}
            </pre>

            {/* Bottom fade to hint at more content */}
            <div
              className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to top, hsl(var(--card) / 0.95), transparent)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
