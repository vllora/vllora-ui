import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

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
    <div className="space-y-3">
      {/* Existing headers */}
      {headerEntries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <Input
            value={key}
            onChange={(e) => handleUpdate(key, e.target.value, value)}
            placeholder="Header name"
            className="flex-1 h-8 text-sm"
          />
          <Input
            value={value}
            onChange={(e) => handleUpdate(key, key, e.target.value)}
            placeholder="Value"
            className="flex-1 h-8 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRemove(key)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}

      {/* Add new header */}
      <div className="flex items-center gap-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Header name"
          className="flex-1 h-8 text-sm"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Value"
          className="flex-1 h-8 text-sm"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="h-8 w-8 text-muted-foreground hover:text-[rgb(var(--theme-500))]"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {headerEntries.length === 0 && !newKey && (
        <p className="text-xs text-muted-foreground">
          Add custom headers like x-label, x-thread-id, etc.
        </p>
      )}
    </div>
  );
}
