# ThreadsContext Refactoring

This directory contains the refactored ThreadsContext, split into focused, maintainable hooks.

## Architecture

The original 437-line `useThreads` hook has been refactored into smaller, single-responsibility hooks:

### Files

- **types.ts** (31 lines) - Shared TypeScript interfaces
  - `ThreadChanges` - Structure for tracking thread message changes
  - `ThreadState` - Base thread state (threads, setThreads, selectedThreadId)
  - `ThreadPaginationState` - Pagination state and loading flags
  - `ThreadChangesState` - Thread changes state and setters

- **utils.ts** (23 lines) - Helper functions
  - `convertToTime()` - Converts various date string formats to Date objects
  - `sortThreads()` - Sorts threads by updated_at timestamp
  - `formatTimestampToDateString()` - Formats timestamps to "yyyy-MM-dd HH:mm:ss"

- **useThreadState.ts** (20 lines) - Base state management
  - Manages `threads` array state
  - Extracts `selectedThreadId` from URL query params
  - Returns: `{ threads, setThreads, selectedThreadId }`

- **useThreadChanges.ts** (143 lines) - Real-time change tracking
  - Tracks message changes for unread indicators
  - Clears changes when user views a thread
  - Handles `TextMessageStart`, `TextMessageContent`, `TextMessageEnd` events
  - Handles `ThreadModelStart` and `MessageCreated` events
  - Updates thread timestamps when changes occur
  - Returns: `{ threadsHaveChanges, setThreadsHaveChanges, onThreadMessageHaveChanges, onThreadModelStartEvent, onThreadMessageCreated }`

- **useThreadPagination.ts** (119 lines) - Loading and pagination
  - Manages offset, total, hasMore, loading states
  - `refreshThreads()` - Loads first page of threads
  - `loadMoreThreads()` - Loads additional pages
  - Handles errors and loading states
  - Returns: `{ offset, total, hasMore, loading, loadingMore, loadingThreadsError, refreshThreads, loadMoreThreads }`

- **useThreadOperations.ts** (181 lines) - CRUD operations
  - `renameThread()` - Updates thread title (local + API)
  - `deleteThread()` - Deletes thread via API
  - `deleteDraftThread()` - Deletes local draft and handles navigation
  - `addThread()` - Adds new thread to list
  - `updateThread()` - Updates thread with partial data
  - `updateThreadCost()` - Updates thread cost and token usage
  - `addThreadByEvent()` - Adds/updates thread from event data
  - Returns: `{ renameThread, deleteThread, deleteDraftThread, addThread, updateThread, updateThreadCost, addThreadByEvent }`

- **index.ts** (6 lines) - Barrel exports for cleaner imports

## Main Context Composition

**ThreadsContext.tsx** (71 lines, down from 437)

The main `useThreads` hook now composes all smaller hooks:

```typescript
export function useThreads({ projectId }: ThreadsProviderProps) {
  // Base state management
  const threadState = useThreadState();

  // Thread changes tracking
  const threadChangesState = useThreadChanges(threadState);

  // Pagination and loading
  const paginationState = useThreadPagination(projectId, threadState, threadChangesState);

  // CRUD operations
  const operations = useThreadOperations(projectId, threadState, paginationState.refreshThreads);

  return {
    // Flattened return object combining all hook returns
  };
}
```

## Benefits

1. **Maintainability** - Each hook has a single, clear responsibility
2. **Readability** - 71-line main file vs 437-line monolithic hook
3. **Testability** - Each hook can be tested independently
4. **Reusability** - Hooks can be composed differently if needed
5. **Type Safety** - Shared types ensure consistency across hooks

## Migration

No changes required for consumers! The public API remains identical:
- `ThreadsProvider` - Same props and behavior
- `ThreadsConsumer()` - Same return type
- All functions and state properties unchanged
