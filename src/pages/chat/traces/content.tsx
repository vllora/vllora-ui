
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { RunTable } from "./run-table";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";

export function TracesPageContent() {
  const { detailSpan, spansOfSelectedRun, setSelectedSpanId } = TracesPageConsumer();

  return <div className="flex w-full flex-row flex-1 h-full">
    <div className='flex flex-1 flex-row'>
      <RunTable />
    </div>
    {detailSpan && (
      <div className="w-[40vw]">
        <SpanDetailPanel
          span={detailSpan}
          relatedSpans={spansOfSelectedRun}
          onClose={() => setSelectedSpanId(null)}
        />
      </div>
    )}
  </div>;
}


