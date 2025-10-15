import React from "react";
import { SpanDetailsPanel } from "./SpanDetailsPanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";

const TRACE_PANEL_WIDTH = 450;

interface SpanDetailsOverlayProps {
  onClose: () => void;
  onRefresh: () => void;
}

export const SpanDetailsOverlay: React.FC<SpanDetailsOverlayProps> = ({
  onClose,
  onRefresh,
}) => {
  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <div
        className="absolute top-0 right-0 bottom-0 bg-[#0f0f0f] border-l border-border z-50 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col"
        style={{ width: TRACE_PANEL_WIDTH }}
      >
        {/* Span Details Header */}
        <div className="sticky top-0 z-10 flex flex-row items-center px-4 py-3 justify-between w-full bg-[#161616] border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold text-white">Span Details</h2>
          </div>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            title="Refresh span"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        {/* Span Details Content */}
        <div className="flex-1 overflow-hidden">
          <SpanDetailsPanel />
        </div>
      </div>
    </>
  );
};
