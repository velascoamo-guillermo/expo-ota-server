import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';

export default async function releasesHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = DatabaseFactory.getDatabase();
    const channel = (req.query.channel as string) ?? null;
    const [allReleases, downloadCounts] = await Promise.all([
      db.listReleases(),
      db.getDownloadCountsPerRelease(),
    ]);
    const filtered = channel ? allReleases.filter((r) => r.channel === channel) : allReleases;
    const releases = filtered.map((r) => ({ ...r, downloadCount: downloadCounts[r.id] ?? 0 }));
    res.status(200).json({ releases });
  } catch (error) {
    console.error('Failed to fetch releases:', error);
    res.status(500).json({ error: 'Failed to fetch releases' });
  }
}
