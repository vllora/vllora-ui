
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { RunTable } from "./run-table";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";

export function TracesPageContent() {
  const { detailSpan, spansOfSelectedRun, setDetailSpanId } = TracesPageConsumer();
  return <div className="flex w-full flex-row flex-1 h-full relative">
    <div className={`flex flex-row transition-all duration-300 ${detailSpan ? 'w-[60vw]' : 'w-full'}`}>
      <RunTable />
    </div>
    {detailSpan && (
      <div className="w-[40vw] animate-in slide-in-from-right duration-300 border-l border-border">
        <SpanDetailPanel
          span={detailSpan}
          relatedSpans={spansOfSelectedRun}
          onClose={() => {
            setDetailSpanId(null);
          }}
        />
      </div>
    )}
  </div>;
}


