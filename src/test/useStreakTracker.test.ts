import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useStreakTracker } from '@/hooks/useStreakTracker';

describe('useStreakTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 streak for empty data', () => {
    expect(useStreakTracker([])).toEqual({ streak: 0, todayActivity: false });
  });

  it('returns 0 streak for undefined data', () => {
    expect(useStreakTracker(undefined)).toEqual({ streak: 0, todayActivity: false });
  });

  it('detects activity today as streak of 1', () => {
    const today = new Date();
    vi.setSystemTime(today);
    const data = [{ created_at: today.toISOString() }];
    expect(useStreakTracker(data)).toEqual({ streak: 1, todayActivity: true });
  });

  it('counts consecutive days including today', () => {
    const today = new Date('2026-07-30T12:00:00Z');
    vi.setSystemTime(today);

    const data = [
      { created_at: '2026-07-30T10:00:00Z' },
      { created_at: '2026-07-29T10:00:00Z' },
      { created_at: '2026-07-28T10:00:00Z' },
    ];
    expect(useStreakTracker(data)).toEqual({ streak: 3, todayActivity: true });
  });

  it('counts streak from yesterday if no activity today', () => {
    const today = new Date('2026-07-30T12:00:00Z');
    vi.setSystemTime(today);

    const data = [
      { created_at: '2026-07-29T10:00:00Z' },
      { created_at: '2026-07-28T10:00:00Z' },
    ];
    expect(useStreakTracker(data)).toEqual({ streak: 2, todayActivity: false });
  });

  it('returns 0 if gap in consecutive days', () => {
    const today = new Date('2026-07-30T12:00:00Z');
    vi.setSystemTime(today);

    const data = [
      { created_at: '2026-07-30T10:00:00Z' },
      { created_at: '2026-07-28T10:00:00Z' },
    ];
    expect(useStreakTracker(data)).toEqual({ streak: 1, todayActivity: true });
  });

  it('handles multiple entries on the same day', () => {
    const today = new Date('2026-07-30T12:00:00Z');
    vi.setSystemTime(today);

    const data = [
      { created_at: '2026-07-30T08:00:00Z' },
      { created_at: '2026-07-30T10:00:00Z' },
      { created_at: '2026-07-29T10:00:00Z' },
    ];
    expect(useStreakTracker(data)).toEqual({ streak: 2, todayActivity: true });
  });
});
