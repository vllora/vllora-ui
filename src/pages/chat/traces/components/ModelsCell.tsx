import { ListProviders } from '@/components/chat/thread/ListProviders';
import { CellWrapper } from './CellWrapper';
import { getShortModelName, getProvidersByNames } from './utils';

interface ModelsCellProps {
  models: string[];
}

export const ModelsCell = ({ models }: ModelsCellProps) => {
  // Group models by provider
  const providers = getProvidersByNames(models);

  return (
    <CellWrapper className="justify-start min-w-[150px] overflow-hidden">
      <div className="flex items-center flex-1 overflow-hidden justify-start gap-1 truncate cursor-help">
        <ListProviders
          maxVisibleProviders={2}
          providersInfo={providers}
          textDisplay={() => (
            <span className="text-xs ml-2 text-muted-foreground hover:cursor-pointer">
              {models.length === 0
                ? 'No model'
                : models.length > 1
                  ? `${models.length} models used`
                  : getShortModelName(models[0])}
            </span>
          )}
        />
      </div>
    </CellWrapper>
  );
};
