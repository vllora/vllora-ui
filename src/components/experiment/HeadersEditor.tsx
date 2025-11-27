import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

interface HeadersEditorProps {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
}

export function HeadersEditor({ headers, onChange }: HeadersEditorProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const headerEntries = Object.entries(headers || {});

  const handleAdd = () => {
    if (newKey.trim()) {
      onChange({
        ...headers,
        [newKey.trim()]: newValue,
      });
      setNewKey("");
      setNewValue("");
    }
  };

  const handleRemove = (key: string) => {
    const newHeaders = { ...headers };
    delete newHeaders[key];
    onChange(newHeaders);
  };

  const handleUpdate = (oldKey: string, newKey: string, value: string) => {
    const newHeaders = { ...headers };
    if (oldKey !== newKey) {
      delete newHeaders[oldKey];
    }
    newHeaders[newKey] = value;
    onChange(newHeaders);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {/* Column headers */}
      {(headerEntries.length > 0 || newKey) && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider">
          <span className="flex-1 px-1">Name</span>
          <span className="flex-1 px-1">Value</span>
          <span className="w-7" />
        </div>
      )}

      {/* Existing headers */}
      {headerEntries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2 group">
          <Input
            value={key}
            onChange={(e) => handleUpdate(key, e.target.value, value)}
            placeholder="Header name"
            className="flex-1 h-8 text-sm font-mono bg-muted/50 border-transparent focus:border-border focus:bg-background"
          />
          <Input
            value={value}
            onChange={(e) => handleUpdate(key, key, e.target.value)}
            placeholder="Value"
            className="flex-1 h-8 text-sm font-mono bg-muted/50 border-transparent focus:border-border focus:bg-background"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRemove(key)}
            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}

      {/* Add new header */}
      <div className="flex items-center gap-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="x-custom-header"
          className="flex-1 h-8 text-sm font-mono"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="value"
          className="flex-1 h-8 text-sm font-mono"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="h-7 w-7 text-muted-foreground hover:text-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-500)/0.1)] disabled:opacity-30"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
