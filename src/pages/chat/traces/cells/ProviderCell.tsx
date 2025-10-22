import { ProviderIcon } from "@/components/Icons/ProviderIcons";

interface ProviderCellProps {
  providers: string[];
}

export function ProviderCell({ providers }: ProviderCellProps) {
  if (providers.length === 0) {
    return <div className="flex items-center gap-2 py-3 px-3 h-full" />;
  }

  // Show first provider icon
  if (providers.length === 1) {
    return (
      <div className="flex items-center gap-2 py-3 px-3 h-full">
        <ProviderIcon
          provider_name={providers[0]}
          className="h-5 w-5 rounded-full flex-shrink-0"
        />
        <span className="text-xs text-muted-foreground">
          {providers[0]}
        </span>
      </div>
    );
  }

  // Show 2 icons + count for 4+ providers
  return (
    <div className="flex items-center gap-2 py-3 px-3 h-full">
      <div className="flex items-center">
        <ProviderIcon
          provider_name={providers[0]}
          className="h-5 w-5 rounded-full flex-shrink-0 border-2 border-background"
        />
        <ProviderIcon
          provider_name={providers[1]}
          className="h-5 w-5 rounded-full flex-shrink-0 -ml-2 border-2 border-background"
        />
      </div>
      <span className="text-xs text-muted-foreground">
        +{providers.length - 2}
      </span>
    </div>
  );
}
