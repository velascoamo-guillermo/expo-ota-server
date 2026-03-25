import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { MAUStat } from '../../../apiUtils/database/DatabaseInterface';

export interface MAUResponse {
  stats: MAUStat[];
}

export default async function mauHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const channel = (req.query.channel as string) ?? undefined;
    const stats = await DatabaseFactory.getDatabase().getMAUStats(channel);
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Failed to fetch MAU stats:', error);
    res.status(500).json({ error: 'Failed to fetch MAU stats' });
  }
}
