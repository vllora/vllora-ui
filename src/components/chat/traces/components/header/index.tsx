import React from 'react';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { TraceListHeader } from './list-header';



export const TraceHeader: React.FC<any> = () => {
  const {
    refreshRuns,
    loadingMoreRuns,
    openTraces,
    fetchSpansByRunId,
  } = ChatWindowConsumer();

  const hasOpenTraces = openTraces && openTraces.length > 0;
  // const currentTab = hasOpenTraces ? openTraces[0].tab : 'trace';

  // const handleTabChange = (tab: 'trace' | 'code') => {
  //   if (hasOpenTraces) {
  //     setOpenTraces([{ ...openTraces[0], tab }]);
  //   }
  // };

  // if (hasOpenTraces) {
  //   return (
  //     <TraceDetailHeader
  //       currentTab={currentTab}
  //       onTabChange={handleTabChange}
  //       onRefresh={()=>{
  //         fetchSpansByRunId(openTraces[0].run_id);
  //       }}
  //       isLoading={loadingMoreRuns}
  //     />
  //   );
  // }

  return (
    <TraceListHeader
      onRefresh={()=>{
        refreshRuns();
        if(hasOpenTraces){
          fetchSpansByRunId(openTraces[0].run_id);
        }
      }}
      isLoading={loadingMoreRuns}
    />
  );
};
