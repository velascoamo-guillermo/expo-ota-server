import { DAUStat } from '../database/DatabaseInterface';

export const DAU_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Expands sparse per-day stats into the full trailing window (UTC days, ascending),
 * inserting { ios: 0, android: 0 } for days without check-ins. Stats outside the
 * window are dropped. Single zero-fill point shared by all database backends.
 */
export function zeroFillDAUStats(stats: DAUStat[], today: Date = new Date()): DAUStat[] {
  const byDate = new Map(stats.map((stat) => [stat.date, stat]));
  const endUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const filled: DAUStat[] = [];
  for (let offset = DAU_WINDOW_DAYS - 1; offset >= 0; offset--) {
    const date = new Date(endUtc - offset * MS_PER_DAY).toISOString().slice(0, 10);
    const existing = byDate.get(date);
    filled.push(
      existing
        ? { date, ios: existing.ios, android: existing.android }
        : { date, ios: 0, android: 0 }
    );
  }
  return filled;
}
