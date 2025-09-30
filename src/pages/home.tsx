import { Sparkles, AlertCircle, Loader2, RefreshCw, Server } from 'lucide-react';
import { LocalModelsExplorer } from '@/components/models/LocalModelsExplorer';
import { useLocalModels } from '@/hooks/useLocalModels';
import { Button } from '@/components/ui/button';

export function HomePage() {
  const { models: localModels, loading: localLoading, error: localError, refetch: localRefetch } = useLocalModels();

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-zinc-950 text-white w-full" aria-label="AI Models Gallery">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-5xl lg:text-6xl font-bold mb-4">
            <span className="block sm:inline-block">Local AI Models</span>{' '}
            <span className="block sm:inline-block bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent mt-2 sm:mt-0">
              Gallery
            </span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Browse and manage your locally running AI models
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Server className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-zinc-500">
              Running on <span className="text-emerald-400 font-medium">localhost:8080</span>
            </span>
          </div>
        </header>

        {/* Loading State */}
        {localLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
            <p className="text-zinc-400">Loading local models...</p>
          </div>
        )}

        {/* Error State */}
        {localError && !localLoading && (
          <div className="flex flex-col items-center justify-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
            <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Failed to Load Local Models</h2>
            <p className="text-zinc-400 text-center max-w-md mb-4">
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