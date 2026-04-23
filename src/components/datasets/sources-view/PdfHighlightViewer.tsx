/**
 * PdfHighlightViewer
 *
 * Renders a PDF page using pdfjs-dist with highlight overlays for the
 * selected part's bounding boxes. Supports docling's BOTTOMLEFT coordinate
 * system and maps to canvas pixel coordinates.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeSourcePart } from "@/types/knowledge-types";
import { extractPageRange } from "@/utils/knowledge-utils";

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// =============================================================================
// Types
// =============================================================================

interface BboxEntry {
  readonly page: number;
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
  readonly coord_origin?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function extractBboxes(part: KnowledgeSourcePart): readonly BboxEntry[] {
  const meta = part.extractionMetadata as Record<string, unknown> | undefined;
  if (!meta) return [];
  const bboxes = meta.bboxes;
  if (!Array.isArray(bboxes)) return [];
  return bboxes as BboxEntry[];
}

function getPartPage(part: KnowledgeSourcePart): number | null {
  const meta = part.extractionMetadata as Record<string, unknown> | undefined;
  if (!meta) return null;
  const pages = meta.pages;
  if (Array.isArray(pages) && pages.length > 0 && typeof pages[0] === "number") return pages[0];
  if (typeof meta.pageStart === "number") return meta.pageStart;
  return null;
}

// =============================================================================
// Component
// =============================================================================

interface PdfHighlightViewerProps {
  readonly fileUrl: string;
  readonly part: KnowledgeSourcePart;
  readonly onBack: () => void;
}

export function PdfHighlightViewer({ fileUrl, part, onBack }: PdfHighlightViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageRange = extractPageRange(part);
  const bboxes = extractBboxes(part);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    pdfjsLib.getDocument(fileUrl).promise.then(
      (pdf) => {
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);

        // Navigate to the part's page
        const partPage = getPartPage(part);
        if (partPage && partPage >= 1 && partPage <= pdf.numPages) {
          setCurrentPage(partPage);
        }
        setIsLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setError(`Failed to load PDF: ${err.message}`);
        setIsLoading(false);
      },
    );

    return () => { cancelled = true; };
  }, [fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to part's page when part changes
  useEffect(() => {
    const partPage = getPartPage(part);
    if (partPage && pdfDocRef.current && partPage >= 1 && partPage <= numPages) {
      setCurrentPage(partPage);
    }
  }, [part, numPages]);

  // Render page + highlight overlay
  useEffect(() => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!pdf || !canvas || !overlay || currentPage < 1) return;

    let cancelled = false;

    pdf.getPage(currentPage).then((page) => {
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      overlay.width = viewport.width;
      overlay.height = viewport.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Render PDF page (pdfjs-dist v5 requires `canvas` in RenderParameters)
      page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<typeof page.render>[0]).promise.then(() => {
        if (cancelled) return;

        // Draw highlight overlay
        const overlayCtx = overlay.getContext("2d");
        if (!overlayCtx) return;

        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

        // Filter bboxes for current page
        const pageBboxes = bboxes.filter((b) => b.page === currentPage);
        if (pageBboxes.length === 0) return;

        // PDF coordinate system: origin at bottom-left, Y goes up
        // Canvas coordinate system: origin at top-left, Y goes down
        const pageHeight = viewport.height / scale;

        overlayCtx.fillStyle = "rgba(16, 185, 129, 0.15)"; // emerald with transparency
        overlayCtx.strokeStyle = "rgba(16, 185, 129, 0.5)";
        overlayCtx.lineWidth = 1.5;

        for (const bbox of pageBboxes) {
          // Convert from PDF coords (BOTTOMLEFT) to canvas coords
          const x = bbox.l * scale;
          const w = (bbox.r - bbox.l) * scale;

          let y: number;
          let h: number;
          if (bbox.coord_origin === "BOTTOMLEFT" || !bbox.coord_origin) {
            // BOTTOMLEFT: t is higher (larger Y in PDF = higher on page)
            y = (pageHeight - bbox.t) * scale;
            h = (bbox.t - bbox.b) * scale;
          } else {
            // TOPLEFT: standard
            y = bbox.t * scale;
            h = (bbox.b - bbox.t) * scale;
          }

          // Add some padding
          const pad = 2;
          overlayCtx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
          overlayCtx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
        }
      });
    });

    return () => { cancelled = true; };
  }, [currentPage, scale, bboxes]);

  const goPage = useCallback((delta: number) => {
    setCurrentPage((p) => Math.max(1, Math.min(numPages, p + delta)));
  }, [numPages]);

  const adjustZoom = useCallback((delta: number) => {
    setScale((s) => Math.max(0.5, Math.min(3, s + delta)));
  }, []);

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 p-6">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">Back to text</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border/50 flex items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Text
        </button>

        <div className="w-px h-4 bg-border/40" />

        {/* Page nav */}
        <button
          onClick={() => goPage(-1)}
          disabled={currentPage <= 1}
          className={cn("p-0.5 rounded", currentPage > 1 ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20")}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {currentPage} / {numPages}
        </span>
        <button
          onClick={() => goPage(1)}
          disabled={currentPage >= numPages}
          className={cn("p-0.5 rounded", currentPage < numPages ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20")}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border/40" />

        {/* Zoom */}
        <button onClick={() => adjustZoom(-0.2)} className="p-0.5 text-muted-foreground hover:text-foreground">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => adjustZoom(0.2)} className="p-0.5 text-muted-foreground hover:text-foreground">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        {/* Part info */}
        <div className="ml-auto flex items-center gap-2">
          {pageRange && (
            <span className="text-[9px] text-muted-foreground/40 tabular-nums">{pageRange}</span>
          )}
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px]">
            {part.title || "Untitled"}
          </span>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-900 flex justify-center p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-6 h-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full" />
          </div>
        ) : (
          <div className="relative inline-block shadow-2xl">
            <canvas ref={canvasRef} className="block" />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 pointer-events-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
