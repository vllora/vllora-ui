import { Sparkles, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { ModelsExplorer } from '@/components/models/ModelsExplorer';
import { useModels } from '@/hooks/useModels';
import { Button } from '@/components/ui/button';

export function HomePage() {
  const { models, loading, error, refetch } = useModels();

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-zinc-950 text-white w-full" aria-label="AI Models Gallery">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-5xl lg:text-6xl font-bold mb-4">
            <span className="block sm:inline-block">AI Models</span>{' '}
            <span className="block sm:inline-block bg-gradient-to-r from-zinc-200 to-zinc-400 bg-clip-text text-transparent mt-2 sm:mt-0">
              Gallery
            </span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Discover and compare the latest AI models from leading providers
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Sparkles className="w-4 h-4 text-zinc-500" />
            <span className="text-sm text-zinc-500">
              Updated with the newest models
            </span>
          </div>
        </header>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-4" />
            <p className="text-zinc-400">Loading models...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 bg-zinc-900 border border-zinc-800 rounded-lg">
            <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Failed to Load Models</h2>
            <p className="text-zinc-400 text-center max-w-md mb-4">
              {error.message}
            </p>
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          </div>
        )}

        {/* Models Explorer */}
        {!loading && !error && (
          <ModelsExplorer
            models={models}
            showViewModeToggle={true}
            showStats={true}
            statsTitle="AI Models Ecosystem"
          />
        )}

      </div>
    </section>
  );
}