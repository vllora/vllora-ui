import { GenericGroupDTO, isRunGroup, isThreadGroup, isTimeGroup } from "@/services/groups-api";

/**
 * Creates a unique key for a group based on its type
 * @param group - The group to create a key for
 * @returns A unique string key for the group, or null if the group type is unknown
 */
export function getGroupKey(group: GenericGroupDTO): string | null {
  if (isTimeGroup(group)) {
    return `time-${group.group_key.time_bucket}`;
  } else if (isThreadGroup(group)) {
    return `thread-${group.group_key.thread_id}`;
  } else if (isRunGroup(group)) {
    return `run-${group.group_key.run_id}`;
  }
  return null; // Unknown group type
}