import { DownloadStat } from '../database/DatabaseInterface';

export const DOWNLOADS_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Expands sparse per-day download counts into the full trailing window (UTC days,
 * ascending), inserting { count: 0 } for days without downloads. Stats outside the
 * window are dropped. Single zero-fill point shared by all database backends;
 * mirrors zeroFillDAUStats (DAUHelper).
 */
export function zeroFillDownloadStats(
  stats: DownloadStat[],
  days: number = DOWNLOADS_WINDOW_DAYS,
  today: Date = new Date()
): DownloadStat[] {
  const byDate = new Map(stats.map((stat) => [stat.date, stat]));
  const endUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const filled: DownloadStat[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(endUtc - offset * MS_PER_DAY).toISOString().slice(0, 10);
    const existing = byDate.get(date);
    filled.push(existing ? { date, count: existing.count } : { date, count: 0 });
  }
  return filled;
}
