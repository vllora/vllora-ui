import React from 'react';

interface LocalModelsSkeletonLoaderProps {
  viewMode?: 'grid' | 'table';
  count?: number;
}

export const LocalModelsSkeletonLoader: React.FC<LocalModelsSkeletonLoaderProps> = ({
  viewMode = 'grid',
  count = 9,
}) => {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="relative overflow-hidden rounded-xl bg-card border border-border p-5 animate-pulse"
          >
            <div className="flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-muted rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </div>

              {/* Model Details */}
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-muted rounded w-16" />
                  <div className="flex gap-1.5">
                    <div className="w-6 h-6 bg-muted rounded" />
                    <div className="w-6 h-6 bg-muted rounded" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-muted rounded w-12" />
                  <div className="h-3 bg-muted rounded w-20" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-muted rounded w-14" />
                  <div className="h-3 bg-muted rounded w-24" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Table skeleton
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
      {/* Table Header */}
      <div className="bg-secondary border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-[40%] h-4 bg-muted rounded" />
          <div className="w-[20%] h-4 bg-muted rounded" />
          <div className="w-[25%] h-4 bg-muted rounded" />
          <div className="w-[15%] h-4 bg-muted rounded" />
        </div>
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-border">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="w-[40%] h-5 bg-muted rounded" />
              <div className="w-[20%] flex gap-1.5">
                <div className="w-6 h-6 bg-muted rounded" />
                <div className="w-6 h-6 bg-muted rounded" />
              </div>
              <div className="w-[25%] h-4 bg-muted rounded" />
              <div className="w-[15%] h-4 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};