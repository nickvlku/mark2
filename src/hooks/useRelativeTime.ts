'use client';

import { useState, useEffect } from 'react';

/**
 * Calculate relative time string from a date.
 * Returns a stable value during SSR to avoid hydration mismatch.
 */
export function useRelativeTime(dateStr: string | undefined, refreshIntervalMs = 60000): string {
  const [relativeTime, setRelativeTime] = useState<string>('');

  useEffect(() => {
    if (!dateStr) {
      setRelativeTime('');
      return;
    }

    const calculate = () => {
      const now = Date.now();
      const then = new Date(dateStr).getTime();
      const diff = now - then;
      const mins = Math.floor(diff / 60000);

      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.floor(hours / 24);
      return `${days}d`;
    };

    setRelativeTime(calculate());

    // Refresh periodically
    const interval = setInterval(() => {
      setRelativeTime(calculate());
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [dateStr, refreshIntervalMs]);

  return relativeTime;
}

/**
 * Calculate if a lock is expired.
 * Returns false during SSR to avoid hydration mismatch.
 */
export function useIsLockExpired(lockedAt: string | undefined, timeoutDays = 5): boolean {
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!lockedAt) {
      setIsExpired(false);
      return;
    }

    const lockTime = new Date(lockedAt).getTime();
    const now = Date.now();
    const timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;
    setIsExpired(now - lockTime > timeoutMs);
  }, [lockedAt, timeoutDays]);

  return isExpired;
}

/**
 * Format timestamp with relative time for recent entries.
 * Returns empty string during SSR to avoid hydration mismatch.
 */
export function useFormattedTimestamp(ts: string | undefined): string {
  const [formatted, setFormatted] = useState('');

  useEffect(() => {
    if (!ts) {
      setFormatted('');
      return;
    }

    const d = new Date(ts);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      setFormatted('just now');
    } else if (diffMins < 60) {
      setFormatted(`${diffMins}m ago`);
    } else {
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) {
        setFormatted(`${diffHours}h ago`);
      } else {
        setFormatted(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
      }
    }
  }, [ts]);

  return formatted;
}

/**
 * Calculate lock age in days.
 * Returns empty string during SSR to avoid hydration mismatch.
 */
export function useLockAge(lockedAt: string | undefined): string {
  const [age, setAge] = useState('');

  useEffect(() => {
    if (!lockedAt) {
      setAge('');
      return;
    }

    const lockDate = new Date(lockedAt);
    const now = Date.now();
    const diffDays = Math.floor((now - lockDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      setAge('today');
    } else if (diffDays === 1) {
      setAge('yesterday');
    } else {
      setAge(`${diffDays}d ago`);
    }
  }, [lockedAt]);

  return age;
}
