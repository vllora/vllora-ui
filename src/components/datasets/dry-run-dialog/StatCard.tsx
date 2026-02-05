/**
 * StatCard
 *
 * Simple card for displaying a statistic label and value.
 */

interface StatCardProps {
  label: string;
  value: string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-base font-mono font-semibold text-zinc-200 mt-0.5">{value}</p>
    </div>
  );
}
