import { fetchRunSpans, Span } from '@/services/runs-api';

/**
 * Helper function to fetch all spans for a run ID with pagination
 * Fetches all pages until no more data is available
 *
 * @param runId - The run ID to fetch spans for
 * @param projectId - The project ID
 * @returns Array of all spans for the run
 */
export const fetchAllSpansByRunId = async (
  runId: string,
  projectId: string
): Promise<Span[]> => {
  let haveMore = true;
  let relatedSpans: Span[] = [];
  let offset = 0;
  let limit = 100;

  while (haveMore) {
    const { data: dataRelatedSpans, pagination } = await fetchRunSpans({
      runId,
      projectId,
      offset,
      limit,
    });
    relatedSpans.push(...dataRelatedSpans);

    if (dataRelatedSpans.length === 0) {
      haveMore = false;
      break;
    }

    haveMore = pagination.offset + pagination.limit < pagination.total;
    offset += pagination.limit;
  }

  return relatedSpans;
};
