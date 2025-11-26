import { ContentDisplay } from "./ContentDisplay";

interface OriginalOutputSectionProps {
  content: string;
}

export function OriginalOutputSection({ content }: OriginalOutputSectionProps) {
  if (!content) return null;

  return (
    <div className="rounded-lg flex-1 flex flex-col border border-dashed border-border overflow-hidden mt-4 flex-shrink-0">
      <div className="px-3 py-2 bg-muted/50 border-b border-dashed border-border">
        <span className="text-xs font-medium text-muted-foreground">
          Original Output
        </span>
      </div>
      <div className="p-3 flex-1 overflow-y-scroll text-sm">
        <ContentDisplay
          content={content}
          className="text-muted-foreground"
        />
      </div>
    </div>
  );
}
