import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { getLogger } from '../../../apiUtils/logger';
import { TrackingMetrics } from '../../../apiUtils/database/DatabaseInterface';

const logger = getLogger('allTrackingHandler');

export interface AllTrackingResponse {
  trackings: TrackingMetrics[];
  totalReleases: number;
  channels: string[];
}

export default async function allTrackingHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const channel = (req.query.channel as string) ?? null;

  logger.info('Fetching all tracking data', { channel });

  try {
    const database = DatabaseFactory.getDatabase();

    const [trackings, releases, channels] = await Promise.all([
      channel
        ? database.getReleaseTrackingMetricsByChannel(channel)
        : database.getReleaseTrackingMetricsForAllReleases(),
      database.listReleases(),
      database.listChannels(),
    ]);

    const totalReleases = channel
      ? releases.filter((r) => r.channel === channel).length
      : releases.length;

    res.status(200).json({ trackings, totalReleases, channels });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
}
