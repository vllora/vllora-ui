/**
 * ConnectGatewayCard
 *
 * Card component for connecting to the LLM Gateway.
 * Displays status indicator and links to setup guide.
 */

import { Button } from "@/components/ui/button";
import { Radio, BookOpen, ArrowRight } from "lucide-react";

export function ConnectGatewayCard() {
  return (
    <div className="group relative p-6 rounded-xl border border-[rgba(var(--theme-500),0.3)] bg-gradient-to-b from-[rgba(var(--theme-500),0.06)] to-transparent hover:border-[rgba(var(--theme-500),0.5)] hover:from-[rgba(var(--theme-500),0.1)] transition-all duration-300 cursor-pointer flex flex-col">
      {/* Recommended badge */}
      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white bg-gradient-to-r from-[rgb(var(--theme-500))] to-[rgb(var(--theme-600))] px-3 py-1 rounded-full shadow-sm shadow-[rgba(var(--theme-500),0.3)]">
          Recommended
        </span>
      </div>

      {/* Icon and status indicator row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[rgba(var(--theme-400),0.15)] to-[rgba(var(--theme-600),0.15)] border border-[rgba(var(--theme-500),0.25)] flex items-center justify-center group-hover:scale-105 transition-transform">
          <Radio className="h-6 w-6 text-[rgb(var(--theme-500))]" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))] animate-pulse shadow-sm shadow-[rgba(var(--theme-500),0.5)]" />
            <span className="w-2 h-2 rounded-full bg-[rgba(var(--theme-500),0.5)] animate-pulse [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-[rgba(var(--theme-500),0.3)] animate-pulse [animation-delay:400ms]" />
          </div>
          <span className="text-xs text-muted-foreground">Listening for traces...</span>
        </div>
      </div>

      <h3 className="font-semibold mb-2 text-left text-foreground">Connect LLM Gateway</h3>
      <p className="text-sm text-muted-foreground text-left">
        Auto-capture production conversations as training data
      </p>

      <div className="flex-1" />

      <Button
        size="sm"
        className="w-full gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white transition-all mt-4"
      >
        <BookOpen className="h-4 w-4" />
        View Setup Guide
        <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
      </Button>
    </div>
  );
}
