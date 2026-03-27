import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { Release } from '../../apiUtils/database/DatabaseInterface';

export interface ChannelSummary {
  name: string;
  activeRelease: Release | null;
  totalReleases: number;
  totalDownloads: number;
  iosDownloads: number;
  androidDownloads: number;
}

export interface ChannelsResponse {
  channels: ChannelSummary[];
}

export default async function channelsHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const database = DatabaseFactory.getDatabase();
    const [allReleases, channelNames] = await Promise.all([
      database.listReleases(),
      database.listChannels(),
    ]);

    const channels: ChannelSummary[] = await Promise.all(
      channelNames.map(async (name) => {
        const channelReleases = allReleases.filter((r) => r.channel === name);
        const activeRelease = channelReleases[0] ?? null;

        const metrics = await database.getReleaseTrackingMetricsByChannel(name);
        const iosDownloads = metrics.find((m) => m.platform === 'ios')?.count ?? 0;
        const androidDownloads = metrics.find((m) => m.platform === 'android')?.count ?? 0;

        return {
          name,
          activeRelease,
          totalReleases: channelReleases.length,
          totalDownloads: iosDownloads + androidDownloads,
          iosDownloads,
          androidDownloads,
        };
      })
    );

    res.status(200).json({ channels });
  } catch {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
}
