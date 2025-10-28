import { v5 as uuidv5 } from 'uuid';
import { Span } from '@/types/common-type';
import { RunMap } from '../useSpanDetails';

const NAMESPACE_UUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace UUID
const ONE_HOUR_IN_MICROSECONDS = 60 * 60 * 1000 * 1000; // 1 hour in microseconds
const ONE_MINUTE_IN_MICROSECONDS = 60 * 1000 * 1000; // 1 minute in microseconds

export type BucketConfig =
  | { unit: 'hour'; size: number }
  | { unit: 'minute'; size: number };

/**
 * Groups spans by time buckets based on their start_time_us
 * Each bucket gets a deterministic UUID generated from the bucket timestamp
 *
 * @param spans - Array of spans to group
 * @param config - Bucket configuration. Can be:
 *   - { unit: 'hour', size: 1 } for 1-hour buckets
 *   - { unit: 'hour', size: 2 } for 2-hour buckets
 *   - { unit: 'minute', size: 5 } for 5-minute buckets
 *   - { unit: 'minute', size: 30 } for 30-minute buckets
 *   - Or a number for backward compatibility (hours)
 * @returns RunMap where keys are bucket UUIDs and values are arrays of spans in that time bucket
 */
export function groupSpansByTimeBucket(spans: Span[], config: BucketConfig | number = { unit: 'hour', size: 1 }): RunMap {
  // Handle backward compatibility with number parameter
  const bucketConfig: BucketConfig = typeof config === 'number'
    ? { unit: 'hour', size: config }
    : config;

  const bucketSizeInMicroseconds = bucketConfig.unit === 'hour'
    ? bucketConfig.size * ONE_HOUR_IN_MICROSECONDS
    : bucketConfig.size * ONE_MINUTE_IN_MICROSECONDS;

  const bucketLabel = `${bucketConfig.size}${bucketConfig.unit}`;

  return spans.reduce((acc, span) => {
    // Calculate the time bucket (floor to the start of the bucket period)
    const timeBucket = Math.floor(span.start_time_us / bucketSizeInMicroseconds) * bucketSizeInMicroseconds;

    // Generate a deterministic UUID for this time bucket
    const bucketKey = uuidv5(`${bucketLabel}_bucket_${timeBucket}`, NAMESPACE_UUID);

    if (!acc[bucketKey]) {
      acc[bucketKey] = [];
    }
    acc[bucketKey].push(span);
    return acc;
  }, {} as RunMap);
}



/**
 * Gets the time bucket timestamp for a given microsecond timestamp
 *
 * @param timestampUs - Timestamp in microseconds
 * @param config - Bucket configuration (unit and size)
 * @returns The floored time bucket timestamp in microseconds
 */
export function getTimeBucket(timestampUs: number, config: BucketConfig | number = { unit: 'hour', size: 1 }): number {
  const bucketConfig: BucketConfig = typeof config === 'number'
    ? { unit: 'hour', size: config }
    : config;

  const bucketSizeInMicroseconds = bucketConfig.unit === 'hour'
    ? bucketConfig.size * ONE_HOUR_IN_MICROSECONDS
    : bucketConfig.size * ONE_MINUTE_IN_MICROSECONDS;

  return Math.floor(timestampUs / bucketSizeInMicroseconds) * bucketSizeInMicroseconds;
}

/**
 * Generates a deterministic UUID for a given time bucket
 *
 * @param timeBucketUs - Time bucket timestamp in microseconds
 * @param config - Bucket configuration (unit and size)
 * @returns UUID string for the bucket
 */
export function generateBucketUUID(timeBucketUs: number, config: BucketConfig | number = { unit: 'hour', size: 1 }): string {
  const bucketConfig: BucketConfig = typeof config === 'number'
    ? { unit: 'hour', size: config }
    : config;

  const bucketLabel = `${bucketConfig.size}${bucketConfig.unit}`;
  return uuidv5(`${bucketLabel}_bucket_${timeBucketUs}`, NAMESPACE_UUID);
}

/**
 * @deprecated Use getTimeBucket instead
 */
export function getHourBucket(timestampUs: number): number {
  return getTimeBucket(timestampUs, { unit: 'hour', size: 1 });
}
