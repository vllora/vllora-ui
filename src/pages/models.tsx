import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { LocalModelsExplorer } from '@/components/models/local/LocalModelsExplorer';
import { LocalModelsSkeletonLoader } from '@/components/models/local/LocalModelsSkeletonLoader';
import { ProjectModelsConsumer } from '@/contexts/ProjectModelsContext';
import { Button } from '@/components/ui/button';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
import { useMemo } from 'react';
import { useNavigate } from "react-router";

// Helper function to determine model type based on provider info
function getModelType(providerName: string, providersData: any[]): 'remote' | 'opensource' | 'local' | 'unknown' {
  const provider = providersData.find(p => p.name.toLowerCase() === providerName.toLowerCase());
  
  if (!provider) {
    return 'unknown';
  }
  
  // Use provider_type if available
  if (provider.provider_type) {
    const type = provider.provider_type.toLowerCase();
    if (type.includes('api_key') || type.includes('aws') || type.includes('vertex')) {
      return 'remote';
    } else if (type.includes('local') || type.includes('ollama') || type.includes('self-hosted')) {
      return 'local';
    } else if (type.includes('opensource') || type.includes('open-source')) {
      return 'opensource';
    }
  }
  
  // Fallback to known remote providers
  const knownRemoteProviders = [
    'openai', 'anthropic', 'google', 'gemini', 'bedrock', 'azure', 'vertexai', 
    'cohere', 'mistral', 'groq', 'deepseek', 'xai', 'zai', 'fireworksai', 
    'deepinfra', 'together-ai', 'togetherai', 'openrouter', 'parasail', 
    'perplexity', 'lambda', 'huggingface', 'replicate', 'banana', 'modal',
    'runpod', 'vast', 'beam', 'beam.cloud', 'octoai', 'octo', 'baseten',
    'cerebrium', 'infermatic', 'infermaticai', 'nousresearch', 'pygmalionai',
    'upstage', 'minimax', 'moonshot', 'stepfun', 'qwen', 'bytedance', 'baidu',
    'tencent', 'liquid', 'mancer', 'switchpoint', 'agentica', 'aionlabs',
    'arcee', 'arli', 'inflection', 'amazon', 'microsoft', 'nvidia', 'meta'
  ];
  
  if (knownRemoteProviders.includes(providerName.toLowerCase())) {
    return 'remote';
  }
  
  return 'unknown';
}

export function ModelsPage(props: {
  hideBackBtn?: boolean;
}) {
  const { hideBackBtn } = props;
  const { models: localModels, loading: localLoading, error: localError } = ProjectModelsConsumer();
  const { providers } = ProviderKeysConsumer();
  const navigate = useNavigate();

  // Create provider configuration status mapping from /providers API
  // has_credentials === true means the provider has actual credentials configured
  const providerStatusMap = useMemo(() => {
    const map = new Map<string, boolean>();
    providers.forEach(p => {
      if (p?.name) {
        map.set(p.name.toLowerCase(), p.is_custom ? true : p.has_credentials);
      }
    });
    return map;
  }, [providers]);

  return (
    <section className="flex-1 flex flex-col overflow-auto bg-background text-foreground w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
        
        {/* Page Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            {!hideBackBtn && (
              <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>)}
            <h1 className="text-3xl font-bold">Browse Models</h1>
          </div>
          <p className="text-muted-foreground">
            Explore and filter all available AI models
          </p>
        </div>

        {/* Loading State */}
        {localLoading && (
          <div className="flex flex-col space-y-6">
            <LocalModelsSkeletonLoader viewMode="table" count={12} />
          </div>
        )}

        {/* Error State */}
        {localError && !localLoading && (
          <div className="flex flex-col items-center justify-center py-12 bg-card border border-border rounded-lg">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h3 className="text-xl font-semibold text-card-foreground mb-2">Failed to Load Models</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              {localError.message}
            </p>
            <Button
              onClick={() => {}}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          </div>
        )}

        {/* Local Models Explorer with Full Filters (Table View Only) */}
        {!localLoading && !localError && (
          <div className="relative">
            <LocalModelsExplorer
              models={localModels}
              showViewModeToggle={false}
              showStats={true}
              statsTitle="Models"
              providers={providers}
              providerStatusMap={providerStatusMap}
              getModelType={getModelType}
              defaultView="table"
            />
          </div>
        )}
      </div>
    </section>
  );
}

