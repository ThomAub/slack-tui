/**
 * Time formatting utilities
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format a Slack timestamp as a human-readable time
 */
export function formatSlackTs(ts: string, relative = true): string {
  const epochSeconds = parseFloat(ts);
  const date = new Date(epochSeconds * 1000);

  if (relative) {
    return formatRelativeTime(date);
  }

  return formatAbsoluteTime(date);
}

/**
 * Format a Date as relative time (e.g., "5m ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);

  if (diff < 0) {
    return 'just now';
  }

  if (diff < MINUTE) {
    return 'just now';
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes}m ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }

  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }

  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK);
    return `${weeks}w ago`;
  }

  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return `${months}mo ago`;
  }

  const years = Math.floor(diff / YEAR);
  return `${years}y ago`;
}

/**
 * Format a Date as absolute time (e.g., "10:32 AM")
 */
export function formatAbsoluteTime(date: Date): string {
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const isThisYear = date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return time;
  }

  const dayMonth = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  if (isThisYear) {
    return `${dayMonth} ${time}`;
  }

  const year = date.getFullYear();
  return `${dayMonth}, ${year} ${time}`;
}

/**
 * Parse a Slack timestamp to a Date
 */
export function parseSlackTs(ts: string): Date {
  const epochSeconds = parseFloat(ts);
  return new Date(epochSeconds * 1000);
}

/**
 * Get current time as a Slack-style timestamp
 */
export function nowSlackTs(): string {
  return (Date.now() / 1000).toFixed(6);
}
