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
    <div className="rounded-md border bg-card p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-medium">{value}</p>
    </div>
  );
}
