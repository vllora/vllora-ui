export const formatDuration = (milliseconds: number): string => {
    // Less than 1 second: show in ms
    if (milliseconds < 1000) {
      return `${milliseconds.toFixed(0)}ms`;
    }
  
    // Less than 60 seconds: show in seconds
    if (milliseconds < 60000) {
      const seconds = milliseconds / 1000;
      return `${seconds.toFixed(2)}s`;
    }
  
    // 60 seconds or more: show in minutes and seconds
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = (milliseconds % 60000) / 1000;
  
    if (seconds === 0) {
      return `${minutes}m`;
    }
  
    return `${minutes}m ${seconds.toFixed(0)}s`;
  }