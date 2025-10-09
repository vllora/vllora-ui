import React from 'react';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TraceDetailHeaderProps {
    currentTab: 'trace' | 'code';
    onTabChange: (tab: 'trace' | 'code') => void;
    onBack: () => void;
    onRefresh: () => void;
    isLoading: boolean;
  }

 export const TraceDetailHeader: React.FC<TraceDetailHeaderProps> = ({
    currentTab,
    onTabChange,
    onBack,
    onRefresh,
    isLoading
  }) => {
    return (
      <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-card/95 backdrop-blur-xl flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-muted/50 rounded-md p-1">
            <button
              onClick={() => onTabChange('trace')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                currentTab === 'trace'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Trace
            </button>
            <button
              onClick={() => onTabChange('code')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                currentTab === 'code'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Code
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-8 w-8"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>
    );
  };