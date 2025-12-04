import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { TraceListHeader } from './list-header';

export const TraceHeader = (props: {
  threadId?: string
}) => {
  const {
    refreshRuns,
    loadingMoreRuns,
    openTraces,
    fetchSpansByRunId,
  } = ChatWindowConsumer();

  const { threadId } = props;
  const hasOpenTraces = openTraces && openTraces.length > 0;

  return (
    <TraceListHeader
      threadId={threadId}
      onRefresh={() => {
        refreshRuns();
        if (hasOpenTraces) {
          fetchSpansByRunId(openTraces[0].run_id);
        }
      }}
      isLoading={loadingMoreRuns}
    />
  );
};
