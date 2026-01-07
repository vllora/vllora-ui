/**
 * MermaidRenderer
 *
 * Renders Mermaid diagrams from text definitions.
 * Used for visualizing agent execution flows, span hierarchies, etc.
 */

import { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';
import { cn } from '@/lib/utils';

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
  },
  sequence: {
    useMaxWidth: true,
    wrap: true,
  },
});

export interface MermaidRendererProps {
  /** The mermaid diagram definition */
  chart: string;
  /** Optional className for styling */
  className?: string;
}

export function MermaidRenderer({ chart, className }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, '-');

  useEffect(() => {
    const renderChart = async () => {
      if (!chart.trim()) {
        setError('Empty diagram definition');
        return;
      }

      try {
        // Validate the syntax first
        await mermaid.parse(chart);

        // Render the diagram
        const { svg: renderedSvg } = await mermaid.render(
          `mermaid-${uniqueId}`,
          chart
        );
        setSvg(renderedSvg);
        setError(null);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
        setSvg('');
      }
    };

    renderChart();
  }, [chart, uniqueId]);

  if (error) {
    return (
      <div className={cn('p-4 bg-destructive/10 border border-destructive/20 rounded-lg', className)}>
        <p className="text-sm text-destructive font-medium mb-2">Diagram Error</p>
        <pre className="text-xs text-muted-foreground overflow-auto">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">Show source</summary>
          <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-auto">{chart}</pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'mermaid-container bg-muted/30 rounded-lg p-4 overflow-auto',
        className
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default MermaidRenderer;
