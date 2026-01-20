import { useMemo } from 'react';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { TraceListHeader } from './list-header';
import { isActualModelCall } from '@/utils/span-to-message';

export const TraceHeader = (props: {
  threadId?: string
}) => {
  const {
    refreshRuns,
    loadingMoreRuns,
    openTraces,
    fetchSpansByRunId,
    isSpanSelectModeEnabled,
    setIsSpanSelectModeEnabled,
    selectedSpanIdsForActions,
    setSelectedSpanIdsForActions,
    clearSpanSelection,
    flattenSpans,
  } = ChatWindowConsumer();

  const { threadId } = props;
  const hasOpenTraces = openTraces && openTraces.length > 0;

  // Get model call spans for selection
  const modelCallSpans = useMemo(() => {
    return flattenSpans.filter(span => isActualModelCall(span));
  }, [flattenSpans]);

  const handleToggleSelectMode = () => {
    if (isSpanSelectModeEnabled) {
      clearSpanSelection();
    } else {
      setIsSpanSelectModeEnabled(true);
    }
  };

  const handleSelectAll = () => {
    const allSpanIds = modelCallSpans.map(span => span.span_id);
    setSelectedSpanIdsForActions(allSpanIds);
  };

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
      isSelectModeEnabled={isSpanSelectModeEnabled}
      onToggleSelectMode={handleToggleSelectMode}
      selectedCount={selectedSpanIdsForActions.length}
      totalCount={modelCallSpans.length}
      onSelectAll={handleSelectAll}
    />
  );
};
