import { useState } from "react";
import { Input } from "@/components/ui/input";

interface DetectedVariablesProps {
  variables: string[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onRenameVariable: (oldName: string, newName: string) => void;
}

interface VariableRowProps {
  variable: string;
  value: string;
  onValueChange: (value: string) => void;
  onRename: (oldName: string, newName: string) => void;
}

function VariableRow({ variable, value, onValueChange, onRename }: VariableRowProps) {
  const [editingName, setEditingName] = useState(variable);

  const handleBlur = () => {
    if (editingName && editingName !== variable && /^\w+$/.test(editingName)) {
      onRename(variable, editingName);
    } else {
      // Reset to original if invalid
      setEditingName(variable);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditingName(variable);
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">{"{{"}</span>
        <Input
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-7 w-24 text-xs font-mono px-1.5"
        />
        <span className="text-xs text-muted-foreground">{"}}"}</span>
      </div>
      <span className="text-muted-foreground">=</span>
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="value"
        className="h-7 text-sm flex-1"
      />
    </div>
  );
}

export function DetectedVariables({
  variables,
  values,
  onChange,
  onRenameVariable,
}: DetectedVariablesProps) {
  if (variables.length === 0) {
    return null;
  }

  const handleValueChange = (variable: string, value: string) => {
    onChange({ ...values, [variable]: value });
  };

  const handleRename = (oldName: string, newName: string) => {
    // Update the values record with the new key
    const newValues = { ...values };
    if (oldName in newValues) {
      newValues[newName] = newValues[oldName];
      delete newValues[oldName];
    }
    onChange(newValues);
    // Rename in messages
    onRenameVariable(oldName, newName);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Variables
        </span>
        <span className="text-[10px] text-muted-foreground">
          Name / Value
        </span>
      </div>
      <div className="p-3 space-y-2">
        {variables.map((variable) => (
          <VariableRow
            key={variable}
            variable={variable}
            value={values[variable] || ""}
            onValueChange={(value) => handleValueChange(variable, value)}
            onRename={handleRename}
          />
        ))}
      </div>
    </div>
  );
}
