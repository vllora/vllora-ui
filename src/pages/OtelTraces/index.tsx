import { OtelTracesProvider } from '@/contexts/OtelTracesContext';
import { OtelTraceListView } from '@/components/OtelTraces/OtelTraceListView';

export function OtelTracesPage() {
  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground">
      <OtelTracesProvider>
        <OtelTraceListView />
      </OtelTracesProvider>
    </section>
  );
}
