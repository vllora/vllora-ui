import React, { useMemo } from 'react';
import { EventItem } from './EventItem';
import { DebugEvent } from '@/hooks/events/useDebugEvents';

interface EventTimelineProps {
  events: DebugEvent[];
  filters: {
    eventTypes: string[];
    searchQuery: string;
    threadId?: string;
    runId?: string;
  };
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events, filters }) => {
  // Filter events based on criteria
  const filteredEvents = useMemo(() => {
    return events.filter((debugEvent) => {
      const event = debugEvent.event;

      // Filter by event type
      if (filters.eventTypes.length > 0 && !filters.eventTypes.includes(event.type)) {
        return false;
      }

      // Filter by thread ID
      if (filters.threadId && event.thread_id !== filters.threadId) {
        return false;
      }

      // Filter by run ID
      if (filters.runId && event.run_id !== filters.runId) {
        return false;
      }

      // Filter by search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const eventStr = JSON.stringify(debugEvent).toLowerCase();
        return eventStr.includes(query);
      }

      return true;
    });
  }, [events, filters]);

  if (filteredEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">No events to display</p>
          <p className="text-sm mt-1">
            {events.length === 0
              ? 'Waiting for events...'
              : 'Try adjusting your filters'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Event count */}
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50 bg-muted/20">
        Showing {filteredEvents.length} of {events.length} events
      </div>

      {/* Events list */}
      <div className="flex-1">
        {filteredEvents.map((event, index) => (
          <EventItem key={`${event.receivedAt}-${index}`} event={event} />
        ))}
      </div>
    </div>
  );
};
