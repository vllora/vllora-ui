import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";

interface FallbackModelSelectProps {
  value: string;
  availableModels: string[];
  onValueChange: (value: string) => void;
  getDisplayName: (model: string) => string;
  getProviderForModel: (model: string) => string;
}

export function FallbackModelSelect({
  value,
  availableModels,
  onValueChange,
  getDisplayName,
  getProviderForModel,
}: FallbackModelSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const showSearch = availableModels.length > 5;

  const filteredModels = searchTerm
    ? availableModels.filter((model) => {
        const lowerSearch = searchTerm.toLowerCase();
        const displayName = getDisplayName(model).toLowerCase();
        const provider = getProviderForModel(model).toLowerCase();
        return displayName.includes(lowerSearch) || provider.includes(lowerSearch);
      })
    : availableModels;

  const handleValueChange = (newValue: string) => {
    onValueChange(newValue);
    setSearchTerm("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setSearchTerm("");
  };

  return (
    <Select
      value={value || undefined}
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
    >
      <SelectTrigger className="flex-1 focus:ring-0">
        {value ? (
          <div className="flex items-center gap-2 w-full">
            <ProviderIcon
              provider_name={getProviderForModel(value)}
              className="w-4 h-4 flex-shrink-0"
            />
            <span className="truncate">{getDisplayName(value)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Select fallback model</span>
        )}
      </SelectTrigger>
      <SelectContent>
        {showSearch && (
          <div className="p-2 border-b" onKeyDown={(e) => e.stopPropagation()}>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9"
                autoFocus
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </div>
          </div>
        )}
        {filteredModels.length > 0 ? (
          filteredModels.map((availableModel) => (
            <SelectItem key={availableModel} className="" value={availableModel}>
              <div className="flex items-center gap-2">
                <ProviderIcon
                  provider_name={getProviderForModel(availableModel)}
                  className="w-4 h-4 flex-shrink-0"
                />
                <span>{getDisplayName(availableModel)}</span>
              </div>
            </SelectItem>
          ))
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No models found
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
