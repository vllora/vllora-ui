export function GroupsSkeletonLoader() {
  return (
    <div className="flex-1 w-full h-full overflow-auto p-4">
      <div className="flex flex-col gap-3 mx-auto">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-lg bg-[#0a0a0a] overflow-hidden animate-pulse"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            {/* Header skeleton */}
            <div className="py-2 px-5 bg-[#171717]">
              <div className="flex items-center justify-between gap-4">
                {/* Left side - Chevron and Time */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Chevron skeleton */}
                  <div className="w-4 h-4 bg-neutral-800 rounded" />

                  {/* Time skeleton */}
                  <div className="h-4 bg-neutral-800 rounded w-24" />
                </div>

                {/* Right side - Stats columns */}
                <div className="flex items-center gap-6 flex-shrink-0 text-xs">
                  {/* Model calls */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="h-3 bg-neutral-800/40 rounded w-20" />
                    <div className="h-4 bg-neutral-800 rounded w-8" />
                  </div>

                  {/* Cost */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="h-3 bg-neutral-800/40 rounded w-12" />
                    <div className="h-4 bg-neutral-800 rounded w-16" />
                  </div>

                  {/* Tokens */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="h-3 bg-neutral-800/40 rounded w-16" />
                    <div className="h-4 bg-neutral-800 rounded w-12" />
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded content skeleton - simulating timeline */}
            {i <= 2 && (
              <div className="border-l border-r border-border/50 p-4 space-y-3">
                {/* Timeline markers skeleton */}
                <div className="flex justify-between text-xs mb-2">
                  <div className="h-3 bg-neutral-800/40 rounded w-8" />
                  <div className="h-3 bg-neutral-800/40 rounded w-10" />
                  <div className="h-3 bg-neutral-800/40 rounded w-10" />
                  <div className="h-3 bg-neutral-800/40 rounded w-10" />
                  <div className="h-3 bg-neutral-800/40 rounded w-10" />
                </div>

                {/* Span rows skeleton */}
                {[1, 2, 3].map((spanIdx) => (
                  <div key={spanIdx} className="flex items-center gap-3">
                    {/* Model icon */}
                    <div className="w-6 h-6 bg-neutral-800 rounded-full flex-shrink-0" />

                    {/* Model name */}
                    <div className="h-4 bg-neutral-800 rounded w-20" />

                    {/* Duration */}
                    <div className="h-4 bg-neutral-800/60 rounded w-12" />

                    {/* Timeline bar */}
                    <div className="flex-1 relative h-2">
                      <div
                        className="absolute h-full bg-neutral-800/60 rounded"
                        style={{
                          left: `${Math.random() * 30}%`,
                          width: `${10 + Math.random() * 30}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
