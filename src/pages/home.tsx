import { AlertCircle, RefreshCw, Server } from 'lucide-react';
import { LocalModelsExplorer } from '@/components/models/local/LocalModelsExplorer';
import { LocalModelsSkeletonLoader } from '@/components/models/local/LocalModelsSkeletonLoader';
import { LocalModelsConsumer } from '@/contexts/LocalModelsContext';
import { Button } from '@/components/ui/button';
import { getBackendUrl } from '@/config/api';

export function HomePage() {
  const { models: localModels, loading: localLoading, error: localError, refetchModels: localRefetch } = LocalModelsConsumer();

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full" aria-label="AI Models Gallery">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-5xl lg:text-6xl font-bold mb-4">
            <span className="block sm:inline-block">Local AI Models</span>{' '}
            <span className="block sm:inline-block bg-gradient-to-r from-[rgb(var(--theme-400))] to-[rgb(var(--theme-600))] bg-clip-text text-transparent mt-2 sm:mt-0">
              Gallery
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Browse and manage your locally running AI models
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Server className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            <span className="text-sm text-muted-foreground">
              Running on <span className="text-[rgb(var(--theme-500))] font-medium">{getBackendUrl()}</span>
            </span>
          </div>
        </header>

        {/* Loading State */}
        {localLoading && (
          <div className="flex flex-col space-y-6">
            {/* Filters Skeleton */}
            <div className="space-y-4 animate-pulse">
              <div className="h-14 bg-muted/50 border border-border rounded-lg" />
              <div className="flex gap-2">
                <div className="h-10 w-32 bg-muted/50 border border-border rounded-full" />
                <div className="h-10 w-32 bg-muted/50 border border-border rounded-full" />
              </div>
            </div>

            {/* View Mode Toggle Skeleton */}
            <div className="flex justify-between items-center animate-pulse">
              <div className="h-5 w-48 bg-muted rounded" />
              <div className="flex gap-2">
                <div className="h-9 w-20 bg-muted rounded" />
                <div className="h-9 w-20 bg-muted rounded" />
              </div>
            </div>

            {/* Models Grid Skeleton */}
            <LocalModelsSkeletonLoader viewMode="grid" count={9} />
          </div>
        )}

        {/* Error State */}
        {localError && !localLoading && (
          <div className="flex flex-col items-center justify-center py-12 bg-card border border-border rounded-lg">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold text-card-foreground mb-2">Failed to Load Local Models</h2>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              {localError.message}
            </p>
            <Button
              onClick={() => localRefetch()}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          </div>
        )}

        {/* Local Models Explorer */}
        {!localLoading && !localError && (
          <LocalModelsExplorer
            models={localModels}
            showViewModeToggle={true}
            showStats={true}
            statsTitle="Local Models"
          />
        )}

      </div>
    </section>
  );
}