export const LoadingState: React.FC = () => {
  return (
    <div className="p-4 space-y-4">
      {/* Timeline skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 items-start animate-pulse">
            {/* Icon skeleton */}
            <div className="w-8 h-8 bg-neutral-800 rounded-md flex-shrink-0" />

            {/* Content skeleton */}
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-neutral-800 rounded w-1/3" />
              <div className="h-3 bg-neutral-800/60 rounded w-2/3" />
              <div className="flex gap-2 mt-2">
                <div className="h-6 bg-neutral-800/40 rounded w-16" />
                <div className="h-6 bg-neutral-800/40 rounded w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
