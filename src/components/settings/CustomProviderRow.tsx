import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';

interface CustomProviderRowProps {
  provider: {
    name: string;
    endpoint?: string;
  };
  modelCount?: number;
  onEdit: () => void;
  onAddModel: () => void;
}

export function CustomProviderRow({
  provider,
  modelCount = 0,
  onEdit,
  onAddModel,
}: CustomProviderRowProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer"
      onClick={onEdit}
    >
      <div className="flex items-center gap-3">
        <ProviderIcon provider_name={provider.name} className="w-6 h-6" />
        <div>
          <span className="font-medium">{provider.name}</span>
          {provider.endpoint && (
            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
              {provider.endpoint}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onAddModel();
          }}
          className="h-8 px-2 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          title="Add model"
        >
          <Plus className="h-3 w-3 mr-1" />
          Model
        </Button>
        <span className="text-xs text-muted-foreground">
          {modelCount} {modelCount === 1 ? 'model' : 'models'}
        </span>
      </div>
    </div>
  );
}
