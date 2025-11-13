export function SpansSkeletonLoader() {
  return (
    <div className="p-4 space-y-3">
      {/* Timeline markers skeleton */}
      <div className="flex justify-between text-xs mb-2 px-8">
        <div className="h-3 bg-neutral-800/40 rounded w-8 animate-pulse" />
        <div className="h-3 bg-neutral-800/40 rounded w-10 animate-pulse" style={{ animationDelay: '0.1s' }} />
        <div className="h-3 bg-neutral-800/40 rounded w-10 animate-pulse" style={{ animationDelay: '0.2s' }} />
        <div className="h-3 bg-neutral-800/40 rounded w-10 animate-pulse" style={{ animationDelay: '0.3s' }} />
        <div className="h-3 bg-neutral-800/40 rounded w-10 animate-pulse" style={{ animationDelay: '0.4s' }} />
      </div>

      {/* Span rows skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
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
