/**
 * PlatformDownload
 *
 * Component for displaying platform-specific download options for Distri.
 * Auto-detects user's platform and shows appropriate download button.
 */

import { useState } from 'react';
import { Download, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PlatformInfo } from './useDistriSetup';

// ============================================================================
// Types
// ============================================================================

interface PlatformDownloadProps {
  /** Detected platform info */
  platform: PlatformInfo;
  /** All available platforms */
  allPlatforms: PlatformInfo[];
  /** Optional className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function PlatformDownload({
  platform,
  allPlatforms,
  className,
}: PlatformDownloadProps) {
  const [showOtherPlatforms, setShowOtherPlatforms] = useState(false);

  // Filter out the detected platform from the "other" list
  const otherPlatforms = allPlatforms.filter(
    (p) => !(p.os === platform.os && p.arch === platform.arch)
  );

  const handleDownload = (downloadUrl: string) => {
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Detected platform */}
      <div className="text-xs text-muted-foreground">
        Detected: {platform.osLabel} ({platform.arch})
      </div>

      {/* Primary download button */}
      <Button
        variant="secondary"
        size="sm"
        className="w-full justify-start gap-2"
        onClick={() => handleDownload(platform.downloadUrl)}
      >
        <Download className="h-4 w-4" />
        Download {platform.binary}
        <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
      </Button>

      {/* Other platforms toggle */}
      <button
        onClick={() => setShowOtherPlatforms(!showOtherPlatforms)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showOtherPlatforms ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        Other platforms
      </button>

      {/* Other platforms list */}
      {showOtherPlatforms && (
        <div className="space-y-1.5 pl-2 border-l border-border">
          {otherPlatforms.map((p) => (
            <button
              key={`${p.os}-${p.arch}`}
              onClick={() => handleDownload(p.downloadUrl)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <Download className="h-3 w-3" />
              <span>{p.osLabel}</span>
              <span className="opacity-50">({p.binary})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PlatformDownload;
