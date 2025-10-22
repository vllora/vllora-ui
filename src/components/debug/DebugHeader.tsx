import { Pause, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DebugHeaderProps {
  isPaused: boolean;
  pausedCount: number;
  flattenSpansCount: number;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
}

export function DebugHeader({
  isPaused,
  pausedCount,
  flattenSpansCount,
  onPause,
  onResume,
  onClear,
}: DebugHeaderProps) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold">Debug Console</h1>
          <p className="text-sm text-muted-foreground">
            Real-time span hierarchy with parent-child relationships
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Pause/Resume */}
          {isPaused ? (
            <Button
              variant="default"
              size="sm"
              onClick={onResume}
              className="h-9"
            >
              <Play className="w-4 h-4 mr-2" />
              Resume
              {pausedCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-background/20 rounded text-xs">
                  +{pausedCount}
                </span>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onPause}
              className="h-9"
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
          )}

          {/* Clear */}
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={flattenSpansCount === 0}
            className="h-9"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
