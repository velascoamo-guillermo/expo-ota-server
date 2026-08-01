import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { DownloadStat } from '../../../apiUtils/database/DatabaseInterface';
import {
  DOWNLOADS_WINDOW_DAYS,
  zeroFillDownloadStats,
} from '../../../apiUtils/helpers/DownloadsHelper';

export interface DownloadsSeriesResponse {
  stats: DownloadStat[];
}

function parseDays(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return DOWNLOADS_WINDOW_DAYS;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!/^\d+$/.test(value)) return null;
  const days = Number(value);
  if (days < 1 || days > 365) return null;
  return days;
}

export default async function downloadsSeriesHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const days = parseDays(req.query.days);
  if (days === null) {
    res.status(400).json({ error: 'days must be an integer between 1 and 365' });
    return;
  }

  try {
    const channel = (req.query.channel as string) ?? undefined;
    const stats = await DatabaseFactory.getDatabase().getDownloadsTimeSeries(channel, days);
    res.status(200).json({ stats: zeroFillDownloadStats(stats, days) });
  } catch (error) {
    console.error('Failed to fetch download stats:', error);
    res.status(500).json({ error: 'Failed to fetch download stats' });
  }
}
