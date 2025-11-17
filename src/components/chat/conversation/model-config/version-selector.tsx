import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";
import { ModelConfigDialogConsumer } from "./useModelConfigDialog";

export function VersionSelector() {
  const { virtualModels } = VirtualModelsConsumer();
  const { virtualModelSlug, selectedVersion, onVersionChange } = ModelConfigDialogConsumer();

  const virtualModel = useMemo(() => {
    return virtualModels.find((vm) => vm.slug === virtualModelSlug);
  }, [virtualModels, virtualModelSlug]);

  if (!virtualModel || !virtualModel.versions || virtualModel.versions.length === 0) {
    return null;
  }

  // Sort versions in descending order (newest first)
  const sortedVersions = useMemo(() => {
    return [...virtualModel.versions].sort((a, b) => b.version - a.version);
  }, [virtualModel.versions]);

  const handleVersionChange = (value: string) => {
    const versionNumber = parseInt(value, 10);
    onVersionChange?.(versionNumber);
  };

  const formatDate = (dateString: string) => {
    // Backend sends naive UTC timestamps without timezone info
    // Remove microseconds and ensure 'Z' suffix to mark as UTC, then convert to browser's local time
    // Input example: "2025-11-17T04:56:47.736088" -> "2025-11-17T04:56:47Z"
    const cleanedDateStr = dateString.replace(/(\.\d+)?$/, 'Z');
    const date = new Date(cleanedDateStr);

    if (isNaN(date.getTime())) {
      return dateString; // fallback if parsing fails
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short', // Shows timezone abbreviation
    }).format(date);
  };

  return (
    <div className="space-y-2 gap-1.5">
      <Label htmlFor="version-select" className="text-sm font-semibold flex items-center gap-1">
        Version
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Select which version to edit. Changes will be saved to this version.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Label>
      <Select
        value={selectedVersion?.toString()}
        onValueChange={handleVersionChange}
      >
        <SelectTrigger id="version-select">
          <SelectValue placeholder="Select a version" />
        </SelectTrigger>
        <SelectContent>
          {sortedVersions.map((version) => (
            <SelectItem key={version.id} value={version.version.toString()}>
              <div className="flex items-center gap-2">
                <span>v{version.version}</span>
                {version.latest && (
                  <Badge variant="secondary" className="text-xs">
                    Latest
                  </Badge>
                )}
                {version.published_at && (
                  <Badge variant="outline" className="text-xs">
                    Published
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-2">
                  {formatDate(version.created_at)}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
