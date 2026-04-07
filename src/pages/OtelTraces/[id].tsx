import { OtelTraceDetailView } from '@/components/OtelTraces/OtelTraceDetailView';

export function OtelTraceDetailPage() {
  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground">
      <OtelTraceDetailView />
    </section>
  );
}
