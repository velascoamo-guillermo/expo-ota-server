import { DAU_WINDOW_DAYS, zeroFillDAUStats } from '../apiUtils/helpers/DAUHelper';

describe('zeroFillDAUStats', () => {
  const today = new Date('2026-08-01T12:34:56Z');

  it('fills the full 30-day window with zeros when there are no stats', () => {
    const filled = zeroFillDAUStats([], today);

    expect(filled).toHaveLength(DAU_WINDOW_DAYS);
    expect(filled[0]).toEqual({ date: '2026-07-03', ios: 0, android: 0 });
    expect(filled[filled.length - 1]).toEqual({ date: '2026-08-01', ios: 0, android: 0 });
    expect(filled.every((s) => s.ios === 0 && s.android === 0)).toBe(true);
  });

  it('keeps existing values and zero-fills the gaps', () => {
    const filled = zeroFillDAUStats(
      [
        { date: '2026-07-15', ios: 3, android: 1 },
        { date: '2026-08-01', ios: 2, android: 5 },
      ],
      today
    );

    expect(filled).toHaveLength(DAU_WINDOW_DAYS);
    expect(filled.find((s) => s.date === '2026-07-15')).toEqual({
      date: '2026-07-15',
      ios: 3,
      android: 1,
    });
    expect(filled[filled.length - 1]).toEqual({ date: '2026-08-01', ios: 2, android: 5 });
    expect(filled.find((s) => s.date === '2026-07-16')).toEqual({
      date: '2026-07-16',
      ios: 0,
      android: 0,
    });
  });

  it('produces dates in ascending order', () => {
    const filled = zeroFillDAUStats([], today);
    const sorted = [...filled].sort((a, b) => a.date.localeCompare(b.date));
    expect(filled).toEqual(sorted);
  });

  it('drops stats outside the 30-day window', () => {
    const filled = zeroFillDAUStats([{ date: '2026-06-01', ios: 9, android: 9 }], today);

    expect(filled).toHaveLength(DAU_WINDOW_DAYS);
    expect(filled.find((s) => s.date === '2026-06-01')).toBeUndefined();
    expect(filled.every((s) => s.ios === 0 && s.android === 0)).toBe(true);
  });

  it('handles month boundaries in the window', () => {
    const filled = zeroFillDAUStats([], new Date('2026-03-05T00:00:00Z'));

    expect(filled[0].date).toBe('2026-02-04');
    expect(filled.some((s) => s.date === '2026-02-28')).toBe(true);
    expect(filled.some((s) => s.date === '2026-03-01')).toBe(true);
    expect(filled[filled.length - 1].date).toBe('2026-03-05');
  });
});
