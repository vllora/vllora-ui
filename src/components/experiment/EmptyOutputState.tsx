interface EmptyOutputStateProps {
  title: string;
  message: string;
}

export function EmptyOutputState({ title, message }: EmptyOutputStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 bg-muted/30 border-b border-dashed border-border flex items-center gap-2 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        {message}
      </div>
    </div>
  );
}
