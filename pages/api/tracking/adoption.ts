import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { AdoptionStat } from '../../../apiUtils/database/DatabaseInterface';

export interface AdoptionResponse {
  stats: AdoptionStat[];
}

export default async function adoptionHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const channel = req.query.channel as string;
  if (!channel) {
    res.status(400).json({ error: 'channel is required' });
    return;
  }

  try {
    const stats = await DatabaseFactory.getDatabase().getAdoptionStats(channel);
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Failed to fetch adoption stats:', error);
    res.status(500).json({ error: 'Failed to fetch adoption stats' });
  }
}
