import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Settings } from 'lucide-react';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { LocalModelProviderInfo } from '@/types/models';

interface MultiProviderConfigDialogProps {
  open: boolean;
  providers: LocalModelProviderInfo[];
  onOpenChange: (open: boolean) => void;
  onProviderSelect: (providerName: string) => void;
}

export const MultiProviderConfigDialog: React.FC<MultiProviderConfigDialogProps> = ({
  open,
  providers,
  onOpenChange,
  onProviderSelect,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Provider</DialogTitle>
          <DialogDescription>
            Select a provider to configure credentials
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {providers.map((providerInfo, idx) => {
            const provider = providerInfo.provider;
            return (
              <button
                key={`${provider.provider}-${idx}`}
                onClick={() => onProviderSelect(provider.provider)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors cursor-pointer"
              >
                <ProviderIcon
                  provider_name={provider.provider}
                  className="w-8 h-8 flex-shrink-0"
                />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">
                    {provider.provider}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Click to configure credentials
                  </p>
                </div>
                <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
