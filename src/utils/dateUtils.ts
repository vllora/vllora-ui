/**
 * Format a date string to a readable time format
 * @param dateString ISO date string to format
 * @returns Formatted time string (e.g., "2:30 PM" or "Jun 26, 2:30 PM")
 */
import { differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns';

/// dateString have format 2025-10-08T04:06:41.405607Z
export const formatMessageTime = (dateString?: string): string => {
  if (!dateString) return '';

  // Handle both formats:
  // - ISO with Z: "2025-10-08T04:06:41.405607Z"
  // - Space-separated: "2025-09-29 14:11:50.395000"
  let isoString = dateString;
  if (!dateString.includes('T')) {
    isoString = dateString.replace(' ', 'T');
  }
  if (!isoString.endsWith('Z')) {
    isoString += 'Z';
  }

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const secondsAgo = differenceInSeconds(now, date);

  // For recent traces (< 60 minutes), show relative time
  if (secondsAgo < 60) {
    if(secondsAgo < 1) {
      return 'Just now';
    }
    return `${secondsAgo} seconds ago`;
  }
  // For traces from today, show time only
  if (now.toDateString() === date.toDateString()) {
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    
    });
    return `${time}`;
  }
  // For traces within the last week, show day and time
  const daysAgo = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysAgo <= 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${dayName} ${time}`;
  }

  // For older traces, show month/day and time
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return `${month} ${day} ${time}`;
};



/// dateString have format 2025-10-08T04:06:41.405607Z
export const formatThreadTime = (dateString?: string): string => {
  if (!dateString) return '';

  // Handle both formats:
  // - ISO with Z: "2025-10-08T04:06:41.405607Z"
  // - Space-separated: "2025-09-29 14:11:50.395000"
  let isoString = dateString;
  if (!dateString.includes('T')) {
    isoString = dateString.replace(' ', 'T');
  }
  if (!isoString.endsWith('Z')) {
    isoString += 'Z';
  }

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const secondsAgo = differenceInSeconds(now, date);
  // For recent traces (< 60 minutes), show relative time
  if (secondsAgo < 60) {
    if(secondsAgo  <= 1) {
      return 'Just now';
    }
    return `${secondsAgo} seconds ago`;
  }
  const minutesAgo = differenceInMinutes(now, date);
  if(minutesAgo < 60) {
    if(minutesAgo  <= 1) {
      return 'a minute ago';
    }
    return `${minutesAgo} minutes ago`;
  }

  const hoursAgo = differenceInHours(now, date);


  if(hoursAgo < 24) {
    if(hoursAgo <= 1) {
      return 'an hour ago';
    }
    return `${hoursAgo} hours ago`;
  }
  // For traces from today, show time only
  if (now.toDateString() === date.toDateString()) {
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    
    });
    return `${time}`;
  }
  // For traces within the last week, show day and time
  const daysAgo = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysAgo <= 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${dayName} ${time}`;
  }

  // For older traces, show month/day and time
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return `${month} ${day} ${time}`;
};
