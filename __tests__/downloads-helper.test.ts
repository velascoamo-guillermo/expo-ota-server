import { DOWNLOADS_WINDOW_DAYS, zeroFillDownloadStats } from '../apiUtils/helpers/DownloadsHelper';

describe('zeroFillDownloadStats', () => {
  const today = new Date('2026-08-01T12:34:56Z');

  it('fills the full default 30-day window with zeros when there are no stats', () => {
    const filled = zeroFillDownloadStats([], DOWNLOADS_WINDOW_DAYS, today);

    expect(DOWNLOADS_WINDOW_DAYS).toBe(30);
    expect(filled).toHaveLength(DOWNLOADS_WINDOW_DAYS);
    expect(filled[0]).toEqual({ date: '2026-07-03', count: 0 });
    expect(filled[filled.length - 1]).toEqual({ date: '2026-08-01', count: 0 });
    expect(filled.every((s) => s.count === 0)).toBe(true);
  });

  it('respects a custom window length', () => {
    const filled = zeroFillDownloadStats([], 7, today);

    expect(filled).toHaveLength(7);
    expect(filled[0]).toEqual({ date: '2026-07-26', count: 0 });
    expect(filled[filled.length - 1]).toEqual({ date: '2026-08-01', count: 0 });
  });

  it('keeps existing values and zero-fills the gaps', () => {
    const filled = zeroFillDownloadStats(
      [
        { date: '2026-07-15', count: 3 },
        { date: '2026-08-01', count: 5 },
      ],
      30,
      today
    );

    expect(filled).toHaveLength(30);
    expect(filled.find((s) => s.date === '2026-07-15')).toEqual({ date: '2026-07-15', count: 3 });
    expect(filled[filled.length - 1]).toEqual({ date: '2026-08-01', count: 5 });
    expect(filled.find((s) => s.date === '2026-07-16')).toEqual({ date: '2026-07-16', count: 0 });
  });

  it('produces dates in ascending order', () => {
    const filled = zeroFillDownloadStats([], 30, today);
    const sorted = [...filled].sort((a, b) => a.date.localeCompare(b.date));
    expect(filled).toEqual(sorted);
  });

  it('drops stats outside the window', () => {
    const filled = zeroFillDownloadStats([{ date: '2026-06-01', count: 9 }], 30, today);

    expect(filled).toHaveLength(30);
    expect(filled.find((s) => s.date === '2026-06-01')).toBeUndefined();
    expect(filled.every((s) => s.count === 0)).toBe(true);
  });

  it('handles month boundaries in the window', () => {
    const filled = zeroFillDownloadStats([], 30, new Date('2026-03-05T00:00:00Z'));

    expect(filled[0].date).toBe('2026-02-04');
    expect(filled.some((s) => s.date === '2026-02-28')).toBe(true);
    expect(filled.some((s) => s.date === '2026-03-01')).toBe(true);
    expect(filled[filled.length - 1].date).toBe('2026-03-05');
  });
});
