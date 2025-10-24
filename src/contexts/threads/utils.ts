import { Thread } from '@/types/chat';
import { format } from 'date-fns';

export const convertToTime = (dateString: string): Date => {
  // handle case like this: "Thu Jul 10 2025 12:59:06 GMT+0700 (Indochina Time)"
  if (dateString.includes('GMT')) {
    return new Date(dateString);
  }
  const isoString = dateString.replace(/(\d{4}-\d{2}-\d{2})\s+(.+)/, '$1T$2Z');
  return new Date(isoString);
};

export const sortThreads = (threads: Thread[]): Thread[] => {
  return [...threads].sort((a, b) => {
    return a.finish_time_us - b.finish_time_us;
  });
};

export const formatTimestampToDateString = (timestamp: number): string => {
  return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss');
};
