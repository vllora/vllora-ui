/**
 * StepBadge
 *
 * Green numbered badge used by the API initialize tab cards.
 * Matches the reference design's rounded green badge with white number.
 */

export function StepBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-500))] text-xs font-bold">
      {children}
    </span>
  );
}
