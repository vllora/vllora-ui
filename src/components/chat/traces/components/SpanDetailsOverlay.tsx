import React from "react";
import { SpanDetailsPanel } from "./SpanDetailsPanel";

const TRACE_PANEL_WIDTH = 450;

interface SpanDetailsOverlayProps {
}

export const SpanDetailsOverlay: React.FC<SpanDetailsOverlayProps> = ({
}) => {
  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
      />

      {/* Sidebar Panel */}
      <div
        className="absolute top-0 right-0 bottom-0 bg-[#0f0f0f] z-50 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col"
        style={{ width: TRACE_PANEL_WIDTH }}
      >
       
        {/* Span Details Content */}
        <div className="flex-1 overflow-hidden">
          <SpanDetailsPanel />
        </div>
      </div>
    </>
  );
};
