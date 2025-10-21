
import { SpanDetailPanel } from "@/components/debug/SpanDetailPanel";
import { RunTable } from "./run-table";
import { TracesPageConsumer } from "@/contexts/TracesPageContext";

export function TracesPageContent() {
  const { detailSpan, spansOfSelectedRun, setDetailSpanId } = TracesPageConsumer();
  return <div className="flex flex-row flex-1 h-full overflow-hidden">
    <div className={`flex flex-col transition-all duration-300 ${detailSpan ? 'w-[60%]' : 'w-full'} h-full`}>
      <RunTable />
    </div>
    {detailSpan && (
      <div className="w-[40%] h-full animate-in slide-in-from-right duration-300 border-l border-border overflow-auto">
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


